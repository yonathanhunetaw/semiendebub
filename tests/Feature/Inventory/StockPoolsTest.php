<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\Inventory\StockPools;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Stock set aside for Business customers: Business sales draw only on the
 * set-aside, Individual (VAT) sales never touch it, and picking a Business
 * order uses its share up.
 */
class StockPoolsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StoreVariant $storeVariant;

    private StockLocation $shelf;

    private User $seller;

    /** TINs are unique; each Individual customer gets the next one. */
    private int $tins = 0;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['seller', 'admin'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->seller->assignRole('seller');

        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 10.00],
            'active' => true,
            'business_pool' => 40,
        ]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($variant->id, $this->shelf, 100);
    }

    #[Test]
    public function business_sales_stay_inside_the_set_aside(): void
    {
        $this->expectException(InsufficientStockException::class);

        $this->checkout(41, business: true);
    }

    #[Test]
    public function individual_sales_never_touch_the_set_aside(): void
    {
        $this->checkout(30, business: true);

        // 100 on hand, 30 held for Business, 10 still set aside: 60 left.
        $this->assertSame(10, app(StockPools::class)->businessLeft($this->variantId(), $this->store->id));
        $this->assertSame(60, app(StockService::class)->availableAtStore($this->variantId(), $this->store->id, StockPools::INDIVIDUAL));

        try {
            $this->checkout(61, business: false);
            $this->fail('An Individual sale took Business stock.');
        } catch (InsufficientStockException) {
        }

        $this->checkout(60, business: false);
        $this->assertSame(
            ['business' => 30, 'individual' => 60],
            StockReservation::query()->open()->get()->groupBy('pool')->map(fn ($rows) => (int) $rows->sum('quantity'))->sortKeys()->all(),
        );
    }

    #[Test]
    public function picking_a_business_order_uses_its_share_of_the_set_aside(): void
    {
        $sale = $this->checkout(25, business: true);

        app(StockService::class)->pick(StockReservation::query()->where('sale_item_id', $sale->items()->sole()->id)->sole(), $this->shelf);

        $this->assertSame(15, (int) $this->storeVariant->fresh()->business_pool);
        $this->assertSame(15, app(StockPools::class)->businessLeft($this->variantId(), $this->store->id));
    }

    #[Test]
    public function with_no_set_aside_everyone_shares_one_count(): void
    {
        $this->storeVariant->update(['business_pool' => null]);

        $this->checkout(90, business: false);

        $this->assertSame(10, app(StockService::class)->availableAtStore($this->variantId(), $this->store->id, StockPools::BUSINESS));
    }

    #[Test]
    public function an_admin_sets_the_pool_only_at_their_own_stores(): void
    {
        $other = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $theirs = User::factory()->create(['role' => 'admin', 'store_id' => $other->id]);
        $theirs->assignRole('admin');
        $global = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $global->assignRole('admin');
        $url = 'http://admin.'.config('app.system_domain').'/store-variants/'.$this->storeVariant->id.'/business-pool';

        $this->actingAs($theirs)->patchJson($url, ['business_pool' => 5])->assertNotFound();

        $this->actingAs($global)->patchJson($url, ['business_pool' => 20])
            ->assertOk()
            ->assertJson(['business_pool' => 20, 'pools' => ['business' => 20, 'individual' => 80]]);

        $this->actingAs($global)->patchJson($url, ['business_pool' => null])->assertOk()->assertJson(['pools' => null]);
        $this->assertNull($this->storeVariant->fresh()->business_pool);
    }

    private function checkout(int $quantity, bool $business): Sale
    {
        $customer = Customer::factory()->create([
            'created_by' => $this->seller->id,
            'store_id' => $this->store->id,
            'tin_number' => $business ? null : sprintf('%010d', ++$this->tins),
        ]);
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'seller_id' => $this->seller->id,
            'user_id' => $this->seller->id,
            'customer_id' => $customer->id,
            'status' => 'open',
        ]);
        $cart->variants()->attach($this->variantId(), ['quantity' => $quantity, 'price' => 10, 'store_id' => $this->store->id]);

        return app(CheckoutService::class)->checkout($cart, [], $this->seller->id);
    }

    private function variantId(): int
    {
        return (int) $this->storeVariant->item_variant_id;
    }
}
