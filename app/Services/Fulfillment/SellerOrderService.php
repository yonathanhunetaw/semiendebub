<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
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
    ) {
    }

    /**
     * @param  array{parts?: array<int, array{payment_account_id?: int|null, amount: float|string, transaction_reference?: string|null}>, delivery_address?: string|null, recipient_name?: string|null, recipient_phone?: string|null, delay_agreed?: bool}  $input
     *
     * @throws CartCheckoutException
     * @throws InsufficientStockException
     * @throws PaymentException when the parts do not add up to the order total
     */
    public function place(Cart $cart, User $seller, array $input): Sale
    {
        $delivery = array_filter([
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

            $parts = $input['parts'] ?? [];

            return $parts === [] ? $sale : $this->payments->setParts($sale, $parts, $seller);
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
