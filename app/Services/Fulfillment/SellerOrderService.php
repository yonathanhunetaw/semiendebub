<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Inventory\StockReservation;
use App\Models\Seller\Cart;
use App\Services\CheckoutService;
use App\Services\StockService;
use Illuminate\Support\Facades\DB;

/**
 * The seller's side of an order: place it from a cart, take the payment,
 * cancel it.
 *
 *   place    cart → sale. Stock is reserved at the store; an unpaid order's
 *            hold lapses after inventory.unpaid_reservation_minutes.
 *   pay      To pay → Paid (Pick & Pack). The hold stops lapsing; a line
 *            whose hold already lapsed is reserved again, or the payment is
 *            refused because the stock has gone.
 *   cancel   before anything is picked: the holds are released.
 *
 * Pick & Pack (OrderSourcingService) and Delivery (DeliveryService) take it
 * from there.
 */
class SellerOrderService
{
    public function __construct(
        private readonly CheckoutService $checkout,
        private readonly StockService $stock,
    ) {
    }

    /**
     * @param  array{pay_now?: bool, payment_method?: string|null, transaction_reference?: string|null, delivery_address?: string|null, recipient_name?: string|null, recipient_phone?: string|null, delay_agreed?: bool}  $input
     *
     * @throws CartCheckoutException
     * @throws InsufficientStockException
     */
    public function place(Cart $cart, User $seller, array $input): Sale
    {
        $payNow = (bool) ($input['pay_now'] ?? false);

        $payment = $payNow ? array_filter([
            'payment_method' => $input['payment_method'] ?? 'cash',
            'transaction_reference' => $input['transaction_reference'] ?? null,
        ], fn ($value) => $value !== null) : [];

        $delivery = array_filter([
            'delivery_address' => $input['delivery_address'] ?? null,
            'recipient_name' => $input['recipient_name'] ?? null,
            'recipient_phone' => $input['recipient_phone'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        return $this->checkout->checkout(
            $cart,
            $payment,
            $seller->id,
            $delivery,
            (bool) ($input['delay_agreed'] ?? false),
        );
    }

    /**
     * Record the payment and move the order into Pick & Pack.
     *
     * @param  array{payment_method: string, transaction_reference?: string|null, amount?: float|null}  $input
     *
     * @throws CartCheckoutException when the order is not waiting for payment
     * @throws InsufficientStockException when a lapsed hold cannot be renewed
     */
    public function pay(Sale $sale, User $by, array $input): Sale
    {
        return DB::transaction(function () use ($sale, $by, $input): Sale {
            $stage = Sale::query()->whereKey($sale->id)->lockForUpdate()->value('fulfillment_stage');

            if ($stage !== Sale::STAGE_AWAITING_PAYMENT) {
                throw new CartCheckoutException("Order {$sale->reference_number} is not waiting for payment.", (int) $sale->cart_id);
            }

            $sale->load('items.storeVariant');

            foreach ($sale->items as $item) {
                $this->keepHold($sale, $item, $by);
            }

            Payment::create([
                'sale_id' => $sale->id,
                'payment_method' => $input['payment_method'],
                'amount' => $input['amount'] ?? $sale->total_amount,
                'currency' => 'ETB',
                'transaction_reference' => $input['transaction_reference'] ?? null,
                'status' => 'completed',
                'user_id' => $by->id,
                'paid_at' => now(),
            ]);

            $sale->update([
                'payment_status' => 'paid',
                'fulfillment_stage' => Sale::STAGE_PICK_PACK,
            ]);

            return $sale->refresh();
        });
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

    /**
     * A paid line's hold must not lapse. Renew one that already did; refuse
     * the payment if its stock has since been sold to someone else.
     */
    private function keepHold(Sale $sale, SaleItem $item, User $by): void
    {
        $open = StockReservation::query()->open()->where('sale_item_id', $item->id)->get();

        if ($open->isNotEmpty()) {
            StockReservation::query()->whereKey($open->pluck('id'))->update(['expires_at' => null]);

            return;
        }

        $variantId = (int) ($item->storeVariant?->item_variant_id ?? 0);

        $this->stock->reserve($variantId, (int) $sale->store_id, (int) $item->quantity, [
            'sale_item_id' => $item->id,
            'user_id' => $by->id,
            'reason' => 'Renewed on payment '.$sale->reference_number,
        ]);
    }
}
