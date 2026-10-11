<?php

declare(strict_types=1);

namespace App\Http\Controllers\Fulfillment;

use App\Http\Controllers\Controller;
use App\Http\Requests\Fulfillment\UpdatePickProgressRequest;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Pick & pack progress, shared by the seller and stock keeper apps: start
 * picking, tick each line once it is in hand, mark the parcel packed. Saved
 * on the order, so whoever looks next (the other role, the courier) sees how
 * far it got. Handing it to delivery stays with each app's OrderController.
 */
class PickProgressController extends Controller
{
    public function __construct(private readonly OrderSourcingService $sourcing)
    {
    }

    public function start(Request $request, Sale $sale): RedirectResponse
    {
        $this->guard($request, $sale);

        return $this->attempt(fn () => $this->sourcing->startPicking($sale, $request->user()), "Picking {$sale->reference_number}.");
    }

    public function tick(UpdatePickProgressRequest $request, Sale $sale, SaleItem $item): RedirectResponse
    {
        $this->guard($request, $sale);

        return $this->attempt(fn () => $this->sourcing->tickLine($sale, $item, $request->boolean('done'), $request->user()));
    }

    public function packed(UpdatePickProgressRequest $request, Sale $sale): RedirectResponse
    {
        $this->guard($request, $sale);

        return $this->attempt(
            fn () => $this->sourcing->markPacked($sale, $request->boolean('done'), $request->user()),
            $request->boolean('done') ? "{$sale->reference_number} packed and labelled." : null,
        );
    }

    /** Staff posted to a store only work its own orders. */
    private function guard(Request $request, Sale $sale): void
    {
        $storeId = $request->user()?->store_id;

        abort_if($storeId !== null && (int) $sale->store_id !== (int) $storeId, 404);
    }

    private function attempt(callable $action, ?string $success = null): RedirectResponse
    {
        try {
            $action();
        } catch (RuntimeException $exception) {
            return back()->with('error', $exception->getMessage());
        }

        return $success !== null ? back()->with('success', $success) : back();
    }
}
