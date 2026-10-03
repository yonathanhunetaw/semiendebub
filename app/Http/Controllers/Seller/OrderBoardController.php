<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Exceptions\CartCheckoutException;
use App\Http\Requests\Seller\PayOrderRequest;
use App\Http\Requests\Seller\PlaceOrderRequest;
use App\Http\Requests\Seller\UpdateOrderAddressRequest;
use App\Models\Finance\Sale;
use App\Models\Seller\Cart;
use App\Services\Fulfillment\SellerOrderService;
use App\Services\StockService;
use Illuminate\Http\RedirectResponse;
use App\Services\Fulfillment\CustodyLog;
use App\Services\Fulfillment\SellerOrderBoard;
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
    public function __construct(private readonly SellerOrderBoard $board)
    {
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
        ]);
    }

    /** Cart → order. Paid now lands in Pick & Pack; otherwise in To pay. */
    public function store(PlaceOrderRequest $request, SellerOrderService $orders): RedirectResponse
    {
        $cart = $this->ownCart($request, (int) $request->validated('cart_id'));

        abort_if($cart === null, 404);

        try {
            $sale = $orders->place($cart, $request->user(), $request->validated());
        } catch (CartCheckoutException $e) {
            return back()->with('error', $e->getMessage());
        }

        return $sale->payment_status === 'paid'
            ? redirect()->route('seller.orders.pickpack', ['reference' => $sale->reference_number])
                ->with('success', "Order {$sale->reference_number} paid. Pick and pack it now.")
            : redirect()->route('seller.orders.pay', ['reference' => $sale->reference_number])
                ->with('success', "Order {$sale->reference_number} placed. Its stock is held while it waits for payment.");
    }

    public function payment(PayOrderRequest $request, string $reference, SellerOrderService $orders): RedirectResponse
    {
        $sale = $this->ownSale($request, $reference);

        try {
            $orders->pay($sale, $request->user(), $request->validated());
        } catch (CartCheckoutException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('seller.orders.pickpack', ['reference' => $reference])
            ->with('success', "Payment recorded for {$reference}. Pick and pack it now.");
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
        return Inertia::render('Seller/Orders/ToPay', [
            'reference' => $reference,
            'order' => $this->board->find($reference, $this->storeId($request)),
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
        $storeName = $cart->store?->name ?? 'Store';

        $lines = $cart->variants->map(function ($variant) use ($cart, $stock, $storeName): array {
            $quantity = (int) ($variant->pivot->quantity ?? 1);
            $available = $cart->store_id ? $stock->availableAtStore((int) $variant->id, (int) $cart->store_id) : 0;
            $label = collect([$variant->itemColor?->name, $variant->itemSize?->name, $variant->itemPackagingType?->name])
                ->filter()->join(' · ');

            return [
                'id' => (int) $variant->id,
                'name' => (string) ($variant->item?->product_name ?? $variant->sku ?? 'Unnamed product'),
                'variant' => $label !== '' ? $label : 'Standard',
                'unitPrice' => (float) ($variant->pivot->price ?? 0),
                'quantity' => $quantity,
                // The store can sell it today, or it has to come from a hub.
                'fulfillment' => $available >= $quantity ? 'local' : 'hub',
                'supplier' => $storeName,
                'inStore' => $available >= $quantity,
            ];
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
