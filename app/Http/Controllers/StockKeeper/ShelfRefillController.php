<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AcceptRefillRequest;
use App\Http\Requests\Inventory\RaiseShelfRefillRequest;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\Inventory\RefillEngine;
use App\Services\Inventory\RefillWorkflow;
use Illuminate\Http\RedirectResponse;
use InvalidArgumentException;

/**
 * The stock keeper's side of shelf refills: raise one by hand (the shelf looks
 * short, or the floor's count is wrong and it should go straight to the Remote
 * Hub), and accept an approved refill at the Remote Hub.
 */
class ShelfRefillController extends Controller
{
    public function __construct(
        private readonly RefillEngine $engine,
        private readonly RefillWorkflow $workflow,
    ) {
    }

    public function store(RaiseShelfRefillRequest $request, StockLocation $location, Item $item): RedirectResponse
    {
        try {
            $outcome = $this->engine->raise(
                $location,
                $item,
                RefillRequest::ORIGIN_MANUAL,
                $request->user(),
                $request->validated('start_at'),
            );
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with($outcome['result'] === 'raised' ? 'success' : 'error', $outcome['message']);
    }

    public function accept(AcceptRefillRequest $request, RefillRequest $refillRequest): RedirectResponse
    {
        try {
            $this->workflow->accept($refillRequest, $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$refillRequest->reference} accepted: it is waiting for a courier.");
    }
}
