<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\MovementDomainException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Fulfillment\ConfirmSourcingRequest;
use App\Models\Finance\Sale;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * The floor's pick queue: real orders, not carts.
 *
 *   to_pick         paid and waiting for Pick & Pack. Each line offers the
 *                   places that serve customers — the store's shelf, its floor
 *                   and its Remote Hub — with what each holds, and the nearest
 *                   that covers it preselected.
 *   with_delivery   picked: the goods are in Delivery's custody, waiting for
 *                   or riding with a courier.
 *
 * Confirming a pick books the goods out of the chosen places and hands them to
 * Delivery (OrderSourcingService::confirmSourcing), exactly as the seller's
 * Pick & Pack screen does. A keeper posted to a store sees that store's orders.
 */
class OrderController extends Controller
{
    public function __construct(private readonly OrderSourcingService $sourcing)
    {
    }

    public function index(Request $request): Response
    {
        $tab = $request->string('tab')->toString() ?: 'to_pick';
        $storeId = $request->user()?->store_id;

        $base = fn () => Sale::query()->when($storeId !== null, fn ($query) => $query->forStore((int) $storeId));

        $query = $tab === 'with_delivery'
            ? $base()->where('fulfillment_stage', Sale::STAGE_TO_DELIVER)
            : $base()->awaitingSourcing();

        $paginator = $query->oldest('id')->paginate(15)->withQueryString();

        return Inertia::render('StockKeeper/Orders/index', [
            'orders' => collect($paginator->items())
                ->map(fn (Sale $sale): array => $this->sourcing->pickPackPlan($sale) + [
                    'delivery' => $sale->delivery === null ? null : [
                        'status' => (string) $sale->delivery->status,
                        'courier' => $sale->delivery->courier_name,
                        'address' => $sale->delivery->delivery_address,
                    ],
                ])
                ->values()
                ->all(),
            'tab' => $tab,
            'counts' => [
                'to_pick' => $base()->awaitingSourcing()->count(),
                'with_delivery' => $base()->where('fulfillment_stage', Sale::STAGE_TO_DELIVER)->count(),
            ],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /** Pick the order from the chosen places and hand it to Delivery. */
    public function confirmSourcing(ConfirmSourcingRequest $request, Sale $sale): RedirectResponse
    {
        $storeId = $request->user()?->store_id;

        abort_if($storeId !== null && (int) $sale->store_id !== (int) $storeId, 404);

        if (! $sale->isAwaitingSourcing()) {
            return back()->with('error', 'This order is not waiting to be picked.');
        }

        try {
            $this->sourcing->confirmSourcing($sale, $request->decisions(), $request->user());
        } catch (InsufficientStockException|MovementDomainException|RuntimeException $exception) {
            return back()->with('error', $exception->getMessage());
        }

        return back()->with('success', "Order {$sale->reference_number} picked and handed to Delivery.");
    }
}
