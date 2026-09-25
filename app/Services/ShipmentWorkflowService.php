<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\ShipmentItem;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
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
        self::DRAFT => [self::SCHEDULED, self::CANCELLED],
        self::SCHEDULED => [self::PICKING, self::CANCELLED],
        self::PICKING => [self::READY, self::CANCELLED],
        self::READY => [self::DISPATCHED, self::CANCELLED],
        self::DISPATCHED => [self::IN_TRANSIT, self::CANCELLED],
        self::IN_TRANSIT => [self::DELIVERED],
        self::DELIVERED => [self::RECEIVED],
        self::RECEIVED => [],
        self::CANCELLED => [],
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
            self::SCHEDULED, self::PICKING, self::READY, self::DISPATCHED,
            self::IN_TRANSIT, self::DELIVERED, self::RECEIVED, self::CANCELLED,
        ],
        'seller' => [self::SCHEDULED, self::RECEIVED, self::CANCELLED],
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

        return Shipment::create(array_merge([
            'reference' => $this->nextReference(),
            'origin_store_id' => $originStoreId,
            'destination_store_id' => $destinationStoreId,
            'status' => self::DRAFT,
            'created_by' => $createdBy,
        ], $attributes));
    }

    /**
     * Put a SKU on the manifest, or adjust the quantity already there.
     *
     * Only possible while the manifest is still open (draft or scheduled) —
     * once picking starts, the manifest is what the floor is working to.
     */
    public function addItem(Shipment $shipment, ItemVariant $variant, int $quantity, array $attributes = []): ShipmentItem
    {
        if (! in_array($shipment->status, [self::DRAFT, self::SCHEDULED], true)) {
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

    public function removeItem(Shipment $shipment, ItemVariant $variant): bool
    {
        if (! in_array($shipment->status, [self::DRAFT, self::SCHEDULED], true)) {
            throw new \RuntimeException('The manifest is locked once picking has started.');
        }

        return (bool) $shipment->items()->where('item_variant_id', $variant->id)->delete();
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

        if ($to === self::SCHEDULED && $shipment->items()->count() === 0) {
            throw new \RuntimeException('A shipment cannot be scheduled with an empty manifest.');
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

        return array_values(array_intersect($this->allowedTransitions($shipment), $permitted));
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
    | Internals
    |--------------------------------------------------------------------------
    */

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
        $stock = ItemStock::firstOrCreate(
            [
                'item_variant_id' => $variantId,
                'location_type' => Store::class,
                'location_id' => $storeId,
            ],
            ['quantity' => 0, 'min_stock_level' => 0],
        );

        // Never drive a ledger row negative: a short origin books out what it has.
        $applied = $delta < 0
            ? -1 * min((int) $stock->quantity, abs($delta))
            : $delta;

        $stock->increment('quantity', $applied);
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

    private function nextReference(): string
    {
        return 'SHP-' . now()->format('ymd') . '-' . Str::upper(Str::random(5));
    }
}
