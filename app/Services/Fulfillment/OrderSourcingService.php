<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Fulfillment\Delivery;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Inventory\StockReservation;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\LocationCapacityService;
use App\Services\Inventory\StockScope;
use App\Services\StockService;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Where each line of an order comes from — proposed at checkout, decided in
 * Pick & Pack.
 *
 * Two halves of one question.
 *
 * Before payment the shopper is shown the *closest* place each line can be
 * sourced from, grouped so a basket reads as "these three are in the store,
 * this one comes from the hub". A line that can only come from a main warehouse
 * carries a later promise, and checkout refuses to take the money until the
 * buyer has agreed to that wait — the agreement is a condition of the sale, not
 * a dismissible notice.
 *
 * After payment the order sits in Pick & Pack and nothing is assumed: staff
 * name the exact shelf, back room or warehouse each line is picked from, and
 * only when every line is confirmed does the order become a Delivery. That
 * confirmation is what moves the positional ledger, so stock leaves the place
 * it physically left.
 *
 * @see \App\Services\Fulfillment\MovementDomainService for the hierarchy and
 *      the Shipment / Transfer / Delivery boundary.
 */
class OrderSourcingService
{
    /** Where Pick & Pack may take a customer's goods from. */
    public const CUSTOMER_SOURCES = [
        \App\Models\Inventory\StockLocation::KIND_SHELF,
        \App\Models\Inventory\StockLocation::KIND_BACKROOM,
        \App\Models\Inventory\StockLocation::KIND_REMOTE_HUB,
    ];

    public function __construct(
        private readonly MovementDomainService $domain,
        private readonly LocationCapacityService $capacity,
        private readonly StockService $stock,
        private readonly StockScope $scope,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | Before payment: grouping the cart
    |--------------------------------------------------------------------------
    */

    /**
     * The shopper's cart, grouped by the closest location that can serve each
     * line.
     *
     * @return array{
     *     groups: array<int, array<string, mixed>>,
     *     requires_agreement: bool,
     *     delayed_line_count: int
     * }
     */
    public function groupCart(?Cart $cart, Store $store): array
    {
        if ($cart === null) {
            return ['groups' => [], 'requires_agreement' => false, 'delayed_line_count' => 0];
        }

        $cart->loadMissing(['variants.item']);

        $hierarchy = $this->domain->hierarchyFor($store);
        $grouped = [];
        $delayedLines = 0;

        foreach ($cart->variants as $variant) {
            $quantity = (int) ($variant->pivot->quantity ?? 1);
            $placement = $this->closestSourceFor((int) $variant->id, $quantity, $hierarchy);
            $promise = $this->domain->fulfilmentPromiseFor($placement['node']['kind']);
            $key = $placement['node']['kind'];

            if (! isset($grouped[$key])) {
                $grouped[$key] = [
                    'key' => $key,
                    'label' => $placement['node']['label'],
                    'location_name' => $placement['node']['name'],
                    'promise' => $promise['promise'],
                    'requires_agreement' => $promise['delayed'],
                    'lines' => [],
                ];
            }

            if ($promise['delayed']) {
                $delayedLines++;
            }

            $grouped[$key]['lines'][] = [
                'variant_id' => (int) $variant->id,
                'title' => (string) ($variant->item?->product_name ?? 'Unnamed product'),
                'sku' => $variant->sku,
                'quantity' => $quantity,
                'available_here' => $placement['available'],
                'fully_covered' => $placement['available'] >= $quantity,
            ];
        }

        // Nearest group first, so the basket reads outward from the shop floor.
        $groups = array_values($grouped);
        usort(
            $groups,
            fn (array $a, array $b): int => (MovementDomainService::PROXIMITY[$a['key']] ?? 9)
                <=> (MovementDomainService::PROXIMITY[$b['key']] ?? 9),
        );

        return [
            'groups' => $groups,
            'requires_agreement' => $delayedLines > 0,
            'delayed_line_count' => $delayedLines,
        ];
    }

    /**
     * Does this cart contain anything the buyer must agree to wait for?
     */
    public function requiresDelayAgreement(?Cart $cart, Store $store): bool
    {
        return $this->groupCart($cart, $store)['requires_agreement'];
    }

    /*
    |--------------------------------------------------------------------------
    | After payment: Pick & Pack
    |--------------------------------------------------------------------------
    */

    /**
     * A paid order, with the real choices available for each line.
     *
     * Every line offers every location that holds stock of it — staff pick from
     * where the goods actually are, and the proposal the cart made is only a
     * suggestion.
     *
     * @return array<string, mixed>
     */
    public function pickPackPlan(Sale $sale): array
    {
        $sale->loadMissing([
            'items.storeVariant.itemVariant.item',
            'items.storeVariant.itemVariant.itemColor',
            'items.storeVariant.itemVariant.itemSize',
            'store',
            'customer',
        ]);

        $store = $sale->store;

        // Only places that serve customers: the store's shelf, its floor (or
        // the store as a whole, which picks from the floor) and its Remote
        // Hub. Main Hubs ship to stores rather than to customers, so offering
        // them here would only end in a refusal.
        $hierarchy = array_values(array_filter(
            $store !== null ? $this->domain->hierarchyFor($store) : [],
            // The store "as a whole" is not offered either: its figure is
            // shelf + floor, but a pick from it can only take from the floor,
            // so it would promise units it cannot deliver.
            fn (array $node): bool => ! in_array($node['kind'], [MovementDomainService::NODE_MAIN_WAREHOUSE, MovementDomainService::NODE_STORE], true),
        ));

        $lines = $sale->items->map(function (SaleItem $item) use ($hierarchy): array {
            $storeVariant = $item->storeVariant;
            $variant = $storeVariant?->itemVariant;
            $itemVariantId = (int) ($storeVariant->item_variant_id ?? 0);

            $options = [];

            foreach ($hierarchy as $node) {
                $onHand = $itemVariantId === 0
                    ? 0
                    : $this->capacity->onHand($itemVariantId, $node['type'], (int) $node['id']);

                $promise = $this->domain->fulfilmentPromiseFor($node['kind']);

                $options[] = [
                    'location_type' => $node['type'],
                    'location_id' => $node['id'],
                    'kind' => $node['kind'],
                    'level_label' => $node['label'],
                    'name' => $node['name'],
                    'on_hand' => $onHand,
                    'sufficient' => $onHand >= (int) $item->quantity,
                    'delayed' => $promise['delayed'],
                    'promise' => $promise['promise'],
                ];
            }

            $suggested = collect($options)->firstWhere('sufficient', true);

            return [
                'id' => (int) $item->id,
                'store_variant_id' => (int) $item->store_variant_id,
                'title' => (string) ($variant?->item?->product_name ?? 'Unnamed product'),
                'variant_label' => collect([
                    $variant?->itemColor?->name,
                    $variant?->itemSize?->name,
                ])->filter()->join(' · ') ?: 'Standard',
                'sku' => $variant?->sku,
                'quantity' => (int) $item->quantity,
                'picked_quantity' => (int) $item->picked_quantity,
                'unit_price' => (float) $item->unit_price,
                'line_total' => (float) $item->total_price,
                'confirmed_source' => $item->source_location_type === null ? null : [
                    'location_type' => $item->source_location_type,
                    'location_id' => (int) $item->source_location_id,
                ],
                'suggested_source' => $suggested === null ? null : [
                    'location_type' => $suggested['location_type'],
                    'location_id' => $suggested['location_id'],
                ],
                'options' => $options,
                'is_sourced' => $item->isSourced(),
            ];
        })->values()->all();

        return [
            'sale' => [
                'id' => (int) $sale->id,
                'reference' => (string) $sale->reference_number,
                'customer' => $sale->customer?->name,
                'store_name' => $store?->name,
                'total_amount' => (float) $sale->total_amount,
                'payment_status' => (string) $sale->payment_status,
                'fulfillment_stage' => (string) $sale->fulfillment_stage,
                'stage_label' => $sale->stageLabel(),
                'delay_agreed' => $sale->delayAgreed(),
                'sourcing_confirmed_at' => $sale->sourcing_confirmed_at?->toIso8601String(),
            ],
            'lines' => $lines,
        ];
    }

    /**
     * Commit the sourcing decisions and move the order to "To Deliver".
     *
     * Everything happens together: a half-sourced order is not a state the
     * pipeline has, so a line that cannot be satisfied aborts the lot rather
     * than leaving stock booked out with nothing to show for it.
     *
     * @param  array<int, array{sale_item_id: int, location_type: string, location_id: int, quantity?: int}>  $decisions
     *
     * @throws InsufficientStockException when a chosen location cannot cover its line
     * @throws RuntimeException when a line is missing a decision
     */
    public function confirmSourcing(Sale $sale, array $decisions, ?User $staff = null): Sale
    {
        $sale->loadMissing(['items.storeVariant', 'delivery', 'customer']);

        $byLine = collect($decisions)->keyBy(fn (array $decision): int => (int) $decision['sale_item_id']);

        return DB::transaction(function () use ($sale, $byLine, $staff): Sale {
            // Two pickers confirming the same order must not both book it out.
            $current = Sale::query()->whereKey($sale->id)->lockForUpdate()->value('fulfillment_stage');

            if ($current !== Sale::STAGE_PICK_PACK) {
                throw new RuntimeException("Order {$sale->reference_number} is no longer waiting in Pick & Pack.");
            }

            foreach ($sale->items as $item) {
                $decision = $byLine->get((int) $item->id);

                if ($decision === null) {
                    throw new RuntimeException(
                        "Line #{$item->id} has no confirmed pick location. Every line must be sourced before the order can move to delivery."
                    );
                }

                $locationType = (string) $decision['location_type'];
                $locationId = (int) $decision['location_id'];
                $quantity = (int) ($decision['quantity'] ?? $item->quantity);

                $storeVariant = $item->storeVariant;

                if (! $storeVariant instanceof StoreVariant) {
                    throw new RuntimeException("Line #{$item->id} is not attached to a store variant.");
                }

                $itemVariantId = (int) $storeVariant->item_variant_id;
                $onHand = $this->capacity->onHand($itemVariantId, $locationType, $locationId);

                if ($onHand < $quantity) {
                    $node = $this->domain->describe($locationType, $locationId);

                    throw new InsufficientStockException(
                        message: sprintf(
                            '%s holds %d of this line, %d needed. Pick from somewhere that has it.',
                            $node['label'] . ' · ' . $node['name'],
                            $onHand,
                            $quantity,
                        ),
                        storeVariantId: (int) $storeVariant->id,
                        requestedQuantity: $quantity,
                        availableStock: $onHand,
                    );
                }

                // The ledger moves here, at the place the goods physically
                // left — not at checkout, which only reserved at the store.
                $this->bookOut($item, $itemVariantId, $locationType, $locationId, $quantity, $staff);

                $item->update([
                    'source_location_type' => $locationType,
                    'source_location_id' => $locationId,
                    'picked_quantity' => $quantity,
                    'picked_at' => now(),
                    'picked_by' => $staff?->id,
                    'packed_at' => now(),
                ]);
            }

            $sale->update([
                'fulfillment_stage' => Sale::STAGE_TO_DELIVER,
                'sourcing_confirmed_at' => now(),
                'sourcing_confirmed_by' => $staff?->id,
            ]);

            $this->attachDelivery($sale->refresh());

            return $sale;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * The nearest node that can serve a line, with how much it holds.
     *
     * Falls back, in order: the closest place holding the whole line, then the
     * closest place holding any of it, then the furthest node in the hierarchy
     * as a back-order — which is a main warehouse, so the buyer is told about
     * the wait rather than being shown an empty basket.
     *
     * @param  array<int, array<string, mixed>>  $hierarchy
     * @return array{node: array<string, mixed>, available: int}
     */
    private function closestSourceFor(int $itemVariantId, int $quantity, array $hierarchy): array
    {
        $partial = null;

        foreach ($hierarchy as $node) {
            $onHand = $this->capacity->onHand($itemVariantId, $node['type'], (int) $node['id']);

            if ($onHand >= $quantity && $quantity > 0) {
                return ['node' => $node, 'available' => $onHand];
            }

            if ($partial === null && $onHand > 0) {
                $partial = ['node' => $node, 'available' => $onHand];
            }
        }

        if ($partial !== null) {
            return $partial;
        }

        $fallback = end($hierarchy);

        return [
            'node' => $fallback !== false
                ? $fallback
                : $this->domain->describe(Store::class, 0),
            'available' => 0,
        ];
    }

    /**
     * The nearest hub — the store's Remote Hub, then the main hubs — that can
     * still promise this many units, for a line the store itself cannot cover.
     */
    public function hubCovering(Store $store, int $itemVariantId, int $quantity): ?\App\Models\Inventory\StockLocation
    {
        foreach ($this->domain->hierarchyFor($store) as $node) {
            if (! $this->domain->isStructural($node['kind'])) {
                continue;
            }

            $leaf = $this->scope->leafFor($node['type'], (int) $node['id']);

            if ($leaf !== null && $this->stock->availableAt($itemVariantId, $leaf) >= $quantity) {
                return $leaf;
            }
        }

        return null;
    }

    /**
     * Book the line out of the leaf the picker confirmed.
     *
     * Through the ledger gateway: locked, refused rather than clamped when the
     * leaf is short, and journalled. A line reserved at checkout consumes its
     * reservation; an older order placed before reservations existed is
     * debited directly.
     */
    private function bookOut(SaleItem $item, int $itemVariantId, string $locationType, int $locationId, int $quantity, ?User $staff): void
    {
        $leaf = $this->scope->leafFor($locationType, $locationId);

        if ($leaf === null) {
            throw new RuntimeException("Line #{$item->id}: the chosen location holds no stock of its own.");
        }

        // A customer order leaves from a Store Shelf, a store floor or a
        // Remote Hub. Main Hubs A and B ship to stores; they do not serve
        // customers directly.
        if (! in_array($leaf->kind, self::CUSTOMER_SOURCES, true)) {
            throw new MovementDomainException(
                "{$leaf->name} does not serve customers. Pick from the store's shelf, its floor or its Remote Hub.",
                MovementDomainService::DOMAIN_DELIVERY,
            );
        }

        $context = ['user_id' => $staff?->id, 'reason' => 'Pick & Pack', 'reference' => $item];

        $reservation = StockReservation::query()
            ->open()
            ->where('sale_item_id', $item->id)
            ->first();

        if ($reservation !== null) {
            $this->stock->pick($reservation, $leaf, $quantity, $context);

            return;
        }

        $this->stock->pickWithoutReservation($itemVariantId, $leaf, $quantity, $context);
    }

    private function storeIdFor(string $locationType, int $locationId): int
    {
        return (int) ($this->domain->describe($locationType, $locationId)['store_id'] ?? 0);
    }

    /**
     * Give the order its Delivery, originating from the location Pick & Pack
     * confirmed.
     *
     * Where lines came off different places the delivery records the one the
     * load was consolidated at — the nearest confirmed source — while each
     * line keeps its own on sale_items.
     */
    private function attachDelivery(Sale $sale): void
    {
        $sale->loadMissing(['items', 'delivery', 'customer']);

        $sources = $sale->items
            ->filter(fn (SaleItem $item): bool => $item->source_location_type !== null)
            ->map(fn (SaleItem $item): array => $this->domain->describe(
                (string) $item->source_location_type,
                (int) $item->source_location_id,
            ))
            ->sortBy('proximity')
            ->values();

        $primary = $sources->first();

        $this->domain->assertDeliveryOrigin($primary['type'] ?? null, $primary['id'] ?? null);

        $attributes = [
            'source_location_type' => $primary['type'],
            'source_location_id' => $primary['id'],
            'source_store_id' => $primary['store_id'] ?? $sale->store_id,
        ];

        if ($sale->delivery !== null) {
            $sale->delivery->update($attributes);

            return;
        }

        Delivery::create($attributes + [
            'sale_id' => $sale->id,
            'tracking_number' => 'DEL-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -5)),
            'status' => 'pending',
            'recipient_name' => $sale->customer?->name,
            'recipient_phone' => $sale->customer?->phone,
            'notes' => 'Sourced in Pick & Pack from ' . ($primary['label'] ?? 'the store') . '.',
        ]);
    }

    /** Variants in a cart, for callers that only hold ids. */
    public function variantIdsFor(Cart $cart): array
    {
        return $cart->variants->map(fn (ItemVariant $variant): int => (int) $variant->id)->all();
    }
}
