<?php

namespace App\Services;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Fulfillment\Delivery;
use App\Models\Seller\Cart;
use App\Models\Store\StoreVariant;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Support\Facades\DB;

class CheckoutService
{
    protected StockService $stockService;

    protected OrderSourcingService $sourcing;

    /**
     * $sourcing is optional so the existing `new CheckoutService($stock)`
     * callers (and the test suite) keep working; it is resolved from the
     * container when it is not supplied.
     */
    public function __construct(StockService $stockService, ?OrderSourcingService $sourcing = null)
    {
        $this->stockService = $stockService;
        $this->sourcing = $sourcing ?? app(OrderSourcingService::class);
    }

    /**
     * Complete cart-to-sale fulfillment transaction:
     * 1. Validates cart state.
     * 2. Checks what the store can still sell: shelf + floor, less open
     *    reservations (StockService::availableAtStore).
     * 3. Applies customer pricing and tax rules via PriceProvider.
     * 4. Persists Sale and SaleItems snapshots.
     * 5. Reserves every line at the store. Nothing leaves a shelf here; Pick &
     *    Pack books it out of the leaf it is actually taken from. The
     *    reservation is what stops two checkouts selling the last unit.
     * 6. Records payment and delivery details.
     * 7. Transitions cart to completed.
     *
     * Sourcing is deliberately *not* decided here. A paid order lands in
     * Pick & Pack and staff name the exact shelf, back room or warehouse each
     * line comes off; see OrderSourcingService::confirmSourcing(). What this
     * method does enforce is the buyer's side of that: if any line can only be
     * served from a main warehouse, the order arrives later, and $delayAgreed
     * must say the buyer accepted that before the money is taken.
     *
     * @param  bool  $delayAgreed  the buyer has accepted the wait on any line
     *                             sourced from a main warehouse
     *
     * @throws CartCheckoutException
     * @throws InsufficientStockException
     */
    public function checkout(
        Cart $cart,
        array $paymentData = [],
        ?int $userId = null,
        array $deliveryData = [],
        bool $delayAgreed = false
    ): Sale {
        return DB::transaction(function () use ($cart, $paymentData, $userId, $deliveryData, $delayAgreed) {
            // 1. Validation
            $cart->loadMissing(['customer', 'store', 'seller', 'variants.item']);

            if ($cart->status === 'completed') {
                throw new CartCheckoutException("Cart #{$cart->id} has already been completed.", $cart->id);
            }

            if ($cart->variants->isEmpty()) {
                throw new CartCheckoutException("Cannot checkout an empty cart.", $cart->id);
            }

            /*
             * The delayed-delivery agreement.
             *
             * Grouping the cart by closest available location tells us whether
             * anything has to come from a hub. If it does, the buyer's
             * agreement is a condition of the sale — refusing here rather than
             * warning means an order cannot be paid for on terms the buyer
             * never saw.
             */
            $requiresAgreement = $cart->store !== null
                && $this->sourcing->requiresDelayAgreement($cart, $cart->store);

            if ($requiresAgreement && ! $delayAgreed) {
                throw new CartCheckoutException(
                    'Part of this order can only be sent from a main warehouse and will arrive later. The buyer must agree to the delay before payment.',
                    $cart->id
                );
            }

            $customer = $cart->customer;
            $customerType = $this->customerType($cart);

            $itemsData = [];
            $subtotal = 0.00;
            $taxAmount = 0.00;
            $totalAmount = 0.00;

            // 2. Pre-verify stock & compute pricing for all line items
            foreach ($cart->variants as $variant) {
                $requestedQuantity = (int) ($variant->pivot->quantity ?? 1);

                // Locate the StoreVariant in the cart's store
                $storeVariant = StoreVariant::where('store_id', $cart->store_id)
                    ->where('item_variant_id', $variant->id)
                    ->first();

                if (!$storeVariant) {
                    throw new CartCheckoutException(
                        "Product '{$variant->sku}' is not available at Store #{$cart->store_id}.",
                        $cart->id
                    );
                }

                // Where this line's stock will be held. The store's shelf +
                // floor first; failing that, and only when the buyer agreed to
                // wait, the nearest hub that has it. A friendly early refusal
                // here — the binding check is the reservation below, which
                // repeats it under the variant lock.
                $availableStock = $this->stockService->availableAtStore((int) $variant->id, (int) $cart->store_id);
                $holdAt = null;

                if ($availableStock < $requestedQuantity && $delayAgreed && $cart->store !== null) {
                    $holdAt = $this->sourcing->hubCovering($cart->store, (int) $variant->id, $requestedQuantity);
                }

                if ($availableStock < $requestedQuantity && $holdAt === null) {
                    throw new InsufficientStockException(
                        message: "Insufficient stock for '{$variant->sku}': requested {$requestedQuantity}, available {$availableStock}.",
                        storeVariantId: $storeVariant->id,
                        requestedQuantity: $requestedQuantity,
                        availableStock: $availableStock
                    );
                }

                $unitPrice = $this->unitPrice($cart, $storeVariant, (float) ($variant->pivot->price ?? 0));
                $lineTotal = round($unitPrice * $requestedQuantity, 2);

                // Calculate tax portion (e.g. 15% standard rate included for individual customers)
                $lineTax = ($customerType === 'individual')
                    ? round($lineTotal - ($lineTotal / 1.15), 2)
                    : 0.00;

                $lineSubtotal = round($lineTotal - $lineTax, 2);

                $subtotal += $lineSubtotal;
                $taxAmount += $lineTax;
                $totalAmount += $lineTotal;

                $itemsData[] = [
                    'store_variant' => $storeVariant,
                    'variant' => $variant,
                    'hold_at' => $holdAt,
                    'quantity' => $requestedQuantity,
                    'unit_price' => $unitPrice,
                    'subtotal' => $lineSubtotal,
                    'tax_amount' => $lineTax,
                    'total_price' => $lineTotal,
                ];

                /*
                 * Loose pieces on top of the pack ("2 Cartons + 7 pieces").
                 *
                 * The cart prices them at extra_piece_price, but they are a
                 * different SKU — the item's piece-packaged variant — so they
                 * become their own sale line, charged at that price and held
                 * from that variant's stock. They used to be dropped here:
                 * never charged, never reserved, never picked.
                 */
                $extraPieces = (int) ($variant->pivot->extra_pieces ?? 0);

                if ($extraPieces > 0) {
                    $itemsData[] = $this->extraPiecesLine($cart, $variant, $extraPieces, (float) ($variant->pivot->extra_piece_price ?? 0), $customerType, $delayAgreed);
                    $last = end($itemsData);
                    $subtotal += $last['subtotal'];
                    $taxAmount += $last['tax_amount'];
                    $totalAmount += $last['total_price'];
                }
            }

            // 3. Persist Sale record
            $referenceNumber = 'SALE-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -6));

            $sale = Sale::create([
                'reference_number' => $referenceNumber,
                'cart_id' => $cart->id,
                'store_id' => $cart->store_id,
                'customer_id' => $cart->customer_id,
                'seller_id' => $cart->seller_id,
                'user_id' => $userId ?? auth()->id(),
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => 0.00,
                'total_amount' => $totalAmount,
                'status' => 'completed',
                'payment_status' => !empty($paymentData) ? 'paid' : 'unpaid',
                // Paid orders drop into Pick & Pack; unpaid ones wait for money.
                // Neither is "to deliver" until every line has been sourced.
                'fulfillment_stage' => !empty($paymentData)
                    ? Sale::STAGE_PICK_PACK
                    : Sale::STAGE_AWAITING_PAYMENT,
                'delay_agreed_at' => $requiresAgreement ? now() : null,
                'notes' => "Fulfilled from Cart #{$cart->id}",
            ]);

            // 4. Create SaleItems and hold their stock
            $paid = ! empty($paymentData);
            $holdUntil = $paid
                ? null
                : now()->addMinutes((int) config('inventory.unpaid_reservation_minutes', 120));

            foreach ($itemsData as $item) {
                $saleItem = SaleItem::create([
                    'sale_id' => $sale->id,
                    'store_variant_id' => $item['store_variant']->id,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'subtotal' => $item['subtotal'],
                    'tax_amount' => $item['tax_amount'],
                    'discount_amount' => 0.00,
                    'total_price' => $item['total_price'],
                ]);

                // Paid orders hold until picked; unpaid ones until the hold
                // expires (stock:release-stale-reservations).
                $hold = [
                    'sale_item_id' => $saleItem->id,
                    'expires_at' => $holdUntil,
                    'user_id' => $userId ?? auth()->id(),
                    'reason' => 'Checkout '.$sale->reference_number,
                ];

                if ($item['hold_at'] !== null) {
                    $this->stockService->reserveAt((int) $item['variant']->id, $item['hold_at'], (int) $cart->store_id, (int) $item['quantity'], $hold);
                } else {
                    $this->stockService->reserve((int) $item['variant']->id, (int) $cart->store_id, (int) $item['quantity'], $hold);
                }
            }

            // 5. Record a payment already in hand. The seller app never
            // passes one: its parts go through PaymentService, which waits
            // for each account's owner to confirm the money arrived.
            if (!empty($paymentData)) {
                Payment::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $paymentData['payment_method'] ?? 'cash',
                    'amount' => $paymentData['amount'] ?? $sale->total_amount,
                    'currency' => $paymentData['currency'] ?? 'ETB',
                    'transaction_reference' => $paymentData['transaction_reference'] ?? null,
                    'status' => Payment::STATUS_CONFIRMED,
                    'user_id' => $userId ?? auth()->id(),
                    'paid_at' => now(),
                    'confirmed_at' => now(),
                    'confirmed_by' => $userId ?? auth()->id(),
                    'notes' => $paymentData['notes'] ?? null,
                ]);
            }

            // 6. Record Delivery if provided
            if (!empty($deliveryData)) {
                Delivery::create([
                    'sale_id' => $sale->id,
                    'tracking_number' => $deliveryData['tracking_number'] ?? 'DEL-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5)),
                    'status' => $deliveryData['status'] ?? 'pending',
                    'delivery_address' => $deliveryData['delivery_address'] ?? null,
                    'recipient_name' => $deliveryData['recipient_name'] ?? $customer?->name,
                    'recipient_phone' => $deliveryData['recipient_phone'] ?? $customer?->phone,
                    'courier_name' => $deliveryData['courier_name'] ?? null,
                    'notes' => $deliveryData['notes'] ?? null,
                ]);
            }

            // 7. Transition Cart status to completed
            $cart->update(['status' => 'completed']);

            return $sale->load(['items.storeVariant', 'payments', 'delivery', 'customer', 'store']);
        });
    }

    /**
     * What one unit of a cart line sells for: the customer's price ladder,
     * falling back to the cart's own price when the ladder yields nothing.
     *
     * Public so the order confirmation can show the total the sale will
     * actually carry; payment parts are checked against that total.
     */
    public function unitPrice(Cart $cart, StoreVariant $storeVariant, float $cartPrice): float
    {
        $priceLadder = PriceProvider::getPriceLadder(
            storeVariantId: $storeVariant->id,
            storeId: $cart->store_id,
            sellerId: $cart->seller_id,
            customerId: $cart->customer_id
        );

        $calculatedPrice = PriceProvider::getFinalPriceWithTax($priceLadder, $this->customerType($cart));

        return $calculatedPrice > 0 ? $calculatedPrice : $cartPrice;
    }

    /** Customer with TIN = individual; without TIN = business; no customer = retail individual. */
    private function customerType(Cart $cart): string
    {
        $customer = $cart->customer;

        return ($customer && ! empty($customer->tin_number))
            ? 'individual'
            : ($customer ? 'business' : 'individual');
    }

    /**
     * A sale line for a cart line's extra loose pieces.
     *
     * @return array<string, mixed>
     *
     * @throws CartCheckoutException when the store does not sell the piece variant
     * @throws InsufficientStockException when the pieces are not on hand
     */
    private function extraPiecesLine(Cart $cart, \App\Models\Item\ItemVariant $variant, int $pieces, float $unitPrice, string $customerType, bool $delayAgreed): array
    {
        $pieceVariant = app(CartService::class)->pieceVariantFor($variant);
        $storeVariant = $pieceVariant === null ? null : StoreVariant::query()
            ->where('store_id', $cart->store_id)
            ->where('item_variant_id', $pieceVariant->id)
            ->first();

        if ($pieceVariant === null || $storeVariant === null) {
            throw new CartCheckoutException("'{$variant->sku}' is not sold as loose pieces at this store.", $cart->id);
        }

        $available = $this->stockService->availableAtStore((int) $pieceVariant->id, (int) $cart->store_id);
        $holdAt = null;

        if ($available < $pieces && $delayAgreed && $cart->store !== null) {
            $holdAt = $this->sourcing->hubCovering($cart->store, (int) $pieceVariant->id, $pieces);
        }

        if ($available < $pieces && $holdAt === null) {
            throw new InsufficientStockException(
                message: "Insufficient loose pieces of '{$variant->sku}': requested {$pieces}, available {$available}.",
                storeVariantId: $storeVariant->id,
                requestedQuantity: $pieces,
                availableStock: $available,
            );
        }

        $lineTotal = round($unitPrice * $pieces, 2);
        $lineTax = $customerType === 'individual' ? round($lineTotal - ($lineTotal / 1.15), 2) : 0.00;

        return [
            'store_variant' => $storeVariant,
            'variant' => $pieceVariant,
            'hold_at' => $holdAt,
            'quantity' => $pieces,
            'unit_price' => $unitPrice,
            'subtotal' => round($lineTotal - $lineTax, 2),
            'tax_amount' => $lineTax,
            'total_price' => $lineTotal,
        ];
    }
}
