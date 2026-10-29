<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Fulfillment\Delivery;
use App\Services\Finance\PaymentBoard;
use App\Services\Workforce\DayBook;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\TimeFilter;
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
 *
 * Paid and packing together are the Pick & Pack work list; there is no
 * separate queue screen (/orders/pick-pack redirects to the Paid tab).
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

    /** Orders past this are finished; everything before is still on its way. */
    private const FINISHED = [Sale::STAGE_DELIVERED, Sale::STAGE_CANCELLED];

    /** A safety cap on orders still on their way (a board that big is a problem to see, not hide). */
    private const OPEN_LIMIT = 300;

    private ?DayBook $dayBook = null;

    /**
     * The orders, shaped as the seller order cards expect: every order still
     * on its way (whatever its day), plus the newest finished ones inside the
     * period. A busy week of delivered orders can no longer push an unpaid
     * order off the board.
     *
     * @param  array{when: string, date: string|null}  $period
     * @return array<int, array<string, mixed>>
     */
    public function orders(?int $storeId, array $period = ['when' => 'all', 'date' => null]): array
    {
        $time = app(TimeFilter::class);
        $storeIds = $storeId !== null ? [$storeId] : null;
        $narrow = fn (Builder $query): Builder => $time->apply($query, 'sales.created_at', 'sales.store_id', $storeIds, $period);

        $open = $this->withCardRelations($this->scoped($storeId))->whereNotIn('sales.fulfillment_stage', self::FINISHED);
        $finished = $this->withCardRelations($this->scoped($storeId))->whereIn('sales.fulfillment_stage', self::FINISHED);

        // "Outside open hours" is a review of those orders alone; any other period narrows only the finished ones.
        // The archive holds finished orders only: open ones are never archived.
        $finished = $narrow($finished);
        if ($period['when'] === 'outside') {
            $open = $narrow($open);
        }
        if ($period['when'] === 'archive') {
            $open = $open->whereRaw('1 = 0');
        }

        return $open->latest('id')->limit(self::OPEN_LIMIT)->get()
            ->concat($finished->latest('id')->limit(self::LIST_LIMIT)->get())
            ->sortByDesc('id')
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
        // null = every store; 0 (a seller with no store) matches nothing.
        return Sale::query()->when($storeId !== null, fn (Builder $query) => $query->forStore((int) $storeId));
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
            'delivery.vehicle',
            'payments.account.owner',
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
                // Ticked in Pick & pack: the picker has it in hand.
                'ticked' => $line->ticked_at !== null,
            ];
        })->values()->all();

        $linesTotal = array_sum(array_map(fn (array $line): float => $line['unitPrice'] * $line['quantity'], $lines));
        $fee = round((float) ($sale->delivery_fee ?? 0), 2);

        return [
            'id' => $sale->id,
            'reference' => (string) $sale->reference_number,
            'customer' => $this->customerName($sale),
            'stage' => $this->stageFor($sale->fulfillment_stage, $sale->payment_status, $anyPicked || $sale->picking_started_at !== null),
            // The payment split; voided parts of a cancelled order are left out.
            'payments' => $sale->payments
                ->where('status', '!=', Payment::STATUS_VOID)
                ->sortBy('id')
                ->map(fn (Payment $payment): array => app(PaymentBoard::class)->part($payment))
                ->values()
                ->all(),
            // Pick & Pack progress: lines with their pick location confirmed.
            'sourced' => [
                'done' => $sale->items->filter(fn (SaleItem $line): bool => $line->isSourced())->count(),
                'total' => $sale->items->count(),
            ],
            'delayAgreed' => $sale->delayAgreed(),
            // Every part confirmed: the gate before it may go to delivery.
            'paid' => $sale->isFullyPaid(),
            // Someone started picking it, and how many lines are in hand.
            'picking' => [
                'startedAt' => $sale->picking_started_at?->toIso8601String(),
                'ticked' => $sale->items->filter(fn (SaleItem $line): bool => $line->ticked_at !== null)->count(),
                'packed' => $sale->packed_at !== null,
            ],
            // How long an unpaid order's stock stays held.
            'expiresInMinutes' => $sale->fulfillment_stage === Sale::STAGE_AWAITING_PAYMENT
                ? app(SellerOrderService::class)->minutesLeft($sale)
                : null,
            // With the day of the week: "Monday, Oct 12 · 09:14".
            'placedAt' => $sale->created_at?->toIso8601String(),
            'open' => ! in_array($sale->fulfillment_stage, self::FINISHED, true),
            'day' => ($this->dayBook ??= app(DayBook::class))->tag($sale->store_id !== null ? (int) $sale->store_id : null, $sale->created_at),
            'placed' => LocalTime::wall($sale->created_at, LocalTime::wall($sale->created_at, 'Y') === LocalTime::now()->format('Y') ? 'l, M j · H:i' : 'l, M j Y · H:i') ?? '',
            'lines' => $lines,
            'destination' => [
                'name' => $sale->delivery?->recipient_name ?? $storeName,
                'kind' => $sale->delivery && $sale->delivery->method !== Delivery::METHOD_STORE ? 'Delivery' : 'Store pickup',
                // These were crossed: "vehicle" showed the courier and
                // "driver" the recipient's phone.
                'vehicle' => collect([$sale->delivery?->vehicle?->name, $sale->delivery?->vehicle_plate ?? $sale->delivery?->vehicle?->plate])
                    ->filter()->join(' · ') ?: 'Not assigned',
                'driver' => $sale->delivery?->courier_name ?? 'Not assigned',
                'phone' => $sale->delivery?->recipient_phone,
                'address' => $sale->delivery?->delivery_address ?? $storeName,
                'courierId' => $sale->delivery?->courier_id !== null ? (int) $sale->delivery->courier_id : null,
                'vehicleId' => $sale->delivery?->vehicle_id !== null ? (int) $sale->delivery->vehicle_id : null,
                'plate' => $sale->delivery?->vehicle_plate,
                // courier to an address, a vehicle collecting at the store,
                // the customer taking it in the store, or nothing decided yet.
                'method' => match (true) {
                    $sale->delivery === null => 'later',
                    $sale->delivery->method === Delivery::METHOD_STORE => 'store',
                    $sale->delivery->method === Delivery::METHOD_VEHICLE => 'vehicle',
                    default => $sale->delivery->delivery_address ? 'courier' : 'later',
                },
                'driverPhone' => $sale->delivery?->driver_phone,
            ],
            'deliveryOption' => $sale->delivery_option,
            // Tax and discounts, so the card total equals the sale total.
            'additionalCharges' => round((float) $sale->total_amount - $linesTotal - $fee, 2),
            // A custom delivery fee typed at checkout, part of the total.
            'shippingFee' => $fee,
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
