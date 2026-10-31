<?php

declare(strict_types=1);

namespace App\Services\Storefront;

use App\Exceptions\CartCheckoutException;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Services\CartService;
use App\Services\Finance\PaymentService;
use App\Services\Fulfillment\SellerOrderBoard;
use App\Services\Fulfillment\SellerOrderService;
use App\Services\Shared\SharedCartPresenter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The online shop's checkout: a signed-in shopper's cart becomes an order the
 * store works exactly like one a seller placed.
 *
 *   checkout  one order per store in the basket (all or none). The shopper
 *             picks one of the store's collection accounts to pay into; the
 *             order is the account owner's, as if that seller had placed it
 *             (SellerOrderService::place: the same sale, stock holds,
 *             delivery and payment part). The cart is checked out with no
 *             customer and no seller on it, so it keeps the shop's retail
 *             prices the shopper saw.
 *   claim     "I've sent it" with the bank reference; the account owner (or a
 *             manager) confirms it in the payment inbox, as for any transfer.
 *   cancel    while nothing is paid or claimed: the stock goes back.
 *
 * The shopper is kept on sales.shopper_id: that is what makes an order
 * "online" and what My orders lists.
 */
class OnlineOrderService
{
    /** My orders shows this many, newest first. */
    public const LIST_LIMIT = 50;

    public function __construct(
        private readonly CartService $carts,
        private readonly SellerOrderService $orders,
        private readonly PaymentService $payments,
        private readonly SharedCartPresenter $presenter,
    ) {
    }

    /**
     * The shopper's carts that can be checked out: one per open store with
     * something in it (the newest, as the shop uses), or just $only's.
     *
     * @return Collection<int, Cart>
     */
    public function openCarts(User $shopper, ?Store $only = null): Collection
    {
        return Cart::query()
            ->where('user_id', $shopper->id)
            ->where('status', (string) config('storefront.cart_status', 'pending'))
            ->when($only !== null, fn ($q) => $q->where('store_id', $only->id))
            ->whereHas('variants')
            ->whereHas('store', fn ($q) => $q->where('status', 'active'))
            ->with('store')
            ->orderBy('id')
            ->get()
            ->groupBy('store_id')
            ->map(fn (Collection $group) => $group->last())
            ->values();
    }

    /**
     * The checkout page: each store's lines, total and accounts to pay into.
     *
     * @return array<string, mixed>
     */
    public function presentCheckout(User $shopper, ?Store $only = null): array
    {
        $stores = $this->openCarts($shopper, $only)->map(function (Cart $cart): array {
            $presented = $this->carts->presentBuyerCart($cart, $cart->store);
            $accounts = PaymentAccount::query()->collectingFor((int) $cart->store_id)->with('owner:id,first_name,last_name')->orderBy('provider')->get();

            return [
                'store' => ['id' => (int) $cart->store->id, 'name' => (string) $cart->store->name, 'slug' => $cart->store->slug],
                'lines' => collect($presented['lines'])->map(fn (array $line) => [
                    'variant_id' => $line['variant_id'],
                    'title' => $line['title'],
                    'detail' => $line['variant_label'] ?? null,
                    'image_url' => $line['image_url'] ?? null,
                    'quantity' => $line['quantity'],
                    'extra_pieces' => $line['extra_pieces'],
                    'line_total' => $line['line_total'],
                ])->values()->all(),
                'total' => (float) $presented['subtotal'],
                'requires_delay_agreement' => (bool) $presented['requires_delay_agreement'],
                'delayed_line_count' => (int) $presented['delayed_line_count'],
                'accounts' => $accounts->map(fn (PaymentAccount $a) => [
                    'id' => (int) $a->id,
                    'provider' => $a->providerName(),
                    'type' => (string) $a->type,
                    'account_name' => (string) $a->account_name,
                    'account_number' => (string) $a->account_number,
                    'owner' => $a->owner ? trim($a->owner->first_name.' '.$a->owner->last_name) : null,
                ])->values()->all(),
            ];
        })->all();

        $last = Sale::query()->forShopper($shopper->id)->whereHas('delivery', fn ($q) => $q->whereNotNull('delivery_address'))
            ->with('delivery')->latest('id')->first()?->delivery;

        return [
            'stores' => $stores,
            'only' => $only?->slug,
            'recipient' => [
                'name' => trim($shopper->first_name.' '.$shopper->last_name),
                'phone' => (string) ($shopper->phone_number ?? ''),
                // Where the last online order went, to fill the form in again.
                'address' => $last?->delivery_address,
            ],
            'hold_minutes' => (int) config('inventory.unpaid_reservation_minutes'),
        ];
    }

    /**
     * Place one order per store, all or none.
     *
     * @param  array{stores: list<array{store_id: int, payment_account_id: int}>, delivery_method: string, delivery_address?: string|null, recipient_name: string, recipient_phone: string, delay_agreed?: bool, notes?: string|null}  $input
     * @return list<Sale>
     *
     * @throws CartCheckoutException when a cart or account is not the shopper's to use
     * @throws \App\Exceptions\InsufficientStockException
     * @throws \App\Exceptions\PaymentException
     */
    public function checkout(User $shopper, array $input): array
    {
        $carts = $this->openCarts($shopper)->keyBy('store_id');

        return DB::transaction(function () use ($shopper, $input, $carts): array {
            $sales = [];

            foreach ($input['stores'] as $choice) {
                $cart = $carts->get((int) $choice['store_id'])
                    ?? throw new CartCheckoutException('One of the stores in your checkout has nothing in your cart any more. Go back to the shop and check out again.');

                $sales[] = $this->placeOne($shopper, $cart, (int) $choice['payment_account_id'], $input);
            }

            if ($sales === []) {
                throw new CartCheckoutException('Your cart is empty.');
            }

            return $sales;
        });
    }

    /** @param  array<string, mixed>  $input */
    private function placeOne(User $shopper, Cart $cart, int $accountId, array $input): Sale
    {
        $account = PaymentAccount::query()->collectingFor((int) $cart->store_id)->with('owner')->find($accountId)
            ?? throw new CartCheckoutException(sprintf('Choose one of %s\'s accounts to pay into.', $cart->store?->name ?? 'the store'), (int) $cart->id);
        $seller = $account->owner
            ?? throw new CartCheckoutException('That account cannot take payments right now. Choose another one.', (int) $cart->id);

        $method = $input['delivery_method'] === Delivery::METHOD_STORE ? Delivery::METHOD_STORE : Delivery::METHOD_COURIER;

        $sale = $this->orders->place($cart, $seller, [
            'delivery_method' => $method,
            'delivery_address' => $method === Delivery::METHOD_COURIER ? trim((string) ($input['delivery_address'] ?? '')) : null,
            'recipient_name' => trim((string) $input['recipient_name']),
            'recipient_phone' => trim((string) $input['recipient_phone']),
            'delay_agreed' => (bool) ($input['delay_agreed'] ?? false),
            // Courier fees are quoted by the store at dispatch, as for a seller's order.
            'delivery_option' => null,
            'parts' => [],
        ]);

        $who = trim($shopper->first_name.' '.$shopper->last_name);
        $notes = array_filter([
            $sale->notes,
            sprintf('Online order · %s · %s', $who !== '' ? $who : $shopper->email, trim((string) $input['recipient_phone'])),
            ! empty($input['notes']) ? 'Customer: '.trim((string) $input['notes']) : null,
        ]);

        // The order is the account owner's from here, as if they had placed it.
        $sale->update(['seller_id' => $seller->id, 'shopper_id' => $shopper->id, 'notes' => implode("\n", $notes)]);
        $cart->update(['seller_id' => $seller->id]);

        return $this->payments->setParts($sale->refresh(), [[
            'payment_account_id' => $account->id,
            'amount' => (float) $sale->total_amount,
            'transaction_reference' => null,
        ]], $seller);
    }

    /**
     * My orders, newest first.
     *
     * @return list<array<string, mixed>>
     */
    public function list(User $shopper): array
    {
        $board = app(SellerOrderBoard::class);

        return Sale::query()->forShopper($shopper->id)
            ->with(['store:id,name', 'payments', 'items'])
            ->latest('id')
            ->limit(self::LIST_LIMIT)
            ->get()
            ->map(fn (Sale $sale) => [
                'reference' => (string) $sale->reference_number,
                'store' => $sale->store?->name,
                'total' => (float) $sale->total_amount,
                'stage' => $board->stageOf($sale),
                'placed_at' => $sale->created_at?->toIso8601String(),
                'item_count' => (int) $sale->items->sum('quantity'),
                'to_pay' => $sale->payments->where('status', Payment::STATUS_PENDING)->whereNotNull('payment_account_id')->count() > 0,
            ])->values()->all();
    }

    /**
     * One order, as the shopper follows it: the same view a shared-cart link shows.
     *
     * @return array<string, mixed>
     */
    public function present(Sale $sale): array
    {
        return $this->presenter->orderOf($sale) + [
            'can_cancel' => $this->cancellable($sale),
            'hold_minutes_left' => $sale->fulfillment_stage === Sale::STAGE_AWAITING_PAYMENT ? $this->orders->minutesLeft($sale->loadMissing('items')) : null,
        ];
    }

    /** "I've sent it" on one of the order's transfer parts. */
    public function claim(Sale $sale, int $paymentId, ?string $reference): Payment
    {
        $payment = $sale->payments()->findOrFail($paymentId);
        $seller = $sale->seller ?? $payment->account?->owner
            ?? throw new CartCheckoutException('This order has no seller any more. Contact the store.');

        return $this->payments->claimByCustomer($payment, $seller, $reference);
    }

    /** @throws CartCheckoutException when money is already on its way */
    public function cancel(Sale $sale, User $shopper): Sale
    {
        if (! $this->cancellable($sale)) {
            throw new CartCheckoutException('This order can no longer be cancelled here: you have sent money or the store has started on it. Contact the store.', (int) $sale->cart_id);
        }

        return $this->orders->cancel($sale, $shopper);
    }

    /** Waiting for money, and none of it has been sent or confirmed. */
    public function cancellable(Sale $sale): bool
    {
        return $sale->fulfillment_stage === Sale::STAGE_AWAITING_PAYMENT
            && ! $sale->payments()->whereIn('status', [Payment::STATUS_CLAIMED, Payment::STATUS_CONFIRMED])->exists();
    }
}
