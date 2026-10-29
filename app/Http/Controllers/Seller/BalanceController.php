<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreRemittanceRequest;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use App\Services\Finance\BalanceLedger;
use App\Services\Finance\PaymentBoard;
use App\Services\Finance\RemittanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The seller's balance: money they took in (deposits they confirmed, cash
 * they took) and have not yet handed over, per account and cash, and the
 * handover to their settlement accounts.
 */
class BalanceController extends Controller
{
    public function index(Request $request, BalanceLedger $ledger, PaymentBoard $board): Response
    {
        $userId = (int) $request->user()->id;

        return Inertia::render('Seller/Balance/Index', [
            'held' => $ledger->heldCents($userId) / 100,
            'buckets' => $ledger->buckets($userId),
            'overdue_cash' => $ledger->overdueCash($userId),
            'settlement_accounts' => PaymentAccount::query()
                ->where('purpose', PaymentAccount::PURPOSE_SETTLEMENT)
                ->where('is_active', true)
                ->where('owner_user_id', '!=', $userId)
                ->whereHas('remitters', fn ($q) => $q->whereKey($userId))
                ->with('owner')
                ->get()
                ->map(fn (PaymentAccount $account): array => $board->account($account))
                ->values(),
            'remittances' => Remittance::query()->where('user_id', $userId)
                ->with(['user', 'from', 'to.owner'])
                ->latest('id')
                ->limit(30)
                ->get()
                ->map(fn (Remittance $remittance): array => $board->remittance($remittance))
                ->values(),
            'entries' => $ledger->entries($userId),
            'store_cash' => $this->storeCash($request->user()),
        ]);
    }

    /**
     * The cash at this seller's store for the day that is open now (else the one
     * that closed last today): what was taken, what is still unconfirmed, what
     * was handed over, and what the till should hold.
     *
     * @return array<string, mixed>|null
     */
    private function storeCash(\App\Models\Auth\User $user): ?array
    {
        if ($user->store_id === null) {
            return null;
        }

        $shopDay = app(\App\Services\Workforce\ShopDay::class);
        $site = $shopDay->siteOf((int) $user->store_id);
        if ($site === null) {
            return null;
        }

        $day = $shopDay->current($site) ?? \App\Models\Workforce\SiteDay::query()
            ->where('stock_location_id', $site->id)
            ->whereDate('date', \App\Services\Workforce\LocalTime::dateOf())
            ->whereNotNull('opened_at')
            ->first();

        if ($day === null) {
            return null;
        }

        $cash = app(\App\Services\Finance\DayCash::class)->figures($site, $day);

        return [
            'store' => (string) $site->name,
            'open' => $day->status === \App\Models\Workforce\SiteDay::STATUS_OPEN,
            'collected' => $cash['collected'],
            'unconfirmed' => $cash['unconfirmed'],
            'handed_over' => $cash['handed_over'],
            'expected' => $cash['expected'],
        ];
    }

    public function remit(StoreRemittanceRequest $request, RemittanceService $remittances): RedirectResponse
    {
        try {
            $remittance = $remittances->remit(
                $request->user(),
                $request->validated('from_payment_account_id') !== null ? (int) $request->validated('from_payment_account_id') : null,
                (int) $request->validated('to_payment_account_id'),
                (float) $request->validated('amount'),
                $request->validated('reference'),
            );
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        $owner = $remittance->to?->owner;
        $who = $owner ? trim($owner->first_name.' '.$owner->last_name) : 'The account owner';

        return back()->with('success', "{$who} will check the account and confirm the handover.");
    }
}
