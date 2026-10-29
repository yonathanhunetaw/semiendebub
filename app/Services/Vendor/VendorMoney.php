<?php

declare(strict_types=1);

namespace App\Services\Vendor;

use App\Exceptions\VendorException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Store\Store;
use App\Models\Vendor\MarketplaceSetting;
use App\Models\Vendor\VendorLedgerEntry;
use App\Models\Vendor\VendorPayout;
use App\Services\Inventory\StockPermissions;
use Illuminate\Support\Facades\DB;

/**
 * Vendor V3: a vendor's money. When an order of a vendor's store is paid, Duka
 * keeps the commission and the rest is the vendor's (an earning); a paid order
 * cancelled later takes it back (a reversal). Payouts follow the two-person
 * rule: a global admin or finance records one, a different one of them confirms
 * it, and only then does it leave the balance. Duka's own stores have no ledger.
 */
class VendorMoney
{
    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /** A paid order of a vendor's store: its earning, once. */
    public function earn(Sale $sale): ?VendorLedgerEntry
    {
        $store = $sale->store_id !== null ? Store::query()->find($sale->store_id) : null;

        if ($store === null || ! $store->isVendorStore()) {
            return null;
        }

        return DB::transaction(function () use ($sale, $store): ?VendorLedgerEntry {
            if (VendorLedgerEntry::query()->where('sale_id', $sale->id)->where('kind', VendorLedgerEntry::KIND_EARNING)->lockForUpdate()->exists()) {
                return null;
            }

            $gross = round((float) $sale->total_amount, 2);
            $pct = MarketplaceSetting::commissionPct();
            $commission = round($gross * $pct / 100, 2);

            return VendorLedgerEntry::query()->create([
                'store_id' => $store->id,
                'kind' => VendorLedgerEntry::KIND_EARNING,
                'sale_id' => $sale->id,
                'gross' => $gross,
                'commission_pct' => $pct,
                'commission' => $commission,
                'amount' => round($gross - $commission, 2),
            ]);
        });
    }

    /** A paid order cancelled after it was earned: the earning goes back, once. */
    public function reverse(Sale $sale): ?VendorLedgerEntry
    {
        return DB::transaction(function () use ($sale): ?VendorLedgerEntry {
            $earning = VendorLedgerEntry::query()->where('sale_id', $sale->id)->where('kind', VendorLedgerEntry::KIND_EARNING)->lockForUpdate()->first();

            if ($earning === null || VendorLedgerEntry::query()->where('sale_id', $sale->id)->where('kind', VendorLedgerEntry::KIND_REVERSAL)->exists()) {
                return null;
            }

            return VendorLedgerEntry::query()->create([
                'store_id' => $earning->store_id,
                'kind' => VendorLedgerEntry::KIND_REVERSAL,
                'sale_id' => $sale->id,
                'gross' => -$earning->gross,
                'commission_pct' => $earning->commission_pct,
                'commission' => -$earning->commission,
                'amount' => -$earning->amount,
            ]);
        });
    }

    /** What Duka owes the store now: earned, less reversed, less confirmed payouts. */
    public function balance(Store $store): float
    {
        return round((float) VendorLedgerEntry::query()->where('store_id', $store->id)->sum('amount'), 2);
    }

    /** @throws VendorException */
    public function recordPayout(Store $store, User $by, float $amount, string $method, ?string $reference): VendorPayout
    {
        $this->assertMoneyPerson($by);

        if (! $store->isVendorStore()) {
            throw new VendorException('Only a vendor\'s store is paid out.');
        }

        return DB::transaction(function () use ($store, $by, $amount, $method, $reference): VendorPayout {
            Store::query()->whereKey($store->id)->lockForUpdate()->first();
            $waiting = (float) VendorPayout::query()->where('store_id', $store->id)->where('status', VendorPayout::STATUS_RECORDED)->sum('amount');

            if ($amount <= 0 || round($amount + $waiting, 2) > $this->balance($store)) {
                throw new VendorException(sprintf('A payout is between 0 and what is owed: ETB %s, less payouts waiting for confirmation.', number_format($this->balance($store) - $waiting, 2)));
            }

            return VendorPayout::query()->create([
                'store_id' => $store->id,
                'amount' => round($amount, 2),
                'method' => $method,
                'reference' => $reference,
                'status' => VendorPayout::STATUS_RECORDED,
                'recorded_by' => $by->id,
            ]);
        });
    }

    /** @throws VendorException */
    public function confirmPayout(VendorPayout $payout, User $by): VendorPayout
    {
        $this->assertMoneyPerson($by);

        return DB::transaction(function () use ($payout, $by): VendorPayout {
            $payout = VendorPayout::query()->lockForUpdate()->findOrFail($payout->id);
            $this->assertWaiting($payout);

            if ((int) $payout->recorded_by === (int) $by->id) {
                throw new VendorException('A second person confirms a payout: not the one who recorded it.');
            }

            $payout->update(['status' => VendorPayout::STATUS_CONFIRMED, 'confirmed_by' => $by->id, 'confirmed_at' => now()]);

            VendorLedgerEntry::query()->create([
                'store_id' => $payout->store_id,
                'kind' => VendorLedgerEntry::KIND_PAYOUT,
                'payout_id' => $payout->id,
                'amount' => -$payout->amount,
            ]);

            return $payout;
        });
    }

    /** @throws VendorException */
    public function rejectPayout(VendorPayout $payout, User $by, string $reason): VendorPayout
    {
        $this->assertMoneyPerson($by);

        return DB::transaction(function () use ($payout, $by, $reason): VendorPayout {
            $payout = VendorPayout::query()->lockForUpdate()->findOrFail($payout->id);
            $this->assertWaiting($payout);
            $payout->update(['status' => VendorPayout::STATUS_REJECTED, 'confirmed_by' => $by->id, 'confirmed_at' => now(), 'reject_reason' => $reason]);

            return $payout;
        });
    }

    public function mayHandleMoney(?User $user): bool
    {
        return $user !== null && ($this->permissions->isGlobalAdmin($user) || $user->roleKey() === 'finance' || $user->hasRole('finance'));
    }

    /** @throws VendorException */
    public function setCommission(User $by, float $pct): void
    {
        if (! $this->permissions->isGlobalAdmin($by)) {
            throw new VendorException('Only a global admin sets the commission.', 403);
        }

        $row = MarketplaceSetting::query()->first() ?? new MarketplaceSetting();
        $row->fill(['commission_pct' => round($pct, 2), 'updated_by' => $by->id])->save();
    }

    /** @throws VendorException */
    private function assertMoneyPerson(User $by): void
    {
        if (! $this->mayHandleMoney($by)) {
            throw new VendorException('Only a global admin or finance handles vendor payouts.', 403);
        }
    }

    /** @throws VendorException */
    private function assertWaiting(VendorPayout $payout): void
    {
        if ($payout->status !== VendorPayout::STATUS_RECORDED) {
            throw new VendorException("This payout was already {$payout->status}.");
        }
    }
}
