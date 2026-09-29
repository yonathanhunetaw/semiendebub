<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\ShipmentItem;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The single shipment lifecycle, shared by Admin, StockKeeper, Delivery and
 * Seller. Each role drives a different segment of the same state machine:
 *
 *   Admin/Seller  draft ──► scheduled                      (build & commit)
 *   StockKeeper   scheduled ──► picking ──► ready          (pick the manifest)
 *   StockKeeper   ready ──► dispatched                     (stock LEAVES origin)
 *   Delivery      dispatched ──► in_transit ──► delivered  (carry it)
 *   Seller/SK     delivered ──► received                   (stock LANDS)
 *
 * Stock is only ever in one place: it is deducted from the origin at dispatch
 * and added to the destination at receipt, never both.
 */
class ShipmentWorkflowService
{
    public const DRAFT = 'draft';

    /** Collecting the four party ticks; not yet schedulable. */
    public const PENDING_AGREEMENT = 'pending_agreement';

    public const SCHEDULED = 'scheduled';

    public const PICKING = 'picking';

    public const READY = 'ready';

    public const DISPATCHED = 'dispatched';

    public const IN_TRANSIT = 'in_transit';

    public const DELIVERED = 'delivered';

    public const RECEIVED = 'received';

    public const CANCELLED = 'cancelled';

    /**
     * Legal forward moves. Anything absent here is refused.
     *
     * @var array<string, array<int, string>>
     */
    private const TRANSITIONS = [
        self::DRAFT => [self::PENDING_AGREEMENT, self::SCHEDULED, self::CANCELLED],
        self::PENDING_AGREEMENT => [self::SCHEDULED, self::CANCELLED],
        self::SCHEDULED => [self::PICKING, self::CANCELLED],
        self::PICKING => [self::READY, self::CANCELLED],
        self::READY => [self::DISPATCHED, self::CANCELLED],
        self::DISPATCHED => [self::IN_TRANSIT, self::CANCELLED],
        self::IN_TRANSIT => [self::DELIVERED],
        self::DELIVERED => [self::RECEIVED],
        self::RECEIVED => [],
        self::CANCELLED => [],
    ];

    /**
     * Statuses during which the manifest may still be edited. Parties agree on
     * a *time*, so the load can still be adjusted while that is settled; the
     * manifest freezes once the floor starts picking to it.
     *
     * @var array<int, string>
     */
    private const MANIFEST_OPEN_STATES = [
        self::DRAFT,
        self::PENDING_AGREEMENT,
        self::SCHEDULED,
    ];

    /** Timestamp stamped on entering each status. */
    private const STAMPS = [
        self::PICKING => 'picked_at',
        self::DISPATCHED => 'dispatched_at',
        self::IN_TRANSIT => 'in_transit_at',
        self::DELIVERED => 'delivered_at',
        self::RECEIVED => 'received_at',
        self::CANCELLED => 'cancelled_at',
    ];

    /**
     * Which role owns which transition. Used by controllers to keep a role
     * from driving a segment that is not theirs.
     *
     * @var array<string, array<int, string>>
     */
    public const ROLE_TRANSITIONS = [
        'admin' => [
            self::PENDING_AGREEMENT, self::SCHEDULED, self::PICKING, self::READY,
            self::DISPATCHED, self::IN_TRANSIT, self::DELIVERED, self::RECEIVED,
            self::CANCELLED,
        ],
        'seller' => [self::PENDING_AGREEMENT, self::SCHEDULED, self::RECEIVED, self::CANCELLED],
        'stock_keeper' => [self::PICKING, self::READY, self::DISPATCHED, self::RECEIVED],
        'delivery' => [self::IN_TRANSIT, self::DELIVERED],
    ];

    public function __construct(private readonly StockKeeperService $stock)
    {
    }

    /*
    |--------------------------------------------------------------------------
    | Building
    |--------------------------------------------------------------------------
    */

    /**
     * Open a draft shipment between two stores.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function create(int $originStoreId, int $destinationStoreId, array $attributes = [], ?int $createdBy = null): Shipment
    {
        if ($originStoreId === $destinationStoreId) {
            throw new \InvalidArgumentException('Origin and destination must be different stores.');
        }

        // The creator's primary slot plus any alternatives become the menu the
        // other three parties choose from.
        $options = collect($attributes['schedule_options'] ?? [])
            ->map(fn ($slot) => $this->normaliseSlot($slot))
            ->filter()
            ->values();

        $primary = $this->normaliseSlot($attributes['scheduled_for'] ?? null) ?? $options->first();

        if ($primary !== null) {
            $options = $options->prepend($primary)->unique()->values();
        }

        unset($attributes['schedule_options']);

        $shipment = Shipment::create(array_merge([
            'reference' => $this->nextReference(),
            'origin_store_id' => $originStoreId,
            'destination_store_id' => $destinationStoreId,
            'status' => self::DRAFT,
            'created_by' => $createdBy,
        ], $attributes, [
            'schedule_options' => $options->all(),
        ]));

        // Party 1 is ticked on submission: proposing the schedule *is* the
        // creator's agreement. The remaining three start pending.
        if ($primary !== null) {
            $shipment->update([
                'party_agreements' => [
                    self::PARTY_CREATOR => [
                        'status' => self::AGREEMENT_ACCEPTED,
                        'slot' => $primary,
                        'at' => now()->toIso8601String(),
                        'user_id' => $createdBy,
                    ],
                ],
                'status' => self::PENDING_AGREEMENT,
            ]);
        }

        return $shipment->refresh();
    }

    /**
     * Put a SKU on the manifest, or adjust the quantity already there.
     *
     * Only possible while the manifest is still open (draft or scheduled) —
     * once picking starts, the manifest is what the floor is working to.
     */
    public function addItem(Shipment $shipment, ItemVariant $variant, int $quantity, array $attributes = []): ShipmentItem
    {
        if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
            throw new \RuntimeException('The manifest is locked once picking has started.');
        }

        if ($quantity < 1) {
            throw new \InvalidArgumentException('Quantity must be at least one.');
        }

        $existing = $shipment->items()->where('item_variant_id', $variant->id)->first();

        if ($existing) {
            $existing->update(array_merge($attributes, [
                'quantity' => $existing->quantity + $quantity,
            ]));

            return $existing->refresh();
        }

        return $shipment->items()->create(array_merge([
            'item_variant_id' => $variant->id,
            'quantity' => $quantity,
        ], $attributes));
    }

    /**
     * Put several SKUs on the manifest in one go.
     *
     * All or nothing: a multi-select that half-lands leaves the seller looking
     * at a manifest they did not ask for.
     *
     * @param  array<int, array<string, mixed>>  $lines  each with item_variant_id and quantity
     * @return int  lines written
     */
    public function addItems(Shipment $shipment, array $lines): int
    {
        if (! $this->manifestIsOpen($shipment)) {
            throw new \RuntimeException('The manifest is locked once picking has started.');
        }

        return DB::transaction(function () use ($shipment, $lines): int {
            $written = 0;

            foreach ($lines as $line) {
                $variant = ItemVariant::findOrFail((int) $line['item_variant_id']);

                $this->addItem(
                    $shipment,
                    $variant,
                    (int) $line['quantity'],
                    collect($line)
                        ->only(['cbm', 'weight_kg', 'unit', 'location'])
                        ->filter(fn ($v) => $v !== null)
                        ->all(),
                );

                $written++;
            }

            return $written;
        });
    }

    /**
     * Persist the quantities the manifest builder is showing.
     *
     * The Build screen edits quantities in local state; without this they were
     * never written, so "building the manifest" changed nothing. A quantity of
     * zero drops the line.
     *
     * @param  array<int|string, int|string>  $quantities  keyed by item_variant_id
     * @return int  lines actually changed
     */
    public function syncManifestQuantities(Shipment $shipment, array $quantities): int
    {
        if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
            throw new \RuntimeException('The manifest is locked once picking has started.');
        }

        $changed = 0;

        DB::transaction(function () use ($shipment, $quantities, &$changed): void {
            foreach ($shipment->items as $item) {
                $key = (string) $item->item_variant_id;

                if (! array_key_exists($key, $quantities) && ! array_key_exists((int) $key, $quantities)) {
                    continue;
                }

                $wanted = (int) ($quantities[$key] ?? $quantities[(int) $key]);

                if ($wanted <= 0) {
                    $item->delete();
                    $changed++;

                    continue;
                }

                if ($wanted !== (int) $item->quantity) {
                    $item->update(['quantity' => $wanted]);
                    $changed++;
                }
            }
        });

        return $changed;
    }

    /**
     * Assign or change the vehicle carrying a shipment.
     *
     * @param  array<string, mixed>  $vehicle
     */
    public function assignVehicle(Shipment $shipment, array $vehicle): Shipment
    {
        $shipment->update(array_filter([
            'vehicle_name' => $vehicle['name'] ?? null,
            'vehicle_plate' => $vehicle['plate'] ?? null,
            'vehicle_max_cbm' => $vehicle['max_cbm'] ?? null,
            'slot' => $vehicle['bay'] ?? null,
        ], fn ($v) => $v !== null));

        return $shipment->refresh();
    }

    /**
     * Can the manifest still be edited?
     *
     * The screens need to know this to stop offering edits the service would
     * refuse, so the state list is readable from outside.
     */
    public function manifestIsOpen(Shipment $shipment): bool
    {
        return in_array($shipment->status, self::MANIFEST_OPEN_STATES, true);
    }

    public function removeItem(Shipment $shipment, ItemVariant $variant): bool
    {
        if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
            throw new \RuntimeException('The manifest is locked once picking has started.');
        }

        return (bool) $shipment->items()->where('item_variant_id', $variant->id)->delete();
    }

    /**
     * Move a manifest line onto another open run.
     *
     * The Build screen offered "move to the previous/next run" and answered
     * with a browser alert: the line vanished from local state and nothing was
     * written. A real move needs both manifests still open and both runs
     * leaving the same dock — otherwise the line would be picked against stock
     * that is not at the origin it was promised from.
     *
     * @throws \RuntimeException when either manifest is locked, the runs leave
     *                           different origins, or the line is not there
     */
    public function moveItemTo(Shipment $from, Shipment $to, ItemVariant $variant): ShipmentItem
    {
        if ((int) $from->id === (int) $to->id) {
            throw new \InvalidArgumentException('A line cannot be moved onto its own manifest.');
        }

        foreach ([$from, $to] as $shipment) {
            if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
                throw new \RuntimeException(
                    "Manifest {$shipment->reference} is locked once picking has started."
                );
            }
        }

        if ((int) $from->origin_store_id !== (int) $to->origin_store_id) {
            throw new \RuntimeException('A line can only move between runs leaving the same origin.');
        }

        $line = $from->items()->where('item_variant_id', $variant->id)->first();

        if (! $line) {
            throw new \RuntimeException('That line is not on this manifest.');
        }

        return DB::transaction(function () use ($to, $variant, $line): ShipmentItem {
            $moved = $this->addItem($to, $variant, (int) $line->quantity, array_filter([
                'cbm' => $line->cbm,
                'weight_kg' => $line->weight_kg,
                'unit' => $line->unit,
                'location' => $line->location,
            ], fn ($v) => $v !== null));

            $line->delete();

            return $moved;
        });
    }

    /**
     * Other open runs a line could be moved onto, newest first.
     *
     * Restricted to runs leaving the same origin and visible to this user, so
     * the move sheet can only offer moves that moveItemTo() will accept.
     *
     * @return array<int, array<string, mixed>>
     */
    public function moveTargets(Shipment $shipment, ?User $user): array
    {
        return $this->visibleQuery($user)
            ->whereKeyNot($shipment->id)
            ->where('origin_store_id', $shipment->origin_store_id)
            ->whereIn('status', self::MANIFEST_OPEN_STATES)
            ->with('destination')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Shipment $target) => [
                'id' => (int) $target->id,
                'reference' => (string) $target->reference,
                'destination' => (string) ($target->destination?->name ?? 'Unknown'),
                'scheduled_run' => $target->scheduled_for?->format('Y-m-d\TH:i'),
            ])
            ->values()
            ->all();
    }

    /**
     * Change which stores a run travels between.
     *
     * Rerouting withdraws the other three parties' consent: a driver who
     * accepted a Kality → Merkato run has not accepted a Kality → Bole one, and
     * the dock that agreed to receive is no longer the receiving dock. Keeping
     * their ticks would let a rerouted run reach `scheduled` on agreements
     * nobody gave.
     *
     * @throws \RuntimeException when the manifest is already locked
     */
    public function reroute(Shipment $shipment, ?int $originStoreId, ?int $destinationStoreId): Shipment
    {
        if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
            throw new \RuntimeException('The route is fixed once picking has started.');
        }

        $origin = $originStoreId ?? (int) $shipment->origin_store_id;
        $destination = $destinationStoreId ?? (int) $shipment->destination_store_id;

        if ($origin === $destination) {
            throw new \InvalidArgumentException('Origin and destination must be different stores.');
        }

        $unchanged = $origin === (int) $shipment->origin_store_id
            && $destination === (int) $shipment->destination_store_id;

        if ($unchanged) {
            return $shipment;
        }

        $shipment->update(array_merge([
            'origin_store_id' => $origin,
            'destination_store_id' => $destination,
        ], $this->withdrawnConsentPayload($shipment)));

        return $shipment->refresh();
    }

    /**
     * Put a new primary slot on the table.
     *
     * The slot is added to the menu the other parties choose from and becomes
     * the creator's own agreement, because proposing a time *is* agreeing to
     * it. The other three go back to pending: a run cannot stay scheduled on
     * consent given for a time that no longer applies.
     *
     * @throws \RuntimeException when the manifest is already locked
     */
    public function reschedule(Shipment $shipment, string $slot, ?User $user = null): Shipment
    {
        if (! in_array($shipment->status, self::MANIFEST_OPEN_STATES, true)) {
            throw new \RuntimeException('The schedule is fixed once picking has started.');
        }

        $normalised = $this->normaliseSlot($slot);

        if ($normalised === null) {
            throw new \InvalidArgumentException('That is not a usable date and time.');
        }

        // Already the primary slot — nothing to withdraw.
        if ($normalised === $shipment->scheduled_for?->format('Y-m-d\TH:i')) {
            return $shipment;
        }

        $options = collect($this->scheduleOptions($shipment))
            ->prepend($normalised)
            ->unique()
            ->values()
            ->all();

        $shipment->update(array_merge([
            'scheduled_for' => $normalised,
            'schedule_options' => $options,
        ], $this->withdrawnConsentPayload($shipment, $normalised, $user)));

        return $shipment->refresh();
    }

    /**
     * The agreement ledger after a change that invalidates it: the creator is
     * re-ticked on the current proposal, the other three parties revert to
     * pending, and the run drops back to the agreement stage.
     *
     * @return array<string, mixed>
     */
    private function withdrawnConsentPayload(
        Shipment $shipment,
        ?string $creatorSlot = null,
        ?User $user = null,
    ): array {
        $agreements = $this->agreements($shipment);
        $slot = $creatorSlot ?? ($agreements[self::PARTY_CREATOR]['slot'] ?? null);

        foreach (self::PARTIES as $party) {
            if ($party === self::PARTY_CREATOR) {
                continue;
            }

            $agreements[$party] = [
                'status' => self::AGREEMENT_PENDING,
                'slot' => null,
                'at' => null,
                self::PARTY_ACTOR_KEY[$party] => null,
            ];
        }

        if ($slot !== null) {
            $agreements[self::PARTY_CREATOR] = [
                'status' => self::AGREEMENT_ACCEPTED,
                'slot' => $slot,
                'at' => now()->toIso8601String(),
                'user_id' => $user?->id
                    ?? $agreements[self::PARTY_CREATOR]['user_id']
                    ?? $shipment->created_by,
            ];
        }

        return [
            'party_agreements' => $agreements,
            'agreed_scheduled_for' => null,
            'status' => $slot === null ? self::DRAFT : self::PENDING_AGREEMENT,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Transitions
    |--------------------------------------------------------------------------
    */

    /**
     * Advance a shipment, moving stock where the transition demands it.
     *
     * @param  array<string, mixed>  $extra
     * @throws \RuntimeException when the move is not legal from the current status
     */
    public function transition(Shipment $shipment, string $to, array $extra = []): Shipment
    {
        $from = (string) $shipment->status;

        if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            throw new \RuntimeException("A shipment cannot move from {$from} to {$to}.");
        }

        if ($to === self::DISPATCHED) {
            $short = $this->uncoveredLines($shipment);

            if ($short !== []) {
                // Refuse rather than book out what is not there. applyStock()
                // clamps at zero, so without this the shipment advanced to
                // `dispatched` while moving nothing — the paperwork said the
                // goods left and the ledger said they never did.
                throw new \RuntimeException(
                    'Origin cannot cover the manifest: ' . implode('; ', $short) . '.'
                );
            }
        }

        if ($to === self::SCHEDULED) {
            if ($shipment->items()->count() === 0) {
                throw new \RuntimeException('A shipment cannot be scheduled with an empty manifest.');
            }

            // The consensus gate: all four parties must have accepted the same
            // slot. recordPartyAgreement() promotes automatically, so reaching
            // here without consensus means someone tried to skip the gate.
            if (! $this->canSchedule($shipment)) {
                $missing = $this->outstandingParties($shipment);

                throw new \RuntimeException(
                    $missing === []
                        ? 'All parties must agree on the same time slot before scheduling.'
                        : 'Still awaiting agreement from: ' . implode(', ', $missing) . '.'
                );
            }
        }

        return DB::transaction(function () use ($shipment, $to, $extra) {
            // Stock leaves the origin the moment the vehicle is dispatched.
            if ($to === self::DISPATCHED) {
                $this->moveManifest($shipment, (int) $shipment->origin_store_id, -1);
            }

            // ...and lands only when the destination confirms receipt.
            if ($to === self::RECEIVED) {
                $this->moveManifest($shipment, (int) $shipment->destination_store_id, 1);
            }

            // Cancelling after dispatch puts the load back where it came from.
            if ($to === self::CANCELLED && $this->hasLeftOrigin($shipment)) {
                $this->moveManifest($shipment, (int) $shipment->origin_store_id, 1);
            }

            $payload = array_merge(['status' => $to], $extra);

            if (isset(self::STAMPS[$to])) {
                $payload[self::STAMPS[$to]] = now();
            }

            $shipment->update($payload);

            return $shipment->refresh();
        });
    }

    /**
     * Drive a shipment forward to $target, walking any intermediate stages.
     *
     * The lifecycle has no shortcuts — `scheduled` cannot jump straight to
     * `dispatched`. Callers that express intent ("hand over now") need the
     * in-between steps walked for them, otherwise the action silently fails.
     *
     * @param  array<string, mixed>  $extra  applied on the final hop
     * @throws \RuntimeException when the target is unreachable from here
     */
    public function advanceTo(Shipment $shipment, string $target, array $extra = []): Shipment
    {
        $order = [
            self::DRAFT,
            self::PENDING_AGREEMENT,
            self::SCHEDULED,
            self::PICKING,
            self::READY,
            self::DISPATCHED,
            self::IN_TRANSIT,
            self::DELIVERED,
            self::RECEIVED,
        ];

        $from = array_search((string) $shipment->status, $order, true);
        $to = array_search($target, $order, true);

        if ($from === false || $to === false) {
            // Not a forward move (e.g. cancellation) — hand to transition().
            return $this->transition($shipment, $target, $extra);
        }

        if ($to <= $from) {
            throw new \RuntimeException("This shipment is already {$shipment->status}.");
        }

        foreach (array_slice($order, $from + 1, $to - $from) as $stage) {
            $isFinalHop = $stage === $target;
            $shipment = $this->transition($shipment, $stage, $isFinalHop ? $extra : []);
        }

        return $shipment;
    }

    /**
     * Record what the floor actually picked, line by line.
     *
     * @param  array<int, int>  $pickedByVariantId
     */
    public function recordPick(Shipment $shipment, array $pickedByVariantId): Shipment
    {
        if (! in_array($shipment->status, [self::SCHEDULED, self::PICKING], true)) {
            throw new \RuntimeException('Only a scheduled shipment can be picked.');
        }

        DB::transaction(function () use ($shipment, $pickedByVariantId): void {
            foreach ($shipment->items as $item) {
                if (! array_key_exists($item->item_variant_id, $pickedByVariantId)) {
                    continue;
                }

                $picked = max(0, (int) $pickedByVariantId[$item->item_variant_id]);

                // Never record picking more than the manifest called for.
                $item->update(['picked_quantity' => min($picked, $item->quantity)]);
            }
        });

        if ($shipment->status === self::SCHEDULED) {
            return $this->transition($shipment, self::PICKING);
        }

        return $shipment->refresh();
    }

    /**
     * A courier takes ownership of a dispatched shipment.
     */
    public function claim(Shipment $shipment, User $courier): bool
    {
        if ($shipment->courier_id !== null || $shipment->status !== self::DISPATCHED) {
            return false;
        }

        $shipment->update([
            'courier_id' => $courier->id,
            'vehicle_name' => $shipment->vehicle_name
                ?: trim($courier->first_name . ' ' . $courier->last_name),
        ]);

        return true;
    }

    /**
     * What this shipment may legally become next.
     *
     * @return array<int, string>
     */
    public function allowedTransitions(Shipment $shipment): array
    {
        return self::TRANSITIONS[(string) $shipment->status] ?? [];
    }

    /**
     * The subset of transitions a given role is permitted to drive.
     *
     * @return array<int, string>
     */
    public function allowedFor(Shipment $shipment, ?string $role): array
    {
        $permitted = self::ROLE_TRANSITIONS[strtolower((string) $role)] ?? [];
        $steps = array_values(array_intersect($this->allowedTransitions($shipment), $permitted));

        return array_values(array_filter($steps, function (string $step) use ($shipment): bool {
            // `scheduled` is reached by the fourth aligned party tick, never by a
            // button. Offering it while the gate is open would hand the UI an
            // action the backend is bound to refuse.
            if ($step === self::SCHEDULED) {
                return $this->canSchedule($shipment) && $shipment->items()->count() > 0;
            }

            // Entering the agreement stage is a side effect of recording the
            // first agreement, not something a user picks.
            return $step !== self::PENDING_AGREEMENT;
        }));
    }

    /*
    |--------------------------------------------------------------------------
    | Presentation
    |--------------------------------------------------------------------------
    */

    /**
     * Shape a shipment for any of the four role UIs.
     *
     * @return array<string, mixed>
     */
    public function present(Shipment $shipment, ?string $role = null): array
    {
        $shipment->loadMissing(['origin', 'destination', 'courier', 'creator', 'items.itemVariant.item']);

        return [
            'id' => (int) $shipment->id,
            'reference' => (string) $shipment->reference,
            'status' => (string) $shipment->status,
            'origin' => [
                'id' => (int) $shipment->origin_store_id,
                'name' => (string) ($shipment->origin?->name ?? 'Unknown'),
                'detail' => $shipment->origin?->location,
            ],
            'destination' => [
                'id' => (int) $shipment->destination_store_id,
                'name' => (string) ($shipment->destination?->name ?? 'Unknown'),
                'detail' => $shipment->destination?->location,
            ],
            'vehicle_name' => $shipment->vehicle_name,
            'vehicle_plate' => $shipment->vehicle_plate,
            'vehicle_max_cbm' => $shipment->vehicle_max_cbm !== null ? (float) $shipment->vehicle_max_cbm : null,
            'load_percentage' => $shipment->load_percentage,
            'courier' => $shipment->courier ? [
                'id' => (int) $shipment->courier->id,
                'name' => trim($shipment->courier->first_name . ' ' . $shipment->courier->last_name),
                'phone' => $shipment->courier->phone_number,
            ] : null,
            'created_by' => trim((string) ($shipment->creator?->first_name . ' ' . $shipment->creator?->last_name)) ?: null,
            'sku_count' => $shipment->items->count(),
            'total_units' => $shipment->total_units,
            'total_cbm' => $shipment->total_cbm,
            'total_weight' => $shipment->total_weight,
            'distance_km' => $shipment->distance_km !== null ? (float) $shipment->distance_km : null,
            'slot' => $shipment->slot,
            'gate_pass' => $shipment->gate_pass,
            'notes' => $shipment->notes,
            'cancel_reason' => $shipment->cancel_reason,
            'scheduled_for' => $shipment->scheduled_for?->toIso8601String(),
            'picked_at' => $shipment->picked_at?->toIso8601String(),
            'dispatched_at' => $shipment->dispatched_at?->toIso8601String(),
            'in_transit_at' => $shipment->in_transit_at?->toIso8601String(),
            'delivered_at' => $shipment->delivered_at?->toIso8601String(),
            'received_at' => $shipment->received_at?->toIso8601String(),
            'eta' => $shipment->eta?->toIso8601String(),
            'created_at' => $shipment->created_at?->toIso8601String(),
            'schedule_options' => $this->scheduleOptions($shipment),
            'agreements' => $this->presentAgreements($shipment),
            'agreed_scheduled_for' => $shipment->agreed_scheduled_for?->toIso8601String(),
            'outstanding_parties' => $this->outstandingParties($shipment),
            'can_schedule' => $this->canSchedule($shipment),
            // Which parties the *viewer* may tick. Without this the detail
            // screens had no way to know whether to offer the agreement action,
            // so none of them offered it at all.
            'actionable_parties' => $this->partiesFor($shipment, auth()->user()),
            'items' => $shipment->items->map(fn (ShipmentItem $item) => $this->presentItem($item, $shipment))->values()->all(),
            'allowed_transitions' => $role !== null
                ? $this->allowedFor($shipment, $role)
                : $this->allowedTransitions($shipment),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function presentItem(ShipmentItem $item, Shipment $shipment): array
    {
        $variant = $item->itemVariant;
        $onHand = $this->originStock($shipment, (int) $item->item_variant_id);

        return [
            'id' => (int) $item->id,
            'variant_id' => (int) $item->item_variant_id,
            'name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
            'sku' => $variant?->sku,
            'quantity' => (int) $item->quantity,
            'picked_quantity' => (int) $item->picked_quantity,
            'shortfall' => $item->shortfall,
            'unit' => $item->unit,
            'cbm' => $item->cbm !== null ? (float) $item->cbm : null,
            'weight_kg' => $item->weight_kg !== null ? (float) $item->weight_kg : null,
            'location' => $item->location,
            'stock_qty' => $onHand,
            // Can the origin actually cover this line right now?
            'coverage' => $onHand >= $item->quantity ? 'ok' : ($onHand > 0 ? 'low' : 'oos'),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Cross-role visibility
    |--------------------------------------------------------------------------
    |
    | Every party to a shipment must be able to see it from the moment it is
    | opened — the agreement gate is unworkable otherwise, because a courier
    | cannot tick "fleet" on a shipment that never appears in their list.
    |
    | One definition, used by all four role controllers.
    |
    */

    /**
     * Shipments the given user is entitled to see.
     *
     * @return Builder<Shipment>
     */
    public function visibleQuery(?User $user): Builder
    {
        $query = Shipment::query();

        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        $role = $user->roleKey();
        $storeId = $user->store_id ? (int) $user->store_id : null;

        // Admin and dev oversee the whole board.
        if (in_array($role, ['admin', 'dev'], true)) {
            return $query;
        }

        // A courier is not tied to a facility: they need to see anything that
        // still needs a fleet decision or a driver, plus their own runs.
        if ($role === 'delivery') {
            return $query->where(function (Builder $q) use ($user): void {
                $q->where('courier_id', $user->id)
                    ->orWhere(function (Builder $open): void {
                        $open->whereNull('courier_id')
                            ->whereNotIn('status', [self::RECEIVED, self::CANCELLED]);
                    });
            });
        }

        // Facility staff see shipments with their facility at either end. A
        // stock keeper with no facility assigned covers every dock.
        if ($storeId === null) {
            return $role === 'stock_keeper' ? $query : $query->whereRaw('1 = 0');
        }

        return $query->forStore($storeId);
    }

    /**
     * Can this user see this shipment at all?
     */
    public function isVisibleTo(Shipment $shipment, ?User $user): bool
    {
        return $this->visibleQuery($user)->whereKey($shipment->id)->exists();
    }

    /*
    |--------------------------------------------------------------------------
    | 4-party agreement gate
    |--------------------------------------------------------------------------
    |
    | A shipment is not schedulable on creation. The creator proposes a primary
    | slot plus optional alternatives; fleet, origin and destination each tick
    | agreement on one of those slots. Only when all four have ticked the SAME
    | slot does the shipment become `scheduled`, and that slot is recorded as
    | `agreed_scheduled_for`.
    |
    */

    public const PARTY_CREATOR = 'creator';

    public const PARTY_FLEET = 'fleet';

    public const PARTY_ORIGIN = 'origin';

    public const PARTY_DESTINATION = 'destination';

    /** @var array<int, string> */
    public const PARTIES = [
        self::PARTY_CREATOR,
        self::PARTY_FLEET,
        self::PARTY_ORIGIN,
        self::PARTY_DESTINATION,
    ];

    public const AGREEMENT_PENDING = 'pending';

    public const AGREEMENT_ACCEPTED = 'accepted';

    public const AGREEMENT_RESCHEDULED = 'rescheduled';

    /** The id column each party's actor is stored under. */
    private const PARTY_ACTOR_KEY = [
        self::PARTY_CREATOR => 'user_id',
        self::PARTY_FLEET => 'courier_id',
        self::PARTY_ORIGIN => 'stock_keeper_id',
        self::PARTY_DESTINATION => 'receiver_id',
    ];

    /**
     * The agreement ledger, with any missing party defaulted to pending.
     *
     * @return array<string, array<string, mixed>>
     */
    public function agreements(Shipment $shipment): array
    {
        $stored = $shipment->party_agreements ?? [];
        $out = [];

        foreach (self::PARTIES as $party) {
            $row = is_array($stored[$party] ?? null) ? $stored[$party] : [];

            $out[$party] = [
                'status' => (string) ($row['status'] ?? self::AGREEMENT_PENDING),
                'slot' => $row['slot'] ?? null,
                'at' => $row['at'] ?? null,
                self::PARTY_ACTOR_KEY[$party] => $row[self::PARTY_ACTOR_KEY[$party]] ?? null,
            ];
        }

        return $out;
    }

    /**
     * Slots the creator put on the table: the primary first, then alternatives.
     *
     * @return array<int, string>
     */
    public function scheduleOptions(Shipment $shipment): array
    {
        $options = collect($shipment->schedule_options ?? [])
            ->map(fn ($slot) => (string) $slot)
            ->filter()
            ->values();

        if ($options->isEmpty() && $shipment->scheduled_for) {
            $options = collect([$shipment->scheduled_for->format('Y-m-d\TH:i')]);
        }

        return $options->unique()->values()->all();
    }

    /**
     * Have all four parties accepted, and on the same slot?
     *
     * Alignment is the point of the gate: four acceptances on three different
     * times is not a consensus.
     */
    public function canSchedule(Shipment $shipment): bool
    {
        return $this->consensusSlot($shipment) !== null;
    }

    /**
     * The slot all four parties accepted, or null when there is no consensus.
     */
    public function consensusSlot(Shipment $shipment): ?string
    {
        $slots = [];

        foreach ($this->agreements($shipment) as $agreement) {
            if ($agreement['status'] !== self::AGREEMENT_ACCEPTED) {
                return null;
            }

            if (empty($agreement['slot'])) {
                return null;
            }

            $slots[] = (string) $agreement['slot'];
        }

        return count(array_unique($slots)) === 1 ? $slots[0] : null;
    }

    /**
     * Which parties are still outstanding.
     *
     * @return array<int, string>
     */
    public function outstandingParties(Shipment $shipment): array
    {
        return collect($this->agreements($shipment))
            ->reject(fn (array $a) => $a['status'] === self::AGREEMENT_ACCEPTED)
            ->keys()
            ->all();
    }

    /**
     * Record one party's stance, and promote the shipment the moment the fourth
     * aligned tick lands.
     *
     * @throws \InvalidArgumentException on an unknown party or a slot that was
     *                                   never offered
     * @throws \RuntimeException when the shipment is past the agreement stage
     */
    public function recordPartyAgreement(
        Shipment $shipment,
        string $party,
        string $slot,
        ?User $user = null,
        string $stance = self::AGREEMENT_ACCEPTED,
    ): Shipment {
        if (! in_array($party, self::PARTIES, true)) {
            throw new \InvalidArgumentException("Unknown shipment party [{$party}].");
        }

        if (! in_array($shipment->status, [self::DRAFT, self::PENDING_AGREEMENT], true)) {
            throw new \RuntimeException('This shipment has already left the agreement stage.');
        }

        $options = $this->scheduleOptions($shipment);

        if ($options !== [] && ! in_array($slot, $options, true)) {
            throw new \InvalidArgumentException('That time slot was not proposed for this shipment.');
        }

        return DB::transaction(function () use ($shipment, $party, $slot, $user, $stance) {
            // Lock the row so two parties ticking at once cannot each read a
            // three-tick state and both decide they are not the fourth.
            $locked = Shipment::query()->whereKey($shipment->id)->lockForUpdate()->firstOrFail();

            $agreements = $this->agreements($locked);
            $agreements[$party] = [
                'status' => $stance,
                'slot' => $slot,
                'at' => now()->toIso8601String(),
                self::PARTY_ACTOR_KEY[$party] => $user?->id,
            ];

            $payload = ['party_agreements' => $agreements];

            // Leaving draft the moment the first tick is recorded.
            if ($locked->status === self::DRAFT) {
                $payload['status'] = self::PENDING_AGREEMENT;
            }

            // The driver who agrees to carry it *is* the assigned driver.
            // Without this the run stays unclaimed and the courier is later
            // refused ("that run is not assigned to you") on their own shipment.
            if ($party === self::PARTY_FLEET
                && $stance === self::AGREEMENT_ACCEPTED
                && $locked->courier_id === null
                && $user !== null
            ) {
                $payload['courier_id'] = $user->id;
            }

            $locked->update($payload);

            $consensus = $this->consensusSlot($locked->refresh());

            if ($consensus !== null) {
                $locked->update([
                    'status' => self::SCHEDULED,
                    'agreed_scheduled_for' => $consensus,
                    'scheduled_for' => $consensus,
                ]);
            }

            return $locked->refresh();
        });
    }

    /**
     * Parties the given user is entitled to tick on this shipment.
     *
     * @return array<int, string>
     */
    public function partiesFor(Shipment $shipment, ?User $user): array
    {
        if (! $user) {
            return [];
        }

        // roleKey(), not ->role: the latter is display-formatted.
        $role = $user->roleKey();
        $storeId = $user->store_id ? (int) $user->store_id : null;
        $parties = [];

        if ($role === 'admin') {
            return self::PARTIES;
        }

        if ((int) $shipment->created_by === (int) $user->id) {
            $parties[] = self::PARTY_CREATOR;
        }

        if ($role === 'delivery') {
            // The assigned courier, or any courier while the run is unclaimed.
            if ($shipment->courier_id === null || (int) $shipment->courier_id === (int) $user->id) {
                $parties[] = self::PARTY_FLEET;
            }
        }

        if (in_array($role, ['stock_keeper', 'seller'], true)) {
            // A keeper with no store covers every dock.
            if ($storeId === null && $role === 'stock_keeper') {
                $parties[] = self::PARTY_ORIGIN;
                $parties[] = self::PARTY_DESTINATION;
            } else {
                if ($storeId === (int) $shipment->origin_store_id) {
                    $parties[] = self::PARTY_ORIGIN;
                }

                if ($storeId === (int) $shipment->destination_store_id) {
                    $parties[] = self::PARTY_DESTINATION;
                }
            }
        }

        return array_values(array_unique($parties));
    }

    /*
    |--------------------------------------------------------------------------
    | Legacy UI adapters
    |--------------------------------------------------------------------------
    |
    | The Seller shipment screens (index + Build/Review/Dispatched) predate this
    | service and speak their own vocabulary, declared in
    | resources/js/types/shipments.ts. Rather than rewrite those screens, the
    | real domain is projected into the shapes they already expect.
    |
    */

    /**
     * How the nine real statuses collapse onto the six the legacy UI knows.
     *
     * `cancelled` has no counterpart, so cancelled shipments are filtered out
     * of the feed rather than mislabelled.
     *
     * @var array<string, string>
     */
    private const LEGACY_STATUS = [
        self::DRAFT => 'pending',
        self::PENDING_AGREEMENT => 'pending',
        self::SCHEDULED => 'scheduled',
        self::PICKING => 'pending',
        self::READY => 'pending',
        self::DISPATCHED => 'dispatched',
        self::IN_TRANSIT => 'en_route',
        self::DELIVERED => 'shipped',
        self::RECEIVED => 'shipped',
    ];

    /** True when this shipment can be shown in a legacy screen at all. */
    public function hasLegacyStatus(Shipment $shipment): bool
    {
        return array_key_exists((string) $shipment->status, self::LEGACY_STATUS);
    }

    public function legacyStatus(Shipment $shipment): string
    {
        // An overdue schedule reads as overdue, which the UI styles in red.
        if ($shipment->scheduled_for
            && $shipment->scheduled_for->isPast()
            && in_array($shipment->status, [self::DRAFT, self::PENDING_AGREEMENT, self::SCHEDULED, self::PICKING, self::READY], true)
        ) {
            return 'overdue';
        }

        return self::LEGACY_STATUS[(string) $shipment->status] ?? 'pending';
    }

    /**
     * The four parties in the PartyAgreementInfo shape PartyDetailModal and
     * TransferCard consume — real stances, not the old hardcoded narrative.
     *
     * @return array<string, array<string, mixed>>
     */
    public function presentAgreements(Shipment $shipment): array
    {
        $shipment->loadMissing(['origin', 'destination', 'courier', 'creator']);
        $agreements = $this->agreements($shipment);

        $label = function (string $party, string $status): string {
            if ($status === self::AGREEMENT_ACCEPTED) {
                return match ($party) {
                    self::PARTY_CREATOR => 'Created',
                    self::PARTY_FLEET => 'Driver Accepted',
                    self::PARTY_ORIGIN => 'Origin Agreed',
                    default => 'Destination Agreed',
                };
            }

            if ($status === self::AGREEMENT_RESCHEDULED) {
                return 'Rescheduled';
            }

            return match ($party) {
                self::PARTY_FLEET => 'Pending Driver',
                self::PARTY_ORIGIN => 'Pending Origin Keeper',
                self::PARTY_DESTINATION => 'Pending Receiver',
                default => 'Pending Dispatch',
            };
        };

        $slotText = fn (?string $slot): string => $slot
            ? \Illuminate\Support\Carbon::parse($slot)->format('D d M, h:i A')
            : 'no slot chosen yet';

        $creatorName = trim((string) ($shipment->creator?->first_name . ' ' . $shipment->creator?->last_name)) ?: 'System';
        $courierName = $shipment->courier
            ? trim($shipment->courier->first_name . ' ' . $shipment->courier->last_name)
            : 'Unassigned';

        $meta = [
            self::PARTY_CREATOR => [
                'title' => '1. Creator',
                'role' => 'Originator',
                'party' => $creatorName,
                'detail' => fn (array $a) => 'Proposed ' . $slotText($a['slot']) . '.',
            ],
            self::PARTY_FLEET => [
                'title' => '2. Fleet',
                'role' => 'Carrier',
                'party' => $shipment->vehicle_name
                    ? $shipment->vehicle_name . ' • ' . ($shipment->vehicle_plate ?? 'TBD')
                    : $courierName,
                'detail' => fn (array $a) => $a['status'] === self::AGREEMENT_ACCEPTED
                    ? $courierName . ' agreed to ' . $slotText($a['slot']) . '.'
                    : 'Awaiting a driver to accept a slot.',
            ],
            self::PARTY_ORIGIN => [
                'title' => '3. Origin',
                'role' => $shipment->origin?->type_label ?? 'Facility',
                'party' => (string) ($shipment->origin?->name ?? 'Unknown'),
                'detail' => fn (array $a) => $a['status'] === self::AGREEMENT_ACCEPTED
                    ? 'Dock ready for ' . $slotText($a['slot']) . '.'
                    : 'Awaiting origin dock confirmation.',
            ],
            self::PARTY_DESTINATION => [
                'title' => '4. Dest.',
                'role' => $shipment->destination?->type_label ?? 'Facility',
                'party' => (string) ($shipment->destination?->name ?? 'Unknown'),
                'detail' => fn (array $a) => $a['status'] === self::AGREEMENT_ACCEPTED
                    ? 'Receiving bay ready for ' . $slotText($a['slot']) . '.'
                    : 'Awaiting receiver confirmation.',
            ],
        ];

        $out = [];

        foreach (self::PARTIES as $party) {
            $agreement = $agreements[$party];
            $status = $agreement['status'];

            // The modal treats the creator's agreed state as "created".
            $uiStatus = $party === self::PARTY_CREATOR && $status === self::AGREEMENT_ACCEPTED
                ? 'created'
                : $status;

            $out[$party] = [
                'title' => $meta[$party]['title'],
                'role' => $meta[$party]['role'],
                'party' => $meta[$party]['party'],
                'status' => $uiStatus,
                'status_label' => $label($party, $status),
                'detail' => ($meta[$party]['detail'])($agreement),
                'agreed_time' => $agreement['slot'],
            ];
        }

        return $out;
    }

    /**
     * Project a shipment onto the `ScheduledTransfer` contract consumed by
     * Seller/Shipments/index.tsx and TransferCard.
     *
     * @return array<string, mixed>
     */
    public function presentAsScheduledTransfer(Shipment $shipment): array
    {
        $shipment->loadMissing(['origin', 'destination', 'courier', 'creator', 'items']);

        $maxCbm = (float) ($shipment->vehicle_max_cbm ?? 0);

        return [
            'id' => (int) $shipment->id,
            'reference' => (string) $shipment->reference,
            'status' => $this->legacyStatus($shipment),
            'origin' => [
                'name' => (string) ($shipment->origin?->name ?? 'Unknown'),
                'detail' => (string) ($shipment->origin?->location ?? ''),
            ],
            'destination' => [
                'name' => (string) ($shipment->destination?->name ?? 'Unknown'),
                'detail' => (string) ($shipment->destination?->location ?? ''),
            ],
            'distance_km' => (float) ($shipment->distance_km ?? 0),
            'scheduled_run' => $shipment->scheduled_for?->format('Y-m-d\TH:i') ?? '',
            'cutoff_label' => $this->cutoffLabel($shipment),
            'sku_count' => $shipment->items->count(),
            'total_cartons' => $shipment->total_units,
            'total_cbm' => $shipment->total_cbm,
            'vehicle_max_cbm' => $maxCbm,
            'load_percentage' => $shipment->load_percentage,
            'vehicle_name' => (string) ($shipment->vehicle_name ?? 'To be assigned'),
            'vehicle_plate' => (string) ($shipment->vehicle_plate ?? 'TBD'),
            'slot' => (string) ($shipment->slot ?? 'TBD'),
            'created_by' => trim((string) ($shipment->creator?->first_name . ' ' . $shipment->creator?->last_name)) ?: 'System',
            'created_at' => $shipment->created_at?->toIso8601String(),
            'schedule_options' => $this->scheduleOptions($shipment),
            'agreements' => $this->presentAgreements($shipment),
            'agreed_scheduled_for' => $shipment->agreed_scheduled_for?->format('Y-m-d\TH:i'),
            'outstanding_parties' => $this->outstandingParties($shipment),
            'can_schedule' => $this->canSchedule($shipment),
            'workflow_status' => (string) $shipment->status,
            // Which parties the *viewer* may tick, so the UI only offers real actions.
            'actionable_parties' => $this->partiesFor($shipment, auth()->user()),
            // Lifecycle steps this viewer's role may drive next. The cards render
            // exactly these, so a button can never trigger a refused transition.
            'allowed_transitions' => $this->allowedFor($shipment, auth()->user()?->roleKey()),
        ];
    }

    /**
     * Manifest lines in the `ManifestItem` shape the Build/Review/Dispatched
     * screens expect.
     *
     * @return array<int, array<string, mixed>>
     */
    public function presentAsManifestItems(Shipment $shipment): array
    {
        $shipment->loadMissing('items.itemVariant.item');

        return $shipment->items->map(function (ShipmentItem $item) use ($shipment) {
            $line = $this->presentItem($item, $shipment);

            // The legacy screens key their badge off these four labels.
            $status = match ($line['coverage']) {
                'oos' => 'oos',
                'low' => 'low',
                default => 'regular',
            };

            return [
                'id' => (int) $item->item_variant_id,
                'name' => $line['name'],
                'sku' => (string) ($line['sku'] ?? '—'),
                'status' => $status,
                'status_label' => match ($status) {
                    'oos' => 'CRITICAL OOS',
                    'low' => 'LOW STOCK',
                    default => 'IN STOCK',
                },
                'stock_qty' => $line['stock_qty'],
                'quantity' => $line['quantity'],
                'unit' => (string) ($line['unit'] ?? 'Ctns'),
                'cbm' => (float) ($line['cbm'] ?? 0),
                'weight_kg' => (float) ($line['weight_kg'] ?? 0),
                'location' => (string) ($line['location'] ?? 'Unassigned'),
                'icon' => match ($status) {
                    'oos' => 'report',
                    'low' => 'warning',
                    default => 'inventory',
                },
                'added_by' => [
                    'type' => 'manual',
                    'name' => trim((string) ($shipment->creator?->first_name . ' ' . $shipment->creator?->last_name)) ?: 'System',
                    'reason' => 'Added to manifest',
                ],
            ];
        })->values()->all();
    }

    /**
     * The assigned vehicle in the legacy `Vehicle` shape.
     *
     * @return array<string, mixed>
     */
    public function presentAsVehicle(Shipment $shipment): array
    {
        return [
            'id' => 'shipment-' . $shipment->id,
            'name' => (string) ($shipment->vehicle_name ?? 'To be assigned'),
            'plate' => (string) ($shipment->vehicle_plate ?? 'TBD'),
            'icon' => 'local_shipping',
            'max_cbm' => (float) ($shipment->vehicle_max_cbm ?? 0),
            'payload_kg' => 0,
            'bay' => $shipment->slot,
            'is_primary' => true,
        ];
    }

    /** Human cutoff/status caption shown on the card. */
    private function cutoffLabel(Shipment $shipment): string
    {
        return match ((string) $shipment->status) {
            self::DELIVERED => 'Delivered ' . ($shipment->delivered_at?->format('h:i A') ?? ''),
            self::RECEIVED => 'Received ' . ($shipment->received_at?->format('h:i A') ?? ''),
            self::IN_TRANSIT => 'Departed ' . ($shipment->dispatched_at?->format('h:i A') ?? ''),
            self::DISPATCHED => 'Awaiting pickup',
            self::CANCELLED => 'Cancelled',
            default => $shipment->scheduled_for
                ? ($shipment->scheduled_for->isPast()
                    ? 'OVERDUE by ' . $shipment->scheduled_for->diffForHumans(null, true)
                    : 'Cutoff in ' . $shipment->scheduled_for->diffForHumans(null, true))
                : 'Not scheduled',
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * Manifest lines the origin cannot currently cover, described for a human.
     *
     * @return array<int, string>
     */
    public function uncoveredLines(Shipment $shipment): array
    {
        $shipment->loadMissing('items.itemVariant.item');
        $short = [];

        foreach ($shipment->items as $item) {
            $moving = $item->picked_quantity > 0 ? $item->picked_quantity : $item->quantity;
            $onHand = $this->stockAt((int) $item->item_variant_id, (int) $shipment->origin_store_id);

            if ($onHand < $moving) {
                $name = $item->itemVariant?->item?->product_name ?? ('variant ' . $item->item_variant_id);
                $short[] = "{$name} needs {$moving}, {$onHand} on hand";
            }
        }

        return $short;
    }

    /** Units of a variant held at one store. */
    private function stockAt(int $variantId, int $storeId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $variantId)
            ->where('location_type', Store::class)
            ->where('location_id', $storeId)
            ->sum('quantity');
    }

    /**
     * Apply the whole manifest to one store's ledger.
     *
     * $direction is -1 to take stock out, +1 to put it in. Picked quantities
     * win where they were recorded, because that is what physically moved.
     */
    private function moveManifest(Shipment $shipment, int $storeId, int $direction): void
    {
        foreach ($shipment->items as $item) {
            $moving = $item->picked_quantity > 0 ? $item->picked_quantity : $item->quantity;

            $this->applyStock(
                (int) $item->item_variant_id,
                $storeId,
                $direction * $moving,
            );
        }
    }

    /**
     * Apply a signed delta to a store's ledger row, creating it on first use.
     */
    private function applyStock(int $variantId, int $storeId, int $delta): void
    {
        // Ensure the row exists before locking it; firstOrCreate cannot lock.
        ItemStock::firstOrCreate(
            [
                'item_variant_id' => $variantId,
                'location_type' => Store::class,
                'location_id' => $storeId,
            ],
            ['quantity' => 0, 'min_stock_level' => 0],
        );

        // Pessimistic lock: two concurrent dispatches of the same SKU out of the
        // same facility must not both read the pre-deduction quantity.
        $stock = ItemStock::query()
            ->where('item_variant_id', $variantId)
            ->where('location_type', Store::class)
            ->where('location_id', $storeId)
            ->lockForUpdate()
            ->first();

        if (! $stock) {
            return;
        }

        // Never drive a ledger row negative: a short origin books out what it has.
        $applied = $delta < 0
            ? -1 * min((int) $stock->quantity, abs($delta))
            : $delta;

        $stock->update(['quantity' => (int) $stock->quantity + $applied]);
    }

    /** Has the load already been deducted from the origin? */
    private function hasLeftOrigin(Shipment $shipment): bool
    {
        return in_array($shipment->status, [self::DISPATCHED, self::IN_TRANSIT], true);
    }

    private function originStock(Shipment $shipment, int $variantId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $variantId)
            ->where('location_type', Store::class)
            ->where('location_id', $shipment->origin_store_id)
            ->sum('quantity');
    }

    /**
     * Slots are compared as strings, so they must be written one way:
     * `Y-m-d\TH:i`, which is also what the date/time inputs emit.
     */
    public function normaliseSlot(mixed $slot): ?string
    {
        if ($slot === null || $slot === '') {
            return null;
        }

        try {
            return \Illuminate\Support\Carbon::parse((string) $slot)->format('Y-m-d\TH:i');
        } catch (\Throwable) {
            return null;
        }
    }

    private function nextReference(): string
    {
        return 'SHP-' . now()->format('ymd') . '-' . Str::upper(Str::random(5));
    }
}
