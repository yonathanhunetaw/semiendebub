<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\MoveShipmentItemRequest;
use App\Http\Requests\Shipment\SaveShipmentManifestRequest;
use App\Http\Requests\Shipment\StoreShipmentItemRequest;
use App\Http\Requests\Shipment\StoreShipmentItemsRequest;
use App\Http\Requests\Shipment\StoreShipmentRequest;
use App\Models\Inventory\StockLocation;
use App\Http\Requests\Shipment\AgreeShipmentRequest;
use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Http\Requests\Shipment\UpdateShipmentRouteRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use App\Services\StockKeeperService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The seller's view of shipments touching their store.
 *
 * They raise replenishment requests inbound to their store, watch runs on the
 * road, and confirm receipt when a load lands — the confirmation that moves
 * the stock onto their books.
 *
 * This controller previously served entirely hardcoded demo arrays; it now
 * reads the shared `shipments` tables.
 */
class ShipmentController extends Controller
{
    use DrivesShipments;

    public function __construct(
        private readonly ShipmentWorkflowService $workflow,
        private readonly StockKeeperService $stock,
    ) {
    }

    protected function shipmentRole(): string
    {
        return 'seller';
    }

    /**
     * A seller only ever sees shipments with their store at one end.
     *
     * @return array<int, int>|null
     */
    protected function shipmentStoreScope(): ?array
    {
        return $this->ownStoreScope();
    }

    /**
     * Phase 0 — the shipment list.
     *
     * Serves `scheduled_transfers` in the legacy ScheduledTransfer shape so
     * Seller/Shipments/index.tsx renders unchanged, but every row is a real
     * record from the shared shipments domain.
     */
    public function index(Request $request): Response
    {
        $storeId = (int) (Auth::user()->store_id ?? 0);

        $shipments = $this->workflow->visibleQuery(Auth::user())
            ->with(['origin', 'destination', 'courier', 'creator', 'items.itemVariant.item'])
            ->where('status', '!=', ShipmentWorkflowService::CANCELLED)
            ->orderByDesc('id')
            ->get()
            ->filter(fn (Shipment $s) => $this->workflow->hasLegacyStatus($s));

        return Inertia::render('Seller/Shipments/index', [
            'scheduled_transfers' => $shipments
                ->map(fn (Shipment $s) => $this->workflow->presentAsScheduledTransfer($s))
                ->values()
                ->all(),
            // Real stores for the "new shipment" sheet, so the created record
            // points at actual rows rather than demo slugs.
            'stores' => $this->storeOptions(),
            'locations' => $this->locationOptions(),
        ]);
    }

    /**
     * Phase 1 — manifest builder.
     *
     * The screen used to hold its own demo arrays: three facilities, three
     * units, four SKUs and four October 2024 time windows. Everything it offers
     * now comes from the shared shipments domain, so the choices a seller makes
     * here are the same records the stock keeper picks against, the driver
     * carries and the admin board reports on.
     */
    public function show(Shipment $shipment): Response
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $transfer = $this->workflow->presentAsScheduledTransfer($shipment);

        return Inertia::render('Seller/Shipments/Build/index', array_merge(
            $this->partyProps($transfer),
            [
                'transfer_id' => (int) $shipment->id,
                'reference' => $transfer['reference'],
                'origin' => $transfer['origin'],
                'destination' => $transfer['destination'],
                'origin_store_id' => (int) $shipment->origin_store_id,
                'destination_store_id' => (int) $shipment->destination_store_id,
                'distance_km' => $transfer['distance_km'],
                'scheduled_run' => $transfer['scheduled_run'],
                'cutoff_label' => $transfer['cutoff_label'],
                'vehicles' => [$this->workflow->presentAsVehicle($shipment)],
                'manifest_items' => $this->workflow->presentAsManifestItems($shipment),
                // Both ends are re-pointable while the manifest is open, so the
                // Edit Route sheet offers every facility rather than a fixed three.
                'stores' => $this->storeOptions(),
                'locations' => $this->locationOptions(),
                'origin_location_id' => $shipment->origin_stock_location_id !== null ? (int) $shipment->origin_stock_location_id : null,
                'destination_location_id' => $shipment->destination_stock_location_id !== null ? (int) $shipment->destination_stock_location_id : null,
                // The SKUs the Add Items sheet may put on the manifest.
                'variants' => $this->stock->variantOptions()->all(),
                // Other open runs from the same dock, for the Move Item sheet.
                'move_targets' => $this->workflow->moveTargets($shipment, Auth::user()),
                'courier' => $this->courierProp($shipment),
                'can_edit_manifest' => $this->workflow->manifestIsOpen($shipment),
                // The Replenishment Manifest panel: refill suggestions from stock
                // keepers and the auto trigger this shipment could take.
                'replenishment' => app(\App\Services\Inventory\RefillBoard::class)
                    ->manifestPanel($shipment, Auth::user(), $this->workflow->manifestIsOpen($shipment)),
            ],
        ));
    }

    /**
     * Persist the manifest the Build screen is showing.
     *
     * Build edits quantities and the vehicle in local state; this is where those
     * edits become real. Previously the screen passed them to review() as query
     * parameters and they were dropped on the floor.
     */
    public function saveManifest(SaveShipmentManifestRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $validated = $request->validated();

        try {
            $changed = $this->workflow->syncManifestQuantities(
                $shipment,
                $validated['quantities'] ?? [],
            );

            // The slot was validated and then dropped, so editing the time on
            // the Build screen changed nothing and the other three parties were
            // never asked about the new one.
            if (($validated['scheduled_run'] ?? null) !== null) {
                $shipment = $this->workflow->reschedule(
                    $shipment,
                    (string) $validated['scheduled_run'],
                    Auth::user(),
                );
            }
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        if (array_intersect_key($validated, array_flip(['vehicle_name', 'vehicle_plate', 'vehicle_max_cbm'])) !== []) {
            $this->workflow->assignVehicle($shipment, [
                'name' => $validated['vehicle_name'] ?? null,
                'plate' => $validated['vehicle_plate'] ?? null,
                'max_cbm' => $validated['vehicle_max_cbm'] ?? null,
            ]);
        }

        return redirect()
            ->route('seller.shipments.review', $shipment)
            ->with('success', $changed > 0 ? "Manifest saved ({$changed} line(s) updated)." : 'Manifest saved.');
    }

    /**
     * Re-point the run at different stores.
     *
     * The Edit Route sheet used to write to local component state only: the
     * header changed on screen and the record kept its original corridor, so
     * the keeper at the old origin was still the one being asked to pick.
     */
    public function updateRoute(UpdateShipmentRouteRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $storeId = (int) (Auth::user()->store_id ?? 0);
        $origin = $request->originLocation() ?? $this->workflow->originLeaf($shipment);
        $destination = $request->destinationLocation() ?? $this->workflow->destinationLeaf($shipment);

        // The same rule as raising one: a seller cannot reroute a run away from
        // their own store and keep hold of it.
        if (! $this->touchesStore($origin, $storeId) && ! $this->touchesStore($destination, $storeId)) {
            return back()->withErrors([
                'destination_location_id' => 'A shipment must end at your own store or its Remote Hub.',
            ]);
        }

        try {
            $shipment = $this->workflow->reroute($shipment, null, null, $origin, $destination);
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with(
            'success',
            "Route set to {$shipment->originLocation?->name} → {$shipment->destinationLocation?->name}. "
                . 'Fleet, origin and destination have been asked to agree again.',
        );
    }

    /**
     * Phase 2 — review before dispatch.
     */
    public function review(Shipment $shipment): Response
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $transfer = $this->workflow->presentAsScheduledTransfer($shipment);
        $items = $this->workflow->presentAsManifestItems($shipment);

        return Inertia::render('Seller/Shipments/Review/index', array_merge(
            $this->partyProps($transfer),
            [
                'transfer_id' => (int) $shipment->id,
                'reference' => $transfer['reference'],
                'origin' => $transfer['origin'],
                'destination' => $transfer['destination'],
                'distance_km' => $transfer['distance_km'],
                'scheduled_run' => $transfer['scheduled_run'],
                'cutoff_label' => $transfer['cutoff_label'],
                'slot' => $transfer['slot'],
                'vehicle' => $this->workflow->presentAsVehicle($shipment),
                'manifest_items' => $items,
                'total_cbm' => (float) array_sum(array_column($items, 'cbm')),
                'total_kg' => (float) array_sum(array_column($items, 'weight_kg')),
                'total_cartons' => (int) array_sum(array_column($items, 'quantity')),
                'courier' => $this->courierProp($shipment),
                // Review used to claim all four parties had signed off the
                // moment the screen loaded. Dispatch is only actually open once
                // the gate really is clear.
                'can_dispatch' => ! in_array($shipment->status, [
                    ShipmentWorkflowService::DRAFT,
                    ShipmentWorkflowService::PENDING_AGREEMENT,
                ], true) && $items !== [],
            ],
        ));
    }

    /**
     * Phase 2 → 3 — dispatch for real.
     *
     * The old implementation was a bare redirect with a `// TODO: Mark Transfer
     * as dispatched` comment. It now drives the actual lifecycle, which is what
     * moves stock out of the origin.
     */
    public function dispatchShipment(Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        // The agreement gate comes first. Reporting this plainly matters: the
        // old code walked into transition(), caught the exception and redirected
        // back, so pressing Dispatch appeared to do nothing at all.
        if (in_array($shipment->status, [
            ShipmentWorkflowService::DRAFT,
            ShipmentWorkflowService::PENDING_AGREEMENT,
        ], true)) {
            $missing = $this->workflow->outstandingParties($shipment);

            return back()->with('error', $missing === []
                ? 'All four parties must agree on the same time slot before dispatch.'
                : 'Cannot dispatch yet — awaiting agreement from: ' . implode(', ', $missing) . '.');
        }

        if ($shipment->items()->count() === 0) {
            return back()->with('error', 'Add at least one line to the manifest before dispatching.');
        }

        // Walk the remaining stages in one go.
        try {
            $shipment = $this->workflow->advanceTo($shipment, ShipmentWorkflowService::DISPATCHED);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('seller.shipments.dispatched', $shipment)
            ->with('success', "Shipment {$shipment->reference} dispatched.");
    }

    /**
     * Phase 3 — dispatched confirmation.
     */
    public function dispatched(Shipment $shipment): Response
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $transfer = $this->workflow->presentAsScheduledTransfer($shipment);
        $items = $this->workflow->presentAsManifestItems($shipment);
        $eta = $shipment->eta;

        return Inertia::render('Seller/Shipments/Dispatched/index', [
            'transfer_id' => (int) $shipment->id,
            'reference' => $transfer['reference'],
            'origin' => $transfer['origin'],
            'destination' => $transfer['destination'],
            'vehicle' => $this->workflow->presentAsVehicle($shipment),
            'manifest_items' => $items,
            'total_cbm' => (float) array_sum(array_column($items, 'cbm')),
            'total_cartons' => (int) array_sum(array_column($items, 'quantity')),
            'driver' => [
                'name' => $shipment->courier
                    ? trim($shipment->courier->first_name . ' ' . $shipment->courier->last_name)
                    : 'Awaiting assignment',
                'phone' => (string) ($shipment->courier?->phone_number ?? ''),
            ],
            'gate_pass' => (string) ($shipment->gate_pass ?? '—'),
            'eta' => $eta?->format('h:i A') ?? '—',
            'est_mins' => $eta ? max(0, now()->diffInMinutes($eta, false)) : 0,
            'transit_pct' => $shipment->status === ShipmentWorkflowService::IN_TRANSIT ? 50 : 0,
        ]);
    }

    /**
     * Raise a replenishment request: stock moving from another store into mine.
     */
    public function store(StoreShipmentRequest $request): RedirectResponse
    {
        $storeId = (int) (Auth::user()->store_id ?? 0);
        $origin = $request->originLocation();
        $destination = $request->destinationLocation();

        // A seller may raise a shipment only into their own store (or its
        // Remote Hub): freight runs from a Main Hub, so it is always inbound.
        if (! $this->touchesStore($origin, $storeId) && ! $this->touchesStore($destination, $storeId)) {
            return back()->withErrors([
                'destination_location_id' => 'A shipment must end at your own store or its Remote Hub.',
            ]);
        }

        try {
            $shipment = $this->workflow->createBetween(
                $origin,
                $destination,
                collect($request->validated())
                    ->only(['scheduled_for', 'schedule_options', 'notes'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
                Auth::id(),
            );
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['destination_location_id' => $e->getMessage()]);
        }

        return redirect()
            ->route('seller.shipments.show', $shipment)
            ->with('success', "Replenishment {$shipment->reference} opened.");
    }

    /** Is this end the seller's store — its floor, shelf or Remote Hub? */
    private function touchesStore(?StockLocation $location, int $storeId): bool
    {
        return $location !== null && $storeId > 0 && StoreShipmentRequest::storeIdOf($location) === $storeId;
    }

    /**
     * Where freight can run: from a Main Hub (A or B) to a store or a Remote
     * Hub, as location ids from the tree.
     *
     * @return array{origins: array<int, array<string, string>>, destinations: array<int, array<string, string>>}
     */
    private function locationOptions(): array
    {
        $option = fn (StockLocation $location, string $label): array => [
            'value' => (string) $location->id,
            'label' => $label,
        ];

        $hubs = StockLocation::query()->ofKind(StockLocation::KIND_MAIN_HUB)->orderBy('name')->get();
        $floors = StockLocation::query()->ofKind(StockLocation::KIND_BACKROOM)->with('store')->get()
            ->sortBy(fn (StockLocation $l) => $l->store?->name);
        $remotes = StockLocation::query()->ofKind(StockLocation::KIND_REMOTE_HUB)->orderBy('name')->get();

        return [
            'origins' => $hubs->map(fn (StockLocation $hub) => $option($hub, $hub->name.' — Main Hub'))->values()->all(),
            'destinations' => $floors->map(fn (StockLocation $floor) => $option($floor, ($floor->store?->name ?? $floor->name).' — Store'))
                ->concat($remotes->map(fn (StockLocation $remote) => $option($remote, $remote->name.' — Remote Hub')))
                ->values()
                ->all(),
        ];
    }

    /**
     * Every facility, either end of a run.
     *
     * Retail stores, central warehouses and remote warehouses are all
     * selectable; the type is in the label so a picker can tell a depot from a
     * shop floor.
     *
     * @return array<int, array<string, string>>
     */
    private function storeOptions(): array
    {
        return Store::query()
            ->orderBy('name')
            ->get()
            // Warehouses first, then retail. Sorted in PHP because the test
            // suite runs on SQLite, which has no FIELD().
            ->sortBy(fn (Store $store) => match ($store->type) {
                Store::TYPE_CENTRAL_WAREHOUSE => 0,
                Store::TYPE_REMOTE_WAREHOUSE => 1,
                default => 2,
            })
            ->map(fn (Store $store) => [
                'value' => (string) $store->id,
                'label' => trim(sprintf(
                    '%s — %s%s',
                    $store->name,
                    $store->type_label,
                    $store->location ? " · {$store->location}" : '',
                )),
            ])
            ->values()
            ->all();
    }

    /**
     * The 4-party gate as it actually stands.
     *
     * Build and Review each carried their own invented cast — a driver called
     * Abebe K., a keeper called Dawit T. — with stances derived from the screen
     * the seller happened to be on. These are the real stances recorded by the
     * delivery, stock keeper and admin roles, plus which of them this viewer may
     * tick.
     *
     * @param  array<string, mixed>  $transfer
     * @return array<string, mixed>
     */
    private function partyProps(array $transfer): array
    {
        return [
            'agreements' => $transfer['agreements'],
            'schedule_options' => $transfer['schedule_options'],
            'agreed_scheduled_for' => $transfer['agreed_scheduled_for'],
            'outstanding_parties' => $transfer['outstanding_parties'],
            'actionable_parties' => $transfer['actionable_parties'],
            'allowed_transitions' => $transfer['allowed_transitions'],
            'workflow_status' => $transfer['workflow_status'],
        ];
    }

    /**
     * The driver on the run, once the fleet party has taken it.
     *
     * @return array<string, string>|null
     */
    private function courierProp(Shipment $shipment): ?array
    {
        if (! $shipment->courier) {
            return null;
        }

        return [
            'name' => trim($shipment->courier->first_name . ' ' . $shipment->courier->last_name),
            'phone' => (string) ($shipment->courier->phone_number ?? ''),
        ];
    }

    public function addItem(StoreShipmentItemRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $variant = ItemVariant::findOrFail((int) $request->validated('item_variant_id'));

        try {
            $this->workflow->addItem(
                $shipment,
                $variant,
                (int) $request->validated('quantity'),
                collect($request->validated())
                    ->only(['cbm', 'weight_kg', 'unit', 'location'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
            );
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Manifest updated.');
    }

    /**
     * Put a whole Add Items selection on the manifest.
     *
     * The sheet used to append its picks to local state from a four-SKU demo
     * array, so nothing the seller added survived the next page load.
     */
    public function addItems(StoreShipmentItemsRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        try {
            $written = $this->workflow->addItems($shipment, $request->validated('lines'));
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$written} line(s) added to the manifest.");
    }

    /**
     * Drop a line from the manifest.
     *
     * Build removed the row from local state and left the record alone, so the
     * line reappeared on the next page load and the keeper was still asked to
     * pick it.
     */
    public function removeItem(Shipment $shipment, ItemVariant $variant): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        try {
            $this->workflow->removeItem($shipment, $variant);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Line removed from manifest.');
    }

    /**
     * Move a line onto another open run leaving the same dock.
     *
     * The Move Item sheet used to offer "previous run" and "next run" and
     * answer with a browser alert, dropping the line on the floor. The targets
     * now come from the server and the line really lands on the other manifest.
     */
    public function moveItem(
        MoveShipmentItemRequest $request,
        Shipment $shipment,
        ItemVariant $variant,
    ): RedirectResponse {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $target = Shipment::findOrFail((int) $request->validated('target_shipment_id'));

        abort_unless($this->shipmentIsInScope($target), 403);

        try {
            $this->workflow->moveItemTo($shipment, $target, $variant);
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Line moved to {$target->reference}.");
    }

    public function transition(TransitionShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->driveShipment($request, $shipment, $this->workflow);
    }

    /**
     * Tick this role's party agreement on a proposed slot.
     */
    public function agree(AgreeShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->agreeAsParty($request, $shipment, $this->workflow);
    }

    /**
     * Origin handover: the keeper hands the load to the driver.
     *
     * This is the moment stock leaves the origin ledger.
     */
    public function handover(Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        // advanceTo(), not transition(): `scheduled` cannot jump straight to
        // `dispatched`, so a bare transition here failed silently.
        try {
            $shipment = $this->workflow->advanceTo($shipment, ShipmentWorkflowService::DISPATCHED);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Handed to the courier — stock left {$shipment->originLocation?->name}.");
    }

    /**
     * Destination receipt: the receiver inspects and accepts the goods.
     *
     * This is the moment stock is credited to the destination ledger.
     */
    public function receive(Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        try {
            $shipment = $this->workflow->advanceTo($shipment, ShipmentWorkflowService::RECEIVED);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Received — stock credited to {$shipment->destinationLocation?->name}.");
    }
}
