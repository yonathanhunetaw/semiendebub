<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use App\Models\Finance\BalanceEntry;
use App\Models\Finance\Remittance;
use App\Services\Finance\BalanceLedger;
use App\Services\Finance\PaymentBoard;
use Inertia\Inertia;
use Inertia\Response;

/**
 * What every seller holds and has handed over.
 *
 * A seller's balance is the deposits they confirmed and the cash they took,
 * less what their settlement accounts' owners confirmed receiving. Cash held
 * past payments.cash_flag_days is flagged: it has no bank record to check.
 */
class BalanceController extends Controller
{
    public function index(BalanceLedger $ledger, PaymentBoard $board): Response
    {
        $holderIds = BalanceEntry::query()->distinct()->pluck('user_id')
            ->merge(Remittance::query()->distinct()->pluck('user_id'))
            ->unique();

        $sellers = User::query()->whereKey($holderIds)->with('store')->get()
            ->map(function (User $user) use ($ledger): array {
                $buckets = collect($ledger->buckets((int) $user->id));
                $cash = $buckets->firstWhere('account', null);

                return [
                    'id' => (int) $user->id,
                    'name' => trim($user->first_name.' '.$user->last_name),
                    'store' => $user->store?->name,
                    'held' => $ledger->heldCents((int) $user->id) / 100,
                    'cash' => (float) ($cash['held'] ?? 0),
                    'handing_over' => (float) $buckets->sum('handing_over'),
                    'overdue_cash' => $ledger->overdueCash((int) $user->id),
                    'buckets' => $buckets->values(),
                ];
            })
            ->sortByDesc('held')
            ->values();

        return Inertia::render('Admin/Payments/Balances', [
            'sellers' => $sellers,
            'remittances' => Remittance::query()
                ->with(['user', 'from', 'to.owner'])
                ->latest('id')
                ->limit(100)
                ->get()
                ->map(fn (Remittance $remittance): array => $board->remittance($remittance))
                ->values(),
            'cash_flag_days' => (int) config('payments.cash_flag_days', 3),
        ]);
    }
}
