<?php

declare(strict_types=1);

namespace App\Services\Tasks;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Services\Finance\PaymentBoard;
use App\Services\Inventory\StockPermissions;
use App\Services\TransferWorkflowService;
use Illuminate\Support\Facades\Route;
use Throwable;

/**
 * What the signed-in user has to do next, for the top bar's bell.
 *
 * There is no notification system yet: these are live counts read from the
 * same places the work screens read, so a task disappears the moment it is
 * done. Each task links to the screen where it is done; links into another
 * app (the seller inbox from the admin app, say) are absolute.
 *
 * Shape: resources/js/types/tasks.ts.
 */
class TaskInbox
{
    public function __construct(private readonly PaymentBoard $payments)
    {
    }

    /**
     * @return array<int, array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool}>
     */
    public function for(User $user): array
    {
        $tasks = [];
        $role = $user->roleKey();
        $storeId = $user->store_id !== null ? (int) $user->store_id : null;
        $sells = in_array($role, ['seller', 'store_manager', 'admin'], true);

        // ── Money waiting on this user as the second person ──
        if ($sells) {
            $toConfirm = $this->payments->awaiting($user)->get(['id', 'payment_account_id', 'amount']);
            $cash = $toConfirm->whereNull('payment_account_id');
            $deposits = $toConfirm->whereNotNull('payment_account_id');

            $this->push($tasks, 'confirm-deposits', 'payment', 'Confirm money received', sprintf(
                '%d deposit%s (%s ETB) marked paid. Check the account and confirm.',
                $deposits->count(), $deposits->count() === 1 ? '' : 's', number_format((float) $deposits->sum('amount'), 2),
            ), $deposits->count(), $this->url('seller.payments.inbox'), true);

            // Deposits expected in this user's accounts that nobody has marked
            // paid yet: the owner can confirm one as soon as it arrives.
            $expected = $this->payments->expected($user)->get(['id', 'amount']);
            $this->push($tasks, 'expected-deposits', 'payment', 'Deposits expected', sprintf(
                '%d deposit%s (%s ETB) on the way to your accounts. Confirm when you see %s.',
                $expected->count(), $expected->count() === 1 ? '' : 's', number_format((float) $expected->sum('amount'), 2),
                $expected->count() === 1 ? 'it' : 'them',
            ), $expected->count(), $this->url('seller.payments.inbox'));

            $this->push($tasks, 'confirm-cash', 'cash', 'Confirm cash taken', sprintf(
                '%d cash part%s (%s ETB) held by sellers. Confirm you have it.',
                $cash->count(), $cash->count() === 1 ? '' : 's', number_format((float) $cash->sum('amount'), 2),
            ), $cash->count(), $this->url('seller.payments.inbox'), true);

            $handovers = Remittance::query()->awaitingOwner((int) $user->id)->count();
            $this->push($tasks, 'confirm-handovers', 'handover', 'Confirm handovers', "{$handovers} seller handover(s) to your settlement account.", $handovers, $this->url('seller.payments.inbox'));

            // The seller's own orders: money an owner could not find.
            $notReceived = Payment::query()
                ->where('status', Payment::STATUS_PENDING)
                ->whereNotNull('rejected_at')
                ->whereHas('sale', fn ($sale) => $sale->where('seller_id', $user->id)->whereIn('fulfillment_stage', [Sale::STAGE_AWAITING_PAYMENT, Sale::STAGE_PICK_PACK]))
                ->count();
            $this->push($tasks, 'not-received', 'warning', 'Payment not received', "{$notReceived} payment part(s) on your orders were not found. Check with the customer.", $notReceived, $this->url('seller.orders.index', ['tab' => 'to_pay']), true);
        }

        // ── Orders paid and waiting to be picked at this user's store ──
        if ($sells && $storeId !== null) {
            $toPick = Sale::query()->forStore($storeId)->awaitingSourcing()->count();
            $this->push($tasks, 'pick-pack', 'parcel', 'Pick & pack orders', "{$toPick} paid order(s) waiting to be picked and packed.", $toPick, $this->url('seller.orders.index', ['tab' => 'paid']), true);
        }

        // ── Refills ──
        if ($storeId !== null && in_array($role, ['stock_keeper', 'store_manager', 'admin', 'seller'], true)) {
            $shelf = StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_SHELF)->value('id');

            if ($shelf !== null && in_array($role, ['stock_keeper', 'store_manager', 'admin'], true)) {
                $toShelve = Transfer::query()
                    ->where('destination_location_type', StockLocation::class)
                    ->where('destination_location_id', $shelf)
                    ->whereIn('status', [TransferWorkflowService::STATUS_PENDING, TransferWorkflowService::STATUS_IN_TRANSIT])
                    ->where('approval_state', '!=', Transfer::APPROVAL_PENDING)
                    ->count();
                $this->push($tasks, 'shelve', 'shelf', 'Refill the shelf', "{$toShelve} item(s) to carry from the store floor to the shelf.", $toShelve, $this->url('stock_keeper.shelving.index'));

                $toAccept = RefillRequest::query()->where('store_id', $storeId)
                    ->where('source', ItemRefillRoute::SOURCE_REMOTE_HUB)
                    ->where('status', RefillRequest::STATUS_IN_PROGRESS)
                    ->whereNull('transfer_id')
                    ->count();
                $this->push($tasks, 'accept-remote', 'hub', 'Accept Remote Hub refills', "{$toAccept} Remote Hub refill(s) to accept.", $toAccept, $this->url('stock_keeper.shelving.index'));
            }

            if ($this->rulesOnRefills($user, $storeId)) {
                $suggestions = RefillRequest::query()->open()->where('store_id', $storeId)
                    ->whereIn('source', [ItemRefillRoute::SOURCE_REMOTE_HUB, ItemRefillRoute::SOURCE_SHIPMENT])
                    ->where('status', RefillRequest::STATUS_PENDING)
                    ->count();
                $this->push($tasks, 'refill-suggestions', 'refill', 'Refill suggestions', "{$suggestions} refill(s) to put on the Remote Hub list or a shipment.", $suggestions, $this->url('seller.refills.index'));
            }
        }

        // ── Couriers: runs to collect ──
        if ($role === 'delivery') {
            $mine = Delivery::query()->forCourier((int) $user->id)->visibleToCourier()->where('status', 'pending')->count();
            $this->push($tasks, 'collect', 'truck', 'Runs to collect', "{$mine} packed order(s) assigned to you.", $mine, $this->url('delivery.delivery.index'), true);

            $pool = Delivery::query()->unassigned()->readyToCollect()->where('status', 'pending')->count();
            $this->push($tasks, 'pool', 'truck', 'Runs nobody has claimed', "{$pool} packed order(s) waiting for a courier.", $pool, $this->url('delivery.delivery.index'));
        }

        return $tasks;
    }

    /** @param array<int, array<string, mixed>> $tasks */
    private function push(array &$tasks, string $id, string $kind, string $title, string $detail, int $count, ?string $href, bool $urgent = false): void
    {
        if ($count <= 0) {
            return;
        }

        $tasks[] = compact('id', 'kind', 'title', 'detail', 'count', 'href', 'urgent');
    }

    private function rulesOnRefills(User $user, int $storeId): bool
    {
        try {
            return app(StockPermissions::class)->canRuleOnRefills($user, $storeId);
        } catch (Throwable) {
            return false;
        }
    }

    /** @param array<string, mixed> $params */
    private function url(string $name, array $params = []): ?string
    {
        return Route::has($name) ? route($name, $params) : null;
    }
}
