<?php

namespace Tests\Feature;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckoutServiceTest extends TestCase
{
    use RefreshDatabase;

    protected StockService $stockService;
    protected CheckoutService $checkoutService;
    protected Store $store;
    protected Customer $customer;
    protected User $seller;
    protected Item $item;
    protected ItemVariant $itemVariant;
    protected StoreVariant $storeVariant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->stockService = new StockService();
        $this->checkoutService = new CheckoutService($this->stockService);

        $this->store = Store::create([
            'name' => 'Main Branch',
            'location' => 'Bole, Addis Ababa',
            'status' => 'active',
        ]);

        $this->seller = User::factory()->create([
            'role' => 'seller',
            'store_id' => $this->store->id,
        ]);

        $this->customer = Customer::create([
            'name' => 'Abebe Kebede',
            'phone' => '0911223344',
            'email' => 'abebe@example.com',
            'tin_number' => '1234567890',
            'store_id' => $this->store->id,
        ]);

        $this->item = Item::create([
            'product_name' => 'Fountain Pen',
            'description' => 'Fine nib executive pen',
            'status' => 'active',
        ]);

        $this->itemVariant = ItemVariant::create([
            'item_id' => $this->item->id,
            'sku' => 'PEN-EXEC-BLK',
        ]);

        $this->storeVariant = StoreVariant::create([
            'item_id' => $this->item->id,
            'item_variant_id' => $this->itemVariant->id,
            'store_id' => $this->store->id,
            'pricing_matrix' => ['price' => 200.00],
            'active' => true,
        ]);
    }

    public function test_successful_cart_checkout_generates_sale_and_deducts_stock(): void
    {
        // 1. Initial stock: 20 units
        $this->stockService->recordPurchase($this->storeVariant, 20, 'PO-PEN-01');
        $this->assertEquals(20, $this->stockService->getCurrentStock($this->storeVariant));

        // 2. Create an open cart with 3 items
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'customer_id' => $this->customer->id,
            'seller_id' => $this->seller->id,
            'status' => 'open',
        ]);

        $cart->variants()->attach($this->itemVariant->id, [
            'quantity' => 3,
            'price' => 200.00,
            'store_id' => $this->store->id,
        ]);

        // 3. Checkout with payment and delivery data
        $sale = $this->checkoutService->checkout(
            cart: $cart,
            paymentData: [
                'payment_method' => 'telebirr',
                'amount' => 690.00, // 200 * 1.15 tax = 230 * 3 = 690
                'transaction_reference' => 'TB-998877',
            ],
            userId: $this->seller->id,
            deliveryData: [
                'delivery_address' => 'House 12, Bole',
            ]
        );

        // 4. Assertions on Sale
        $this->assertInstanceOf(Sale::class, $sale);
        $this->assertEquals('completed', $sale->status);
        $this->assertEquals('paid', $sale->payment_status);
        $this->assertCount(1, $sale->items);
        $this->assertEquals(3, $sale->items->first()->quantity);

        // 5. Stock verification: 20 - 3 = 17 remaining
        $this->assertEquals(17, $this->stockService->getCurrentStock($this->storeVariant));

        // 6. Cart transitioned to completed
        $this->assertEquals('completed', $cart->fresh()->status);

        // 7. Payment logged
        $this->assertCount(1, $sale->payments);
        $this->assertEquals('telebirr', $sale->payments->first()->payment_method);

        // 8. Delivery logged
        $this->assertNotNull($sale->delivery);
        $this->assertEquals('House 12, Bole', $sale->delivery->delivery_address);
    }

    public function test_checkout_fails_if_insufficient_stock(): void
    {
        // Only 2 units in stock
        $this->stockService->recordPurchase($this->storeVariant, 2, 'PO-PEN-02');

        // Cart wants 5 units
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'customer_id' => $this->customer->id,
            'seller_id' => $this->seller->id,
            'status' => 'open',
        ]);

        $cart->variants()->attach($this->itemVariant->id, [
            'quantity' => 5,
            'price' => 200.00,
            'store_id' => $this->store->id,
        ]);

        $this->expectException(InsufficientStockException::class);
        $this->checkoutService->checkout($cart);
    }

    public function test_checkout_fails_on_empty_cart(): void
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'status' => 'open',
        ]);

        $this->expectException(CartCheckoutException::class);
        $this->checkoutService->checkout($cart);
    }

    public function test_checkout_fails_on_already_completed_cart(): void
    {
        $this->stockService->recordPurchase($this->storeVariant, 10, 'PO-PEN-03');

        $cart = Cart::create([
            'store_id' => $this->store->id,
            'status' => 'completed',
        ]);

        $cart->variants()->attach($this->itemVariant->id, [
            'quantity' => 1,
            'price' => 200.00,
            'store_id' => $this->store->id,
        ]);

        $this->expectException(CartCheckoutException::class);
        $this->checkoutService->checkout($cart);
    }
}
