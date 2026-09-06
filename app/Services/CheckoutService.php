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
use Illuminate\Support\Facades\DB;

class CheckoutService
{
    protected StockService $stockService;

    public function __construct(StockService $stockService)
    {
        $this->stockService = $stockService;
    }

    /**
     * Complete cart-to-sale fulfillment transaction:
     * 1. Validates cart state.
     * 2. Checks real-time stock via StockService (SSOT movements ledger).
     * 3. Applies customer pricing and tax rules via PriceProvider.
     * 4. Persists Sale and SaleItems snapshots.
     * 5. Appends negative sale movements to inventory_movements.
     * 6. Records payment and delivery details.
     * 7. Transitions cart to completed.
     *
     * @throws CartCheckoutException
     * @throws InsufficientStockException
     */
    public function checkout(
        Cart $cart,
        array $paymentData = [],
        ?int $userId = null,
        array $deliveryData = []
    ): Sale {
        return DB::transaction(function () use ($cart, $paymentData, $userId, $deliveryData) {
            // 1. Validation
            $cart->loadMissing(['customer', 'store', 'seller', 'variants.item']);

            if ($cart->status === 'completed') {
                throw new CartCheckoutException("Cart #{$cart->id} has already been completed.", $cart->id);
            }

            if ($cart->variants->isEmpty()) {
                throw new CartCheckoutException("Cannot checkout an empty cart.", $cart->id);
            }

            $customer = $cart->customer;
            // Customer with TIN = individual; without TIN = business; no customer = retail individual
            $customerType = ($customer && !empty($customer->tin_number))
                ? 'individual'
                : ($customer ? 'business' : 'individual');

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

                // Verify stock balance against ledger
                $availableStock = $this->stockService->getCurrentStock($storeVariant);
                if ($availableStock < $requestedQuantity) {
                    throw new InsufficientStockException(
                        message: "Insufficient stock for '{$variant->sku}': requested {$requestedQuantity}, available {$availableStock}.",
                        storeVariantId: $storeVariant->id,
                        requestedQuantity: $requestedQuantity,
                        availableStock: $availableStock
                    );
                }

                // Calculate price using PriceProvider
                $priceLadder = PriceProvider::getPriceLadder(
                    storeVariantId: $storeVariant->id,
                    storeId: $cart->store_id,
                    sellerId: $cart->seller_id,
                    customerId: $cart->customer_id
                );

                $calculatedPrice = PriceProvider::getFinalPriceWithTax($priceLadder, $customerType);

                // Fallback to pivot price if calculation engine yields 0 and pivot is set
                $unitPrice = ($calculatedPrice > 0) ? $calculatedPrice : (float) ($variant->pivot->price ?? 0);
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
                    'quantity' => $requestedQuantity,
                    'unit_price' => $unitPrice,
                    'subtotal' => $lineSubtotal,
                    'tax_amount' => $lineTax,
                    'total_price' => $lineTotal,
                ];
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
                'notes' => "Fulfilled from Cart #{$cart->id}",
            ]);

            // 4. Create SaleItems & Append audit movements to SSOT ledger
            foreach ($itemsData as $item) {
                SaleItem::create([
                    'sale_id' => $sale->id,
                    'store_variant_id' => $item['store_variant']->id,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'subtotal' => $item['subtotal'],
                    'tax_amount' => $item['tax_amount'],
                    'discount_amount' => 0.00,
                    'total_price' => $item['total_price'],
                ]);

                // Append negative stock movement to inventory_movements
                $this->stockService->recordSale(
                    storeVariant: $item['store_variant'],
                    quantity: $item['quantity'],
                    reference: $sale->reference_number,
                    userId: $userId ?? auth()->id(),
                    customerId: $cart->customer_id
                );
            }

            // 5. Record Payment if provided
            if (!empty($paymentData)) {
                Payment::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $paymentData['payment_method'] ?? 'cash',
                    'amount' => $paymentData['amount'] ?? $sale->total_amount,
                    'currency' => $paymentData['currency'] ?? 'ETB',
                    'transaction_reference' => $paymentData['transaction_reference'] ?? null,
                    'status' => $paymentData['status'] ?? 'completed',
                    'user_id' => $userId ?? auth()->id(),
                    'paid_at' => now(),
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
}
