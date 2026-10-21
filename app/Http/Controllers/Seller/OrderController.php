<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\MovementDomainException;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Seller\Concerns\SellerStore;
use App\Http\Requests\Fulfillment\ConfirmSourcingRequest;
use App\Models\Finance\Sale;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Pick & Pack: the stage between a paid order and a delivery.
 *
 * A paid order knows what was sold and which store sold it. It does not know
 * where the goods are, and in this system that is a real question — a store
 * holds stock on its shop floor, in its back room, at a remote warehouse and at
 * a hub. So staff name the exact location each line is picked from, and only a
 * fully sourced order moves on to "To Deliver". The delivery that results
 * originates from that location rather than from "the store".
 *
 * Orders waiting here are listed on the order board (OrderBoardController,
 * the Paid and Pick & pack tabs); this controller is the single-order screen
 * and the sourcing confirmation.
 *
 * @see \App\Services\Fulfillment\OrderSourcingService
 */
class OrderController extends Controller
{
    use SellerStore;

    public function __construct(private readonly OrderSourcingService $sourcing)
    {
    }

    /**
     * The old pick screen's address. Pick & pack now happens on My Orders, in
     * the order's own card, so this opens the board with that card open.
     */
    public function pickPack(string $reference): RedirectResponse
    {
        return redirect()->route('seller.orders.index', ['open' => $reference]);
    }

    /**
     * Commit the sourcing decisions and move the order to "To Deliver".
     *
     * All lines or none: a half-sourced order is not a state the pipeline has,
     * so a line whose chosen location turns out to be short aborts the whole
     * confirmation rather than booking out part of the order.
     */
    public function confirmSourcing(ConfirmSourcingRequest $request, Sale $sale): RedirectResponse
    {
        $storeId = self::sellerStoreId($request);

        // Another store's order is not this seller's to pick.
        abort_if($storeId !== null && (int) $sale->store_id !== $storeId, 404);

        if (! $sale->isAwaitingSourcing()) {
            return back()->with('error', 'This order is not in Pick & Pack.');
        }

        try {
            $this->sourcing->confirmSourcing($sale, $request->decisions(), $request->user());
        } catch (InsufficientStockException $exception) {
            return back()->withErrors(['lines' => $exception->getMessage()]);
        } catch (MovementDomainException|RuntimeException $exception) {
            return back()->withErrors(['lines' => $exception->getMessage()]);
        }

        // An in-store order went to the customer at the counter, not to Delivery.
        $done = $sale->refresh()->fulfillment_stage === Sale::STAGE_DELIVERED
            ? ['handed to the customer', 'delivered']
            : ['packed and handed to delivery', 'to_deliver'];

        // Straight on to the next order waiting to be picked, if any.
        $next = $this->queue((int) $sale->store_id, (int) $sale->id)[0] ?? null;

        return $next !== null
            ? redirect()->route('seller.orders.index', ['open' => $next['reference']])
                ->with('success', "Order {$sale->reference_number} {$done[0]}. Next up: {$next['reference']}.")
            : redirect()->to(route('seller.orders.index').'?tab='.$done[1])
                ->with('success', "Order {$sale->reference_number} {$done[0]}. Nothing else waiting to pick.");
    }

    /**
     * Paid orders waiting to be picked at a store, oldest payment first.
     *
     * @return array<int, array{reference: string, customer: string, lines: int, paid_at: string|null}>
     */
    private function queue(int $storeId, int $exceptId): array
    {
        return Sale::query()
            ->forStore($storeId)
            ->awaitingSourcing()
            ->whereKeyNot($exceptId)
            ->with('customer')
            ->withCount('items')
            ->orderBy('updated_at')
            ->limit(20)
            ->get()
            ->map(fn (Sale $sale): array => [
                'reference' => (string) $sale->reference_number,
                'customer' => $sale->customer?->name ?? 'Walk-in',
                'lines' => (int) $sale->items_count,
                'paid_at' => $sale->updated_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
