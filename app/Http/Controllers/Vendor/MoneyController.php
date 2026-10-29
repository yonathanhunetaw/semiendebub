<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\Vendor\MarketplaceSetting;
use App\Models\Vendor\VendorLedgerEntry;
use App\Models\Vendor\VendorPayout;
use App\Services\Vendor\VendorMoney;
use App\Services\Vendor\VendorStore;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The vendor's money (vendor V3): what each paid order earned after Duka's commission, the payouts, and the balance. */
class MoneyController extends Controller
{
    public function __construct(private readonly VendorStore $vendors, private readonly VendorMoney $money)
    {
    }

    public function index(Request $request): Response
    {
        $store = $this->vendors->storeFor($request->user(), $request->integer('store') ?: null);

        if ($store === null) {
            return Inertia::render('Vendor/Money/index', ['store' => null, 'balance' => 0, 'entries' => null, 'payouts' => [], 'commission_pct' => MarketplaceSetting::commissionPct()]);
        }

        $entries = VendorLedgerEntry::query()
            ->where('store_id', $store->id)
            ->with('sale:id,reference_number')
            ->orderByDesc('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (VendorLedgerEntry $e): array => [
                'id' => (int) $e->id,
                'kind' => $e->kind,
                'reference' => $e->sale?->reference_number,
                'gross' => $e->gross,
                'commission_pct' => $e->commission_pct,
                'commission' => $e->commission,
                'amount' => $e->amount,
                'at' => $e->created_at?->toIso8601String(),
            ]);

        $payouts = VendorPayout::query()->where('store_id', $store->id)->orderByDesc('id')->limit(50)->get()
            ->map(fn (VendorPayout $p): array => [
                'id' => (int) $p->id,
                'amount' => $p->amount,
                'method' => $p->method,
                'reference' => $p->reference,
                'status' => $p->status,
                'at' => ($p->confirmed_at ?? $p->created_at)?->toIso8601String(),
            ]);

        return Inertia::render('Vendor/Money/index', [
            'store' => $this->vendors->profile($store),
            'balance' => $this->money->balance($store),
            'entries' => $entries,
            'payouts' => $payouts,
            'commission_pct' => MarketplaceSetting::commissionPct(),
        ]);
    }
}
