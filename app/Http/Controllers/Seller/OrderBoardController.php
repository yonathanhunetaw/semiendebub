<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Seller\PlaceOrderRequest;
use App\Http\Requests\Seller\SetPaymentPartsRequest;
use App\Http\Requests\Seller\UpdateOrderAddressRequest;
use App\Models\Finance\Sale;
use App\Models\Seller\Cart;
use App\Models\Store\StoreVariant;
use App\Services\CartService;
use App\Services\CheckoutService;
use App\Services\Finance\CustomerCreditService;
use App\Services\Finance\PaymentBoard;
use App\Services\Finance\PaymentService;
use App\Services\Fulfillment\CustodyLog;
use App\Services\Fulfillment\SellerOrderBoard;
use App\Services\Fulfillment\SellerOrderService;
use App\Services\StockService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The seller's "My Orders" list and the to-pay screen, backed by real sales.
 *
 * Pick & Pack stays in OrderController; this is only the read side the More
 * hub's order tiles open into.
 */
class OrderBoardController extends Controller
{
    public function __construct(
        private readonly SellerOrderBoard $board,
        private readonly PaymentBoard $payments,
    ) {
    }

    public function index(Request $request): Response
    {
        $storeId = $this->storeId($request);

        return Inertia::render('Seller/Orders/index', [
            'orders' => $this->board->orders($storeId),
            'limit' => SellerOrderBoard::LIST_LIMIT,
        ]);
    }

    /**
     * Order confirmation for one of the seller's carts: what will be sold, at
     * what price, and whether the store can cover each line today.
     */
    public function confirmation(Request $request): Response
    {
        $cart = $this->ownCart($request, (int) $request->integer('cart'));

        return Inertia::render('Seller/Orders/Confirmation', [
            'cart_id' => $cart?->id,
            'order' => $cart ? $this->preview($cart) : null,
            'accounts' => $this->payments->accountsFor($this->storeId($request)),
            // The customer's credit, when an admin gave them some.
            'credit' => $cart?->customer ? app(CustomerCreditService::class)->summary($cart->customer) : null,
        ]);
    }

    /**
     * Cart → order. Paid in full in cash, it lands in Pick & Pack; otherwise
     * in To pay, where each part waits for its account's owner to confirm it.
     */
    public function store(PlaceOrderRequest $request, SellerOrderService $orders): RedirectResponse
    {
        $cart = $this->ownCart($request, (int) $request->validated('cart_id'));

        abort_if($cart === null, 404);

        try {
            $sale = $orders->place($cart, $request->user(), [...$request->validated(), 'parts' => $request->parts()]);
        } catch (CartCheckoutException|PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return $sale->fulfillment_stage === Sale::STAGE_PICK_PACK
            ? redirect()->route('seller.orders.pickpack', ['reference' => $sale->reference_number])
                ->with('success', "Order {$sale->reference_number} paid. Pick and pack it now.")
            : redirect()->route('seller.orders.pay', ['reference' => $sale->reference_number])
                ->with('success', "Order {$sale->reference_number} placed. Its stock is held while it waits for payment.");
    }

    /** Split, or re-split, an order waiting in To pay. */
    public function parts(SetPaymentPartsRequest $request, string $reference, PaymentService $payments): RedirectResponse
    {
        $sale = $this->ownSale($request, $reference);

        try {
            $sale = $payments->setParts($sale, $request->parts(), $request->user());
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return $sale->fulfillment_stage === Sale::STAGE_PICK_PACK
            ? redirect()->route('seller.orders.pickpack', ['reference' => $reference])
                ->with('success', "Order {$reference} paid. Pick and pack it now.")
            : back()->with('success', "Payment split saved for {$reference}.");
    }

    /**
     * The customer says they paid one part: it goes to the account's owner
     * to check.
     */
    public function claim(Request $request, string $reference, int $payment, PaymentService $payments): RedirectResponse
    {
        $sale = $this->ownSale($request, $reference);
        $part = $sale->payments()->findOrFail($payment);

        try {
            $payments->claim($part, $request->user());
        } catch (PaymentException|InsufficientStockException $e) {
            return back()->with('error', $e->getMessage());
        }

        $owner = $part->account?->owner;
        $who = $owner ? trim($owner->first_name.' '.$owner->last_name) : 'The account owner';

        return back()->with('success', "{$who} will check the account and confirm it.");
    }

    /**
     * Change where an order goes while its run has not left yet.
     */
    public function address(UpdateOrderAddressRequest $request, string $reference): RedirectResponse
    {
        $sale = $this->ownSale($request, $reference);
        $delivery = $sale->delivery;

        if ($delivery !== null && $delivery->status !== 'pending') {
            return back()->with('error', 'The courier already has this order; the address can no longer change.');
        }

        $attributes = array_filter([
            'delivery_address' => $request->validated('delivery_address'),
            'recipient_name' => $request->validated('recipient_name'),
            'recipient_phone' => $request->validated('recipient_phone'),
        ], fn ($value) => $value !== null);

        if ($delivery === null) {
            \App\Models\Fulfillment\Delivery::create($attributes + [
                'sale_id' => $sale->id,
                'tracking_number' => 'DEL-'.now()->format('Ymd').'-'.strtoupper(substr(uniqid(), -5)),
                'status' => 'pending',
            ]);
        } else {
            $delivery->update($attributes);
        }

        return back()->with('success', "Delivery address for {$reference} updated.");
    }

    public function cancel(Request $request, string $reference, SellerOrderService $orders): RedirectResponse
    {
        $sale = $this->ownSale($request, $reference);

        try {
            $orders->cancel($sale, $request->user());
        } catch (CartCheckoutException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->to(route('seller.orders.index').'?tab=canceled')
            ->with('success', "Order {$reference} cancelled and its stock released.");
    }

    public function pay(Request $request, string $reference): Response
    {
        $customer = Sale::query()->where('reference_number', $reference)
            ->when($this->storeId($request), fn ($query, int $storeId) => $query->where('store_id', $storeId))
            ->first()?->customer;

        return Inertia::render('Seller/Orders/ToPay', [
            'reference' => $reference,
            'order' => $this->board->find($reference, $this->storeId($request)),
            'accounts' => $this->payments->accountsFor($this->storeId($request)),
            'credit' => $customer ? app(CustomerCreditService::class)->summary($customer) : null,
        ]);
    }

    /**
     * The order's chain of custody: where each line was picked, who handed it
     * to Delivery, and when it reached the customer.
     */
    public function custody(Request $request, string $reference, CustodyLog $log): Response
    {
        $sale = Sale::query()
            ->where('reference_number', $reference)
            ->when($this->storeId($request), fn ($query, int $storeId) => $query->where('store_id', $storeId))
            ->firstOrFail();

        return Inertia::render('Seller/Orders/Custody', [
            'log' => $log->forSale($sale),
        ]);
    }

    /** A cart this seller raised or owns, at their store. */
    private function ownCart(Request $request, int $cartId): ?Cart
    {
        if ($cartId <= 0) {
            return null;
        }

        $user = $request->user();

        return Cart::query()
            ->whereKey($cartId)
            ->where('status', '!=', 'completed')
            ->where(fn ($q) => $q->where('seller_id', $user?->id)->orWhere('user_id', $user?->id))
            ->with(['variants.item', 'variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType', 'customer', 'store'])
            ->first();
    }

    private function ownSale(Request $request, string $reference): Sale
    {
        return Sale::query()
            ->where('reference_number', $reference)
            ->when($this->storeId($request), fn ($query, int $storeId) => $query->where('store_id', $storeId))
            ->firstOrFail();
    }

    /**
     * The cart shaped as a SellerOrder (resources/js/Data/sellerOrderFlow.ts),
     * so the confirmation screen renders the real thing.
     *
     * @return array<string, mixed>
     */
    private function preview(Cart $cart): array
    {
        $stock = app(StockService::class);
        $checkout = app(CheckoutService::class);
        $pieces = app(CartService::class);
        $storeName = $cart->store?->name ?? 'Store';

        // Priced the way checkout prices them, loose pieces included, so the
        // total here is the one the payment parts are checked against.
        $lines = $cart->variants->flatMap(function ($variant) use ($cart, $stock, $checkout, $pieces, $storeName): array {
            $quantity = (int) ($variant->pivot->quantity ?? 1);
            $available = $cart->store_id ? $stock->availableAtStore((int) $variant->id, (int) $cart->store_id) : 0;
            $label = collect([$variant->itemColor?->name, $variant->itemSize?->name, $variant->itemPackagingType?->name])
                ->filter()->join(' · ');
            $storeVariant = StoreVariant::query()->where('store_id', $cart->store_id)->where('item_variant_id', $variant->id)->first();
            $cartPrice = (float) ($variant->pivot->price ?? 0);
            $name = (string) ($variant->item?->product_name ?? $variant->sku ?? 'Unnamed product');

            $rows = [[
                'id' => (int) $variant->id,
                'name' => $name,
                'variant' => $label !== '' ? $label : 'Standard',
                'unitPrice' => $storeVariant ? $checkout->unitPrice($cart, $storeVariant, $cartPrice) : $cartPrice,
                'quantity' => $quantity,
                // The store can sell it today, or it has to come from a hub.
                'fulfillment' => $available >= $quantity ? 'local' : 'hub',
                'supplier' => $storeName,
                'inStore' => $available >= $quantity,
            ]];

            $extra = (int) ($variant->pivot->extra_pieces ?? 0);
            $pieceVariant = $extra > 0 ? $pieces->pieceVariantFor($variant) : null;

            if ($pieceVariant !== null) {
                $onHand = $cart->store_id ? $stock->availableAtStore((int) $pieceVariant->id, (int) $cart->store_id) : 0;

                $rows[] = [
                    'id' => (int) $pieceVariant->id,
                    'name' => $name,
                    'variant' => 'Loose pieces',
                    'unitPrice' => (float) ($variant->pivot->extra_piece_price ?? 0),
                    'quantity' => $extra,
                    'fulfillment' => $onHand >= $extra ? 'local' : 'hub',
                    'supplier' => $storeName,
                    'inStore' => $onHand >= $extra,
                ];
            }

            return $rows;
        })->values()->all();

        return [
            'id' => (int) $cart->id,
            'reference' => 'CART-'.$cart->id,
            'customer' => $cart->customer?->name ?? 'Walk-in customer',
            'stage' => 'to_pay',
            'placed' => now()->format('d M Y, H:i'),
            'lines' => $lines,
            'destination' => [
                'name' => $cart->customer?->name ?? $storeName,
                'kind' => 'Delivery',
                'vehicle' => 'Assigned after Pick & Pack',
                'driver' => '',
                'address' => (string) ($cart->customer?->address ?? ''),
            ],
            'additionalCharges' => 0,
            'shippingFee' => 0,
        ];
    }

    private function storeId(Request $request): ?int
    {
        $storeId = $request->user()?->store_id;

        return $storeId !== null ? (int) $storeId : null;
    }
}
