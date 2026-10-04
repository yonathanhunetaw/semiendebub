<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\AcceptRefillRequest;
use App\Http\Requests\Inventory\AddRefillToRemoteListRequest;
use App\Http\Requests\Inventory\AddRefillsToManifestRequest;
use App\Http\Requests\Inventory\BuildRefillShipmentRequest;
use App\Http\Requests\Inventory\CancelRefillRequest;
use App\Http\Requests\Inventory\UpdateRefillQuantityRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\StockLocation;
use App\Services\Inventory\RefillBoard;
use App\Services\Inventory\RefillWorkflow;
use App\Services\Inventory\StockPermissions;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * The store manager's side of the refill list: take each suggestion onto the
 * Remote Hub → Store list or a shipment manifest (that is the approval), change
 * its amount, or cancel it. A Remote Hub manager who is a seller accepts here
 * too.
 */
class RefillRequestController extends Controller
{
    public function __construct(private readonly RefillWorkflow $workflow)
    {
    }

    /**
     * The store's waiting list. Everyone in the store sees it; only its
     * managers act on it (each row carries what the viewer may do).
     */
    public function index(Request $request, RefillBoard $board): Response
    {
        $user = $request->user();
        $storeId = $user?->store_id !== null ? (int) $user->store_id : null;

        // An admin with no store of their own looks at one by ?store=.
        if (in_array($user?->roleKey(), ['admin', 'dev'], true) && $request->filled('store')) {
            $storeId = $request->integer('store');
        }

        abort_if($storeId === null, 404, 'You are not assigned to a store.');

        return Inertia::render('Seller/Refills/Index', [
            'storeId' => $storeId,
            'board' => $board->waitingList($storeId, $user),
        ]);
    }

    /** Who may do what with shelves and refills, and who runs this store — read-only. */
    public function permissions(Request $request, StockPermissions $permissions): Response
    {
        $storeId = $request->user()?->store_id !== null ? (int) $request->user()->store_id : null;

        return Inertia::render('Seller/Refills/Permissions', [
            'abilities' => StockPermissions::catalogue(),
            'ticks' => StockPermissions::TICK_LABELS,
            'people' => $storeId !== null ? $permissions->peopleOf($storeId) : [],
        ]);
    }

    /** Put a suggestion on the Remote Hub → Store list (optionally a different amount). */
    public function addToRemoteList(AddRefillToRemoteListRequest $request, RefillRequest $refillRequest): RedirectResponse
    {
        return $this->attempt(
            fn (): RefillRequest => $this->workflow->addToRemoteList(
                $refillRequest,
                $request->user(),
                $request->validated('quantity') !== null ? (int) $request->validated('quantity') : null,
            ),
            "{$refillRequest->reference} is on the Remote Hub list.",
        );
    }

    /** Put suggestions on an existing shipment's manifest (the Replenishment Manifest panel). */
    public function addToManifest(AddRefillsToManifestRequest $request, Shipment $shipment): RedirectResponse
    {
        try {
            $added = $this->workflow->addToManifest($shipment, $request->quantities(), $request->user());
        } catch (InvalidArgumentException|\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$added} refill suggestion(s) added to {$shipment->reference}.");
    }

    public function update(UpdateRefillQuantityRequest $request, RefillRequest $refillRequest): RedirectResponse
    {
        return $this->attempt(
            fn (): RefillRequest => $this->workflow->updateQuantity($refillRequest, (int) $request->validated('quantity')),
            "{$refillRequest->reference} updated.",
        );
    }

    public function cancel(CancelRefillRequest $request, RefillRequest $refillRequest): RedirectResponse
    {
        return $this->attempt(
            fn (): RefillRequest => $this->workflow->cancel($refillRequest, $request->user(), $request->validated('reason')),
            "{$refillRequest->reference} cancelled.",
        );
    }

    public function accept(AcceptRefillRequest $request, RefillRequest $refillRequest): RedirectResponse
    {
        return $this->attempt(
            fn (): RefillRequest => $this->workflow->accept($refillRequest, $request->user()),
            "{$refillRequest->reference} accepted: it is waiting for a courier.",
        );
    }

    /** Build a new shipment from Hub A or B out of suggestions. */
    public function ship(BuildRefillShipmentRequest $request): RedirectResponse
    {
        try {
            $shipment = $this->workflow->buildShipment(
                StockLocation::query()->findOrFail((int) $request->validated('hub_location_id')),
                StockLocation::query()->findOrFail((int) $request->validated('destination_location_id')),
                $request->quantities(),
                $request->user(),
            );
        } catch (InvalidArgumentException|\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Shipment {$shipment->reference} built from ".count($request->quantities()).' refill suggestion(s).');
    }

    /** @param  callable(): RefillRequest  $action */
    private function attempt(callable $action, string $success): RedirectResponse
    {
        try {
            $action();
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $success);
    }
}
