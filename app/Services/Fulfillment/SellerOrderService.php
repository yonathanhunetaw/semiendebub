<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Models\Auth\CustomerAddress;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockReservation;
use App\Models\Seller\Cart;
use App\Services\CheckoutService;
use App\Services\Finance\PaymentService;
use App\Services\StockService;
use Illuminate\Support\Facades\DB;

/**
 * The seller's side of an order: place it from a cart, cancel it.
 *
 *   place    cart → sale. Stock is reserved at the store; an order nobody has
 *            paid towards releases it after inventory.unpaid_reservation_minutes.
 *            The payment parts chosen at checkout go to PaymentService, which
 *            moves the order to Pick & Pack once every part is confirmed.
 *   cancel   before anything is picked: the holds are released and parts
 *            whose money never arrived are voided.
 *
 * Pick & Pack (OrderSourcingService) and Delivery (DeliveryService) take it
 * from there.
 */
class SellerOrderService
{
    public function __construct(
        private readonly CheckoutService $checkout,
        private readonly StockService $stock,
        private readonly PaymentService $payments,
        private readonly OrderSourcingService $sourcing,
    ) {
    }

    /**
     * @param  array{parts?: array<int, array{payment_account_id?: int|null, amount: float|string, transaction_reference?: string|null}>, delivery_method?: string|null, delivery_address?: string|null, recipient_name?: string|null, recipient_phone?: string|null, delivery_option?: string|null, delivery_fee?: float|string|null, delay_agreed?: bool}  $input
     *
     * @throws CartCheckoutException
     * @throws InsufficientStockException
     * @throws PaymentException when the parts do not add up to the order total
     */
    public function place(Cart $cart, User $seller, array $input): Sale
    {
        // A courier run opens its delivery at checkout; a vehicle collection
        // and an in-store hand-over are opened by arrange(), and "add later"
        // opens none yet.
        $method = (string) ($input['delivery_method'] ?? Delivery::METHOD_COURIER);

        // In store means the customer takes it now, from this store's shelf
        // or floor; a line that has to come from a hub cannot go that way.
        if ($method === Delivery::METHOD_STORE && $cart->store !== null && $this->sourcing->requiresDelayAgreement($cart, $cart->store)) {
            throw new CartCheckoutException('Some lines are not in this store, so the customer cannot take them now. Choose a delivery instead.');
        }

        $delivery = $method !== Delivery::METHOD_COURIER ? [] : array_filter([
            'delivery_address' => $input['delivery_address'] ?? null,
            'recipient_name' => $input['recipient_name'] ?? null,
            'recipient_phone' => $input['recipient_phone'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        return DB::transaction(function () use ($cart, $seller, $input, $delivery): Sale {
            $sale = $this->checkout->checkout(
                $cart,
                [],
                $seller->id,
                $delivery,
                (bool) ($input['delay_agreed'] ?? false),
            );

            $this->chargeDeliveryFee($sale, $input);
            $this->arrange($sale, $input);

            $parts = $input['parts'] ?? [];

            return $parts === [] ? $sale : $this->payments->setParts($sale, $parts, $seller);
        });
    }

    /**
     * The delivery option chosen at checkout. Standard and express are quoted
     * at dispatch and "later" is decided later, so only a custom fee the
     * seller typed is charged now: it joins the order total, which the
     * payment parts must then cover.
     *
     * @param  array<string, mixed>  $input
     */
    private function chargeDeliveryFee(Sale $sale, array $input): void
    {
        $option = $input['delivery_option'] ?? null;
        $fee = $option === 'custom' ? round(max(0.0, (float) ($input['delivery_fee'] ?? 0)), 2) : 0.0;

        $sale->update([
            'delivery_option' => $option,
            'delivery_fee' => $fee,
            'total_amount' => round((float) $sale->total_amount + $fee, 2),
        ]);
    }

    /**
     * Who carries the order and on what, and where it goes: kept on the
     * delivery, and the address saved on the customer for next time. The
     * courier is named now but only sees the run once it is paid and picked
     * (Delivery::scopeVisibleToCourier).
     *
     * @param  array<string, mixed>  $input
     */
    public function arrange(Sale $sale, array $input): void
    {
        $sale->loadMissing(['delivery', 'customer']);
        $method = (string) ($input['delivery_method'] ?? Delivery::METHOD_COURIER);
        // "Add later": nothing about the destination is known yet.
        $later = $method === 'later';
        $vehicleCollects = $method === Delivery::METHOD_VEHICLE;
        // In store: the customer takes it at the counter, so there is no
        // address, courier or vehicle; Pick & pack hands it over.
        $inStore = $method === Delivery::METHOD_STORE;
        $address = $later || $vehicleCollects || $inStore ? '' : trim((string) ($input['delivery_address'] ?? ''));
        $saved = null;

        if (! $later && ! $vehicleCollects && ! $inStore && ! empty($input['customer_address_id']) && $sale->customer_id !== null) {
            $saved = CustomerAddress::query()->where('customer_id', $sale->customer_id)->find((int) $input['customer_address_id']);
            $address = $address !== '' ? $address : (string) ($saved?->address ?? '');
        }

        if ($address !== '' && $sale->customer_id !== null) {
            $saved = CustomerAddress::remember((int) $sale->customer_id, $address, $input['recipient_name'] ?? null, $input['recipient_phone'] ?? null);
        }

        $courier = ! $vehicleCollects && ! $inStore && ! empty($input['courier_id']) ? User::query()->find((int) $input['courier_id']) : null;
        $vehicle = ! $inStore && ! empty($input['vehicle_id']) ? Vehicle::query()->find((int) $input['vehicle_id']) : null;
        $plate = $inStore ? '' : trim((string) ($input['vehicle_plate'] ?? ''));
        $driverPhone = $inStore ? '' : trim((string) ($input['driver_phone'] ?? ''));

        $attributes = array_filter([
            'method' => match (true) {
                $inStore => Delivery::METHOD_STORE,
                $vehicleCollects => Delivery::METHOD_VEHICLE,
                default => null,
            },
            'delivery_address' => $address !== '' ? $address : null,
            'customer_address_id' => $saved?->id,
            'recipient_name' => $input['recipient_name'] ?? $saved?->recipient_name,
            'recipient_phone' => $input['recipient_phone'] ?? $saved?->recipient_phone,
            'courier_id' => $courier?->id,
            'courier_name' => $courier ? trim($courier->first_name.' '.$courier->last_name) : null,
            'vehicle_id' => $vehicle?->id,
            'vehicle_plate' => $plate !== '' ? strtoupper($plate) : $vehicle?->plate,
            'driver_phone' => $driverPhone !== '' ? $driverPhone : null,
        ], fn ($value) => $value !== null && $value !== '');

        // Switching between a courier, a vehicle collection, in store and
        // "add later" must clear what no longer applies.
        if ($sale->delivery !== null) {
            $attributes['method'] = match (true) {
                $inStore => Delivery::METHOD_STORE,
                $vehicleCollects => Delivery::METHOD_VEHICLE,
                default => Delivery::METHOD_COURIER,
            };

            if ($inStore) {
                $attributes += [
                    'delivery_address' => null, 'customer_address_id' => null, 'courier_id' => null, 'courier_name' => null,
                    'vehicle_id' => null, 'vehicle_plate' => null, 'driver_phone' => null,
                ];
            } elseif ($vehicleCollects) {
                $attributes += ['delivery_address' => null, 'customer_address_id' => null, 'courier_id' => null, 'courier_name' => null];
            } else {
                $attributes += ['driver_phone' => null];
            }

            if ($later) {
                $attributes += ['delivery_address' => null, 'customer_address_id' => null];
            }
        }

        if ($attributes === []) {
            return;
        }

        if ($sale->delivery === null) {
            Delivery::create($attributes + [
                'sale_id' => $sale->id,
                'tracking_number' => 'DEL-'.now()->format('Ymd').'-'.strtoupper(substr(uniqid(), -5)),
                'status' => 'pending',
                'recipient_name' => $sale->customer?->name,
                'recipient_phone' => $sale->customer?->phone,
            ]);
        } else {
            $sale->delivery->update($attributes);
        }

        $sale->unsetRelation('delivery');
    }

    /**
     * Cancel an order nothing has been picked for yet, giving its stock back.
     *
     * @throws CartCheckoutException
     */
    public function cancel(Sale $sale, User $by): Sale
    {
        return DB::transaction(function () use ($sale, $by): Sale {
            $stage = Sale::query()->whereKey($sale->id)->lockForUpdate()->value('fulfillment_stage');
            $sale->load('items');

            $picked = $sale->items->contains(fn (SaleItem $item): bool => (int) $item->picked_quantity > 0);

            if (! in_array($stage, [Sale::STAGE_AWAITING_PAYMENT, Sale::STAGE_PICK_PACK], true) || $picked) {
                throw new CartCheckoutException(
                    "Order {$sale->reference_number} has already been picked; it can only be returned through Delivery.",
                    (int) $sale->cart_id,
                );
            }

            StockReservation::query()
                ->open()
                ->whereIn('sale_item_id', $sale->items->pluck('id'))
                ->pluck('id')
                ->each(fn (int $id) => $this->stock->release($id, ['reason' => 'Order cancelled', 'user_id' => $by->id]));

            $this->payments->voidOpen($sale);
            $sale->update(['fulfillment_stage' => Sale::STAGE_CANCELLED, 'status' => 'cancelled']);
            $sale->delivery?->update(['status' => 'failed', 'failure_reason' => 'Order cancelled', 'failed_at' => now()]);

            return $sale->refresh();
        });
    }

    /** Minutes left before an unpaid order's stock is released; null when it does not lapse. */
    public function minutesLeft(Sale $sale): ?int
    {
        $expiry = StockReservation::query()
            ->open()
            ->whereIn('sale_item_id', $sale->items->pluck('id'))
            ->whereNotNull('expires_at')
            ->min('expires_at');

        return $expiry === null ? null : max(0, (int) ceil(now()->diffInSeconds($expiry, false) / 60));
    }
}
