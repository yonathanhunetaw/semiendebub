<?php

declare(strict_types=1);

namespace Tests\Feature\Fulfillment;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Checkout's delivery choices (a custom fee, a vehicle that collects, or
 * "add later") and Pick & pack progress that the seller, the stock keeper
 * and the courier all see.
 */
class PickProgressTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    private Customer $customer;

    private StoreVariant $storeVariant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['seller', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->user('seller');

        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 100.00],
            'active' => true,
        ]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($variant->id, $shelf, 100);

        // Credit lets an order reach Pick & pack without a second person.
        $this->customer = Customer::factory()->create([
            'created_by' => $this->seller->id,
            'store_id' => $this->store->id,
            'tin_number' => null,
            'credit_limit' => 100000,
            'credit_days' => 30,
        ]);
    }

    #[Test]
    public function a_custom_delivery_fee_joins_the_total_and_the_payment_must_cover_it(): void
    {
        $cart = $this->cart(2);
        $base = $this->total($cart);

        $this->place($cart, [['method' => 'credit', 'amount' => $base]], ['delivery_option' => 'custom', 'delivery_fee' => 75])
            ->assertSessionHas('error');
        $this->assertSame(0, Sale::query()->count());

        $this->place($cart, [['method' => 'credit', 'amount' => $base + 75]], ['delivery_option' => 'custom', 'delivery_fee' => 75])
            ->assertSessionHasNoErrors();

        $sale = Sale::query()->sole();
        $this->assertSame(round($base + 75, 2), (float) $sale->total_amount);
        $this->assertSame(75.0, (float) $sale->delivery_fee);
        $this->assertSame('custom', $sale->delivery_option);
    }

    #[Test]
    public function a_standard_option_charges_nothing_now(): void
    {
        $cart = $this->cart(1);
        $base = $this->total($cart);

        $this->place($cart, [['method' => 'credit', 'amount' => $base]], ['delivery_option' => 'express', 'delivery_fee' => 500])
            ->assertSessionHasNoErrors();

        $this->assertSame($base, (float) Sale::query()->sole()->total_amount);
    }

    #[Test]
    public function a_vehicle_dispatch_keeps_the_plate_and_driver_phone_and_add_later_keeps_nothing(): void
    {
        $this->place($this->cart(1), [], ['delivery_method' => 'vehicle', 'vehicle_plate' => '3-a12345'])
            ->assertSessionHasErrors('driver_phone');

        $this->place($this->cart(1), [], [
            'delivery_method' => 'vehicle',
            'vehicle_plate' => '3-a12345',
            'driver_phone' => '0911223344',
            'delivery_address' => 'Ignored for a collection',
        ])->assertSessionHasNoErrors();

        $delivery = Delivery::query()->sole();
        $this->assertSame([Delivery::METHOD_VEHICLE, '3-A12345', '0911223344', null], [
            $delivery->method, $delivery->vehicle_plate, $delivery->driver_phone, $delivery->delivery_address,
        ]);

        $this->place($this->cart(1), [], ['delivery_method' => 'later', 'delivery_address' => 'Bole'])->assertSessionHasNoErrors();
        $this->assertSame(1, Delivery::query()->count(), 'Add later opens no delivery yet.');
    }

    #[Test]
    public function the_seller_and_the_stock_keeper_share_one_pick_and_pack_progress(): void
    {
        $sale = $this->creditOrder();
        $line = $sale->items()->sole();
        $keeper = $this->user('stock_keeper');

        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.orders.packed', $sale), ['done' => true])
            ->assertSessionHas('error');
        $this->assertNull($sale->fresh()->packed_at, 'Nothing is packed before every line is in hand.');

        $this->as($this->seller)->post(route('seller.orders.lines.tick', ['sale' => $sale, 'item' => $line]), ['done' => true]);
        $sale->refresh();
        $this->assertNotNull($line->fresh()->ticked_at);
        $this->assertSame($this->seller->id, (int) $sale->picking_started_by, 'Ticking the first line starts picking.');

        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.orders.packed', $sale), ['done' => true])
            ->assertSessionHas('success');
        $this->assertNotNull($sale->fresh()->packed_at);

        // Putting a line back opens the parcel again.
        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.orders.lines.tick', ['sale' => $sale, 'item' => $line]), ['done' => false]);
        $this->assertNull($sale->fresh()->packed_at);
    }

    #[Test]
    public function the_courier_sees_an_order_being_packed_for_them(): void
    {
        $courier = $this->user('delivery');
        $sale = $this->creditOrder(['delivery_address' => 'Bole, house 12', 'courier_id' => $courier->id]);

        $this->as($courier, 'delivery')->get(route('delivery.dashboard'))
            ->assertInertia(fn ($page) => $page->where('being_packed', []));

        $this->as($this->seller)->post(route('seller.orders.picking.start', $sale))->assertSessionHas('success');

        $this->as($courier, 'delivery')->get(route('delivery.dashboard'))
            ->assertInertia(fn ($page) => $page
                ->where('being_packed.0.reference', $sale->reference_number)
                ->where('being_packed.0.mine', true)
                ->where('being_packed.0.address', 'Bole, house 12')
                ->where('being_packed.0.in_hand', 0));
    }

    #[Test]
    public function another_stores_staff_cannot_touch_the_progress(): void
    {
        $sale = $this->creditOrder();
        $other = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $outsider = User::factory()->create(['role' => 'seller', 'store_id' => $other->id]);
        $outsider->assignRole('seller');

        $this->as($outsider)->post(route('seller.orders.picking.start', $sale))->assertNotFound();
        $this->assertNull($sale->fresh()->picking_started_at);
    }

    /** @param array<string, mixed> $extra */
    private function creditOrder(array $extra = []): Sale
    {
        $cart = $this->cart(1);

        $this->place($cart, [['method' => 'credit', 'amount' => $this->total($cart)]], $extra)->assertSessionHasNoErrors();

        return Sale::query()->latest('id')->firstOrFail();
    }

    /**
     * @param  array<int, array<string, mixed>>  $parts
     * @param  array<string, mixed>  $extra
     */
    private function place(Cart $cart, array $parts, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->as($this->seller)->post(route('seller.orders.store'), ['cart_id' => $cart->id, 'parts' => $parts] + $extra);
    }

    private function total(Cart $cart): float
    {
        $unit = app(CheckoutService::class)->unitPrice($cart->fresh(['customer']), $this->storeVariant, 100);

        return round($unit * (int) $cart->variants()->first()->pivot->quantity, 2);
    }

    private function cart(int $quantity): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'user_id' => $this->seller->id,
            'seller_id' => $this->seller->id,
            'customer_id' => $this->customer->id,
            'status' => 'open',
        ]);
        $cart->variants()->attach($this->storeVariant->item_variant_id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $role === 'delivery' ? null : $this->store->id]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function as(User $user, string $subdomain = 'seller'): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
