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
        ]);
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
