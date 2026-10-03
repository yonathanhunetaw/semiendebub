<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

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
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Orders, Deliveries and Payments, over real orders. */
class AdminOperationsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $this->variant->id, 'active' => true]);
        app(StockService::class)->receive($this->variant->id, $this->shelf, 20);

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);
    }

    #[Test]
    public function the_order_list_shows_every_stage_and_opens_the_custody_log(): void
    {
        $unpaid = $this->order(1, paid: false);
        $paid = $this->order(2, paid: true);

        $this->get(route('admin.orders.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Orders/Index')
                ->where('counts.to_pay', 1)
                ->where('counts.paid', 1)
                ->where('orders', fn ($orders) => count($orders) === 2));

        $this->get(route('admin.orders.index', ['stage' => 'to_pay']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('orders.0.reference', $unpaid->reference_number)->where('orders', fn ($o) => count($o) === 1));

        $this->get(route('admin.orders.custody', ['reference' => $paid->reference_number]))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Orders/Custody')->where('log.reference', $paid->reference_number));
    }

    #[Test]
    public function an_admin_puts_a_courier_on_a_picked_order_but_not_on_an_unpicked_one(): void
    {
        $courier = User::factory()->create(['role' => 'delivery', 'first_name' => 'Chala']);
        $courier->assignRole('delivery');

        $unpicked = $this->order(1, paid: true, address: 'Bole');
        $picked = $this->order(2, paid: true, address: 'Piassa');
        app(OrderSourcingService::class)->confirmSourcing($picked->fresh(), $picked->items->map(fn ($i) => [
            'sale_item_id' => $i->id, 'location_type' => StockLocation::class, 'location_id' => $this->shelf->id,
        ])->all());

        $this->get(route('admin.deliveries.index', ['status' => 'unassigned']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('counts.unassigned', 1)->where('deliveries.0.order', $picked->reference_number));

        $early = Delivery::query()->where('sale_id', $unpicked->id)->sole();
        $this->patch(route('admin.deliveries.assign', $early), ['courier_id' => $courier->id])->assertSessionHas('error');

        $ready = Delivery::query()->where('sale_id', $picked->id)->sole();
        $this->patch(route('admin.deliveries.assign', $ready), ['courier_id' => $courier->id])->assertSessionHas('success');
        $this->assertSame($courier->id, (int) $ready->fresh()->courier_id);
    }

    #[Test]
    public function payments_list_every_payment_with_todays_takings(): void
    {
        $this->order(1, paid: true);
        $this->order(1, paid: true);

        $this->get(route('admin.payments.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Payments/Index')
                ->where('payments', fn ($rows) => count($rows) === 2)
                ->where('today.0.method', 'cash')
                ->where('today.0.count', 2));
    }

    private function order(int $quantity, bool $paid, ?string $address = null): Sale
    {
        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 100, 'store_id' => $this->store->id]);

        return app(CheckoutService::class)->checkout(
            $cart,
            $paid ? ['payment_method' => 'cash'] : [],
            null,
            $address !== null ? ['delivery_address' => $address] : [],
        );
    }
}
