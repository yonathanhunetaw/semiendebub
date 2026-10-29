<?php

declare(strict_types=1);

namespace App\Services\Tasks;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\SupplierQuote;
use App\Services\Procurement\PayablesLedger;
use App\Services\Workforce\LocalTime;
use Illuminate\Support\Facades\Route;

/**
 * Dates that passed with nothing done, for the bell: deliveries later than
 * planned, picking that stalled, price checks past due, supplier quotes that
 * expired while the idea is still being decided, consignments past their ETA,
 * supplier installments overdue.
 *
 * One count query per alert, only for the roles that act on it: the bell runs
 * on every page. Each alert links to the list where it is dealt with.
 */
final class DeadlineTasks
{
    /** Picking started this long ago and the order is still not packed. */
    public const PICKING_STALLED_HOURS = 2;

    public function __construct(private readonly PayablesLedger $payables)
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
        $globalAdmin = $role === 'admin' && $storeId === null;
        $runsStore = in_array($role, ['admin', 'store_manager'], true);
        $sells = in_array($role, ['seller', 'store_manager', 'admin'], true);
        $buys = $globalAdmin || $role === 'procurement';
        $today = LocalTime::dateOf();

        // ── Deliveries past the time they were planned for ──
        $late = fn () => Delivery::query()->open()->whereNotNull('scheduled_for')->where('scheduled_for', '<', now());
        if ($runsStore) {
            $count = $late()->when($storeId !== null, fn ($q) => $q->whereHas('sale', fn ($sale) => $sale->where('store_id', $storeId)))->count();
            $this->push($tasks, 'late-deliveries', 'truck', 'Deliveries running late', "{$count} delivery run(s) past the time they were planned for.", $count,
                $role === 'admin' ? $this->url('admin.deliveries.index', ['status' => 'open']) : $this->url('seller.orders.index', ['tab' => 'to_deliver']), true);
        }
        if ($role === 'delivery') {
            $count = $late()->forCourier((int) $user->id)->count();
            $this->push($tasks, 'my-late-runs', 'truck', 'Your runs are late', "{$count} of your run(s) past the planned time.", $count, $this->url('delivery.delivery.index'), true);
        }

        // ── Picking that stalled ──
        if ($sells && $storeId !== null) {
            $count = Sale::query()->forStore($storeId)
                ->where('fulfillment_stage', Sale::STAGE_PICK_PACK)
                ->whereNull('packed_at')
                ->whereNotNull('picking_started_at')
                ->where('picking_started_at', '<', now()->subHours(self::PICKING_STALLED_HOURS))
                ->count();
            $this->push($tasks, 'picking-stalled', 'parcel', 'Picking stalled', sprintf(
                '%d order(s) started picking over %d hours ago and are not packed.', $count, self::PICKING_STALLED_HOURS,
            ), $count, $this->url('seller.orders.index', ['tab' => 'paid']), true);
        }

        // ── Price checks past their due date ──
        if ($role === 'admin') {
            $count = PriceCheck::query()->where('status', PriceCheck::OPEN)
                ->whereNotNull('due_on')->whereDate('due_on', '<', $today)
                ->when($storeId !== null, fn ($q) => $q->where('store_id', $storeId))
                ->count();
            $this->push($tasks, 'price-checks-overdue', 'warning', 'Price checks overdue', "{$count} price check(s) past their due date and still open.", $count, $this->url('admin.price_checks.index'));
        }

        if ($buys) {
            $app = $role === 'procurement' ? 'procurement' : 'admin';

            // ── Supplier quotes that expired while the idea is still being decided ──
            $count = SupplierQuote::query()
                ->whereNotNull('valid_until')->whereDate('valid_until', '<', $today)
                ->whereHas('idea', fn ($idea) => $idea->whereIn('status', [ProductIdea::SCOUTED, ProductIdea::SOURCING, ProductIdea::APPROVED]))
                ->count();
            $this->push($tasks, 'quotes-expired', 'warning', 'Supplier quotes expired', "{$count} quote(s) past their valid-until date on ideas not bought yet. Ask for a fresh price.", $count, $this->url("{$app}.ideas.index"));

            // ── Consignments past their ETA ──
            $count = Consignment::query()->whereIn('stage', Consignment::IN_TRANSIT)
                ->whereNull('received_at')
                ->whereNotNull('eta')->whereDate('eta', '<', $today)
                ->count();
            $this->push($tasks, 'consignments-late', 'truck', 'Consignments past their ETA', "{$count} consignment(s) on the way and past the expected arrival date.", $count, $this->url('procurement.consignments.index'), true);
        }

        // ── Supplier installments overdue ──
        if ($buys || $role === 'finance') {
            $overdue = $this->payables->openInstallments()->where('state', 'overdue');
            $this->push($tasks, 'installments-overdue', 'payment', 'Supplier payments overdue', sprintf(
                '%d supplier installment(s) past due (%s ETB left to pay).', $overdue->count(), number_format((float) $overdue->sum('remaining'), 2),
            ), $overdue->count(), $role === 'finance' ? $this->url('finance.supplier_payments.index') : $this->url('procurement.payables.index'), true);
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

    /** @param array<string, mixed> $params */
    private function url(string $name, array $params = []): ?string
    {
        return Route::has($name) ? route($name, $params) : null;
    }
}
