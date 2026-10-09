<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Finance\Sale;
use App\Services\Admin\ActiveStore;
use App\Services\Fulfillment\CustodyLog;
use App\Services\Fulfillment\SellerOrderBoard;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every order, every store: where it stands and who has held its goods.
 *
 * Stages are the seller board's (SellerOrderBoard::stageFor), so a count here
 * matches the seller's tab. Opening an order shows its custody log.
 */
class OrderController extends Controller
{
    /** Board stage → the sales columns that produce it. */
    private const STAGE_FILTER = [
        'to_pay' => [Sale::STAGE_AWAITING_PAYMENT],
        'paid' => [Sale::STAGE_PICK_PACK],
        'to_deliver' => [Sale::STAGE_TO_DELIVER],
        'delivered' => [Sale::STAGE_DELIVERED],
        'canceled' => [Sale::STAGE_CANCELLED],
    ];

    public function index(Request $request, SellerOrderBoard $board, ActiveStore $activeStore): Response
    {
        $stage = $request->string('stage')->toString() ?: 'all';
        // The active store (sidebar dropdown, or this page's own `?store=`,
        // which goes through the same ActiveStore resolution).
        $storeId = $activeStore->id();
        $search = trim($request->string('search')->toString());

        $paginator = $activeStore->apply(Sale::query())
            ->with(['store', 'customer', 'delivery'])
            ->when(isset(self::STAGE_FILTER[$stage]), fn ($q) => $q->whereIn('fulfillment_stage', self::STAGE_FILTER[$stage]))
            ->when($search !== '', fn ($q) => $q->where('reference_number', 'like', "%{$search}%"))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Admin/Orders/Index', [
            'orders' => collect($paginator->items())->map(fn (Sale $sale): array => [
                'id' => (int) $sale->id,
                'reference' => (string) $sale->reference_number,
                'store' => $sale->store?->name,
                'customer' => $sale->customer?->name ?? $sale->delivery?->recipient_name ?? 'Walk-in customer',
                'stage' => $board->stageFor($sale->fulfillment_stage, $sale->payment_status, false),
                'payment_status' => (string) $sale->payment_status,
                'total' => (float) $sale->total_amount,
                'delivery_status' => $sale->delivery?->status,
                'courier' => $sale->delivery?->courier_name,
                'placed_at' => $sale->created_at?->toIso8601String(),
            ])->values(),
            'counts' => $board->counts($storeId),
            'filters' => ['stage' => $stage, 'store' => $storeId, 'search' => $search],
            'stores' => $activeStore->accessibleStores()->where('type', \App\Models\Store\Store::TYPE_RETAIL)
                ->map(fn ($store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])->values(),
            'can_pick_all' => $activeStore->isGlobal(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function custody(string $reference, CustodyLog $log, ActiveStore $activeStore): Response
    {
        $sale = Sale::query()->where('reference_number', $reference)->firstOrFail();

        abort_unless($activeStore->allows($sale->store_id !== null ? (int) $sale->store_id : null), 404);

        return Inertia::render('Admin/Orders/Custody', ['log' => $log->forSale($sale)]);
    }
}
