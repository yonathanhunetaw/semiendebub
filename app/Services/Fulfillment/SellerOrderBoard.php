<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use Illuminate\Database\Eloquent\Builder;

/**
 * The seller's "My Orders" board, read from real sales.
 *
 * The seller UI speaks six stages; a Sale carries five fulfillment stages plus
 * per-line pick progress. The mapping lives here, once, so the More hub's tile
 * badges and the order list's tabs cannot disagree:
 *
 *   to_pay      fulfillment_stage = awaiting_payment
 *   paid        pick_pack, and no line has been picked yet
 *   packing     pick_pack, and at least one line has been picked
 *   to_deliver  to_deliver
 *   delivered   delivered
 *   canceled    cancelled
 *
 * `fulfillment_stage` is NOT NULL (default awaiting_payment); an unknown value
 * is placed by payment status: paid reads as "paid", anything else "to pay".
 */
class SellerOrderBoard
{
    public const STAGES = ['to_pay', 'paid', 'packing', 'to_deliver', 'delivered', 'canceled'];

    /** How many orders the list loads; newest first. */
    public const LIST_LIMIT = 100;

    /**
     * Orders per seller stage.
     *
     * @return array<string, int>
     */
    public function counts(?int $storeId): array
    {
        $counts = array_fill_keys(self::STAGES, 0);

        $rows = $this->scoped($storeId)
            ->selectRaw('fulfillment_stage, payment_status')
            ->selectRaw('EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id AND si.picked_quantity > 0) as picked')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('fulfillment_stage', 'payment_status', 'picked')
            ->toBase()
            ->get();

        foreach ($rows as $row) {
            $stage = $this->stageFor($row->fulfillment_stage, $row->payment_status, (bool) $row->picked);
            $counts[$stage] += (int) $row->total;
        }

        return $counts;
    }

    /**
     * The newest orders, shaped as the seller order cards expect.
     *
     * @return array<int, array<string, mixed>>
     */
    public function orders(?int $storeId): array
    {
        return $this->withCardRelations($this->scoped($storeId))
            ->latest('id')
            ->limit(self::LIST_LIMIT)
            ->get()
            ->map(fn (Sale $sale): array => $this->present($sale))
            ->values()
            ->all();
    }

    /** One order by reference, or null when it is not on this seller's board. */
    public function find(string $reference, ?int $storeId): ?array
    {
        $sale = $this->withCardRelations($this->scoped($storeId))
            ->where('reference_number', $reference)
            ->first();

        return $sale ? $this->present($sale) : null;
    }

    public function stageFor(?string $fulfillmentStage, ?string $paymentStatus, bool $anyPicked): string
    {
        return match ($fulfillmentStage) {
            Sale::STAGE_AWAITING_PAYMENT => 'to_pay',
            Sale::STAGE_PICK_PACK => $anyPicked ? 'packing' : 'paid',
            Sale::STAGE_TO_DELIVER => 'to_deliver',
            Sale::STAGE_DELIVERED => 'delivered',
            Sale::STAGE_CANCELLED => 'canceled',
            default => $paymentStatus === 'paid' ? 'paid' : 'to_pay',
        };
    }

    /** @return Builder<Sale> */
    private function scoped(?int $storeId): Builder
    {
        return Sale::query()->when($storeId, fn (Builder $query) => $query->forStore((int) $storeId));
    }

    /**
     * @param  Builder<Sale>  $query
     * @return Builder<Sale>
     */
    private function withCardRelations(Builder $query): Builder
    {
        return $query->with([
            'customer',
            'store',
            'delivery',
            'items.storeVariant.item',
            'items.storeVariant.itemVariant.item',
            'items.storeVariant.itemVariant.itemColor',
            'items.storeVariant.itemVariant.itemSize',
            'items.storeVariant.itemVariant.itemPackagingType',
        ]);
    }

    /** @return array<string, mixed> */
    private function present(Sale $sale): array
    {
        $anyPicked = $sale->items->contains(fn (SaleItem $line): bool => (int) $line->picked_quantity > 0);
        $storeName = $sale->store?->name ?? 'Store';

        $lines = $sale->items->map(function (SaleItem $line) use ($storeName): array {
            $variant = $line->storeVariant?->itemVariant;
            $label = collect([
                $variant?->itemColor?->name,
                $variant?->itemSize?->name,
                $variant?->itemPackagingType?->name,
            ])->filter()->join(' · ');

            return [
                'id' => $line->id,
                // The variant's own item is authoritative; store_variants.item_id
                // is a denormalised copy.
                'name' => (string) ($variant?->item?->product_name
                    ?? $line->storeVariant?->item?->product_name
                    ?? 'Unnamed product'),
                'variant' => $label !== '' ? $label : 'Standard',
                'unitPrice' => (float) $line->unit_price,
                'quantity' => (int) $line->quantity,
                // Lines sourced from a main hub are consolidated there; anything
                // else is the store's own shelf, back room or remote hub.
                'fulfillment' => $line->source_location_type !== null
                    && app(MovementDomainService::class)->nodeKindFor((string) $line->source_location_type, (int) $line->source_location_id) === MovementDomainService::NODE_MAIN_WAREHOUSE
                        ? 'hub'
                        : 'local',
                'supplier' => $storeName,
                'inStore' => true,
            ];
        })->values()->all();

        $linesTotal = array_sum(array_map(fn (array $line): float => $line['unitPrice'] * $line['quantity'], $lines));

        return [
            'id' => $sale->id,
            'reference' => (string) $sale->reference_number,
            'customer' => $this->customerName($sale),
            'stage' => $this->stageFor($sale->fulfillment_stage, $sale->payment_status, $anyPicked),
            // How long an unpaid order's stock stays held.
            'expiresInMinutes' => $sale->fulfillment_stage === Sale::STAGE_AWAITING_PAYMENT
                ? app(SellerOrderService::class)->minutesLeft($sale)
                : null,
            'placed' => $sale->created_at?->format('d M Y, H:i') ?? '',
            'lines' => $lines,
            'destination' => [
                'name' => $sale->delivery?->recipient_name ?? $storeName,
                'kind' => $sale->delivery ? 'Delivery' : 'Store pickup',
                'vehicle' => $sale->delivery?->courier_name ?? 'Not assigned',
                'driver' => $sale->delivery?->recipient_phone ?? '',
                'address' => $sale->delivery?->delivery_address ?? $storeName,
            ],
            // Tax and discounts, so the card total equals the sale total.
            'additionalCharges' => round((float) $sale->total_amount - $linesTotal, 2),
            'shippingFee' => 0,
        ];
    }

    private function customerName(Sale $sale): string
    {
        $customer = $sale->customer;

        if (! $customer) {
            return 'Walk-in customer';
        }

        $full = trim((string) ($customer->first_name . ' ' . $customer->last_name));

        return $full !== '' ? $full : ((string) ($customer->name ?? 'Customer'));
    }
}
