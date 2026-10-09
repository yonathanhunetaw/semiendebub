<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

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
    public function __construct(private readonly OrderSourcingService $sourcing)
    {
    }

    /**
     * One paid order, with every location that holds each of its lines.
     *
     * Resolved by reference rather than id because that is what the pipeline
     * screens link with, and what staff read off a receipt.
     */
    public function pickPack(Request $request, string $reference): Response
    {
        // Only the seller's own store's orders, like the board.
        $sale = Sale::query()
            ->where('reference_number', $reference)
            ->when($request->user()?->store_id !== null, fn ($query) => $query->forStore((int) $request->user()->store_id))
            ->first();

        if ($sale === null) {
            // Rendered rather than 404'd: the sample-data pipeline links here
            // with references that were never real orders, and an explanatory
            // screen is more useful to a seller than an error page.
            return Inertia::render('Seller/Orders/PickPack', [
                'reference' => $reference,
                'plan' => null,
            ]);
        }

        return Inertia::render('Seller/Orders/PickPack', [
            'reference' => $reference,
            'plan' => $this->sourcing->pickPackPlan($sale),
        ]);
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
        $storeId = $request->user()?->store_id;

        // Another store's order is not this seller's to pick.
        abort_if($storeId !== null && (int) $sale->store_id !== (int) $storeId, 404);

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

        return redirect()
            ->to(route('seller.orders.index').'?tab=paid')
            ->with('success', "Order {$sale->reference_number} sourced and moved to delivery.");
    }
}
