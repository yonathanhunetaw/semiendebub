<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Seller app: the write paths and pages the other Seller tests do not reach —
 * cart edit / update / delete, the customer book, settings, the item list, a
 * category page, a refill route, and the seller's side of a shipment.
 */
class SellerWritePathsTest extends TestCase
{
    use RefreshDatabase;

    private const SLOT = '2026-12-01T08:30';

    private Store $store;

    private Store $otherStore;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'store_manager', 'stock_keeper', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->otherStore = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->seller = $this->user('seller', $this->store->id);

        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->seller);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function customer(array $overrides = []): Customer
    {
        return Customer::query()->create($overrides + [
            'first_name' => 'Abebe', 'email' => 'abebe@example.com', 'phone_number' => '0911000001', 'created_by' => $this->seller->id,
        ]);
    }

    private function cart(Store $store): Cart
    {
        return Cart::query()->create(['store_id' => $store->id, 'seller_id' => null, 'status' => 'open', 'session_id' => (string) random_int(100000, 999999)]);
    }

    // ---- Carts -------------------------------------------------------------

    #[Test]
    public function a_seller_edits_a_cart_of_their_store(): void
    {
        $cart = $this->cart($this->store);

        $this->get(route('seller.carts.edit', $cart))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Carts/Edit')->where('cart.id', $cart->id));

        $customer = $this->customer();
        $this->put(route('seller.carts.update', $cart), ['customer_id' => $customer->id, 'status' => 'processing'])
            ->assertRedirect(route('seller.carts.show', $cart->id));

        $cart->refresh();
        $this->assertSame($customer->id, (int) $cart->customer_id);
        $this->assertSame('processing', $cart->status);
    }

    #[Test]
    public function a_cart_update_needs_a_real_customer_and_a_known_status(): void
    {
        $cart = $this->cart($this->store);

        $this->put(route('seller.carts.update', $cart), [])->assertSessionHasErrors(['customer_id', 'status']);
        $this->put(route('seller.carts.update', $cart), ['customer_id' => $this->customer()->id, 'status' => 'shipped'])
            ->assertSessionHasErrors('status');

        $this->assertSame('open', $cart->fresh()->status);
    }

    #[Test]
    public function a_seller_deletes_a_cart_of_their_store(): void
    {
        $cart = $this->cart($this->store);

        $this->delete(route('seller.carts.destroy', $cart))->assertRedirect(route('seller.carts.index'));

        $this->assertNull(Cart::query()->find($cart->id));
    }

    #[Test]
    public function a_seller_cannot_edit_update_or_delete_another_stores_cart(): void
    {
        $theirs = $this->cart($this->otherStore);

        $this->get(route('seller.carts.edit', $theirs))->assertForbidden();
        $this->put(route('seller.carts.update', $theirs), ['customer_id' => $this->customer()->id, 'status' => 'completed'])->assertForbidden();
        $this->delete(route('seller.carts.destroy', $theirs))->assertForbidden();

        $this->assertSame('open', $theirs->fresh()->status);
    }

    // ---- Customers ---------------------------------------------------------

    #[Test]
    public function the_customer_pages_open(): void
    {
        $customer = $this->customer();

        $this->get(route('seller.customers.create'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Customers/Create'));
        $this->get(route('seller.customers.show', $customer))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Customers/Show')->where('customer.id', $customer->id));
        $this->get(route('seller.customers.edit', $customer->id))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Customers/Edit')->where('customer.id', $customer->id));
    }

    #[Test]
    public function a_seller_updates_a_customer_and_a_blank_tin_is_stored_as_none(): void
    {
        $customer = $this->customer(['tin_number' => '1234567890']);

        $this->put(route('seller.customers.update', $customer->id), [
            'first_name' => 'Abebe', 'email' => 'abebe@example.com', 'phone_number' => '0911000001', 'city' => 'bahir dar', 'tin_number' => '  ',
        ])->assertRedirect(route('seller.customers.show', $customer->id));

        $customer->refresh();
        $this->assertSame('Bahir Dar', $customer->city);
        $this->assertNull($customer->tin_number, 'a blank TIN makes the customer a business again');
    }

    #[Test]
    public function a_customer_cannot_take_another_customers_email_phone_or_tin(): void
    {
        $this->customer(['email' => 'a@example.com', 'phone_number' => '0911000010', 'tin_number' => '1111111111']);
        $b = $this->customer(['email' => 'b@example.com', 'phone_number' => '0911000011']);

        $this->put(route('seller.customers.update', $b->id), [
            'first_name' => 'B', 'email' => 'a@example.com', 'phone_number' => '0911000010', 'tin_number' => '1111111111',
        ])->assertSessionHasErrors(['email', 'phone_number', 'tin_number']);
    }

    #[Test]
    public function a_seller_deletes_a_customer(): void
    {
        $customer = $this->customer();

        $this->delete(route('seller.customers.destroy', $customer->id))->assertRedirect(route('seller.customers.index'));

        $this->assertNull(Customer::query()->find($customer->id));
        $this->delete(route('seller.customers.destroy', 999999))->assertNotFound();
    }

    // ---- Settings, items, categories, welcome ------------------------------

    #[Test]
    public function the_settings_page_opens_and_saving_reports_success(): void
    {
        $this->get(route('seller.settings.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Settings/Index'));

        $this->patch(route('seller.settings.update'), [])->assertSessionHas('success');
    }

    #[Test]
    public function the_old_item_list_address_sends_the_seller_to_the_dashboard(): void
    {
        $this->get(route('seller.items.index'))->assertRedirect(route('seller.dashboard'));
    }

    #[Test]
    public function the_item_page_feed_is_empty_for_a_seller_with_no_store(): void
    {
        $this->actingAs($this->user('seller', null));

        $this->getJson(route('seller.items.page-json'))->assertOk()->assertExactJson(['items' => [], 'nextPageUrl' => null]);
    }

    #[Test]
    public function the_item_page_feed_answers_with_json(): void
    {
        $this->getJson(route('seller.items.page-json'))->assertOk();
    }

    #[Test]
    public function a_category_page_lists_its_subcategories_and_items(): void
    {
        $parent = ItemCategory::factory()->create(['category_name' => 'Stationery']);
        ItemCategory::factory()->create(['category_name' => 'Pens', 'parent_id' => $parent->id]);

        $this->get(route('seller.categories.show', $parent))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Categories/Show')
                ->where('category.category_name', 'Stationery')
                ->where('subcategories', fn ($rows) => count($rows) === 1));
    }

    #[Test]
    public function a_guest_sees_the_seller_welcome_page(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('seller.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Welcome/index'));
    }

    // ---- Refill route ------------------------------------------------------

    private function shelf(): StockLocation
    {
        return StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
    }

    #[Test]
    public function a_store_manager_sets_where_an_item_is_refilled_from(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $manager = $this->user('store_manager', $this->store->id);
        $this->actingAs($manager);

        $this->put(route('seller.locations.routes.update', [$this->shelf(), $item]), ['sources' => ['remote_hub', 'floor']])
            ->assertSessionHasNoErrors()->assertSessionHas('success');

        $route = ItemRefillRoute::query()->where('store_id', $this->store->id)->where('item_id', $item->id)->sole();
        $this->assertSame(['remote_hub', 'floor'], $route->sources);
    }

    #[Test]
    public function a_refill_route_needs_known_distinct_sources(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $this->actingAs($this->user('store_manager', $this->store->id));
        $url = route('seller.locations.routes.update', [$this->shelf(), $item]);

        $this->put($url, [])->assertSessionHasErrors('sources');
        $this->put($url, ['sources' => ['teleport']])->assertSessionHasErrors('sources.0');
        $this->put($url, ['sources' => ['floor', 'floor']])->assertSessionHasErrors('sources.0');

        $this->assertSame(0, ItemRefillRoute::query()->count());
    }

    #[Test]
    public function a_plain_seller_cannot_set_a_refill_route(): void
    {
        $item = Item::factory()->create(['status' => 'active']);

        $this->put(route('seller.locations.routes.update', [$this->shelf(), $item]), ['sources' => ['floor']])->assertForbidden();

        $this->assertSame(0, ItemRefillRoute::query()->count());
    }

    // ---- The seller's side of a shipment ----------------------------------

    private function shipmentToMyStore(string $state = 'scheduled'): array
    {
        $origin = Store::factory()->create(['name' => 'Central Hub', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $destination = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);
        ItemStock::updateOrCreate(
            ['item_variant_id' => $variant->id, 'location_type' => Store::class, 'location_id' => $origin->id],
            ['quantity' => 100, 'min_stock_level' => 0],
        );

        $admin = $this->user('admin', null);
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->create($origin->id, $destination->id, $state === 'draft' ? [] : ['scheduled_for' => self::SLOT], $admin->id);
        $workflow->addItem($shipment->fresh(), $variant, 30, ['cbm' => 1.8, 'weight_kg' => 480]);
        $shipment = $shipment->fresh();

        if ($state === 'scheduled') {
            foreach ([
                ['creator', $admin],
                ['fleet', $this->user('delivery', null)],
                ['origin', $this->user('stock_keeper', $origin->id)],
                ['destination', $this->user('seller', $destination->id)],
            ] as [$party, $actor]) {
                $shipment = $workflow->recordPartyAgreement($shipment->fresh(), $party, self::SLOT, $actor);
            }
        }

        return [$shipment->fresh(), $destination, $variant, $origin];
    }

    #[Test]
    public function a_seller_at_the_destination_adds_a_line_and_sees_the_dispatched_page(): void
    {
        [$shipment, $destination, $variant] = $this->shipmentToMyStore('draft');
        $this->actingAs($this->user('seller', $destination->id));
        $other = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);

        $this->post(route('seller.shipments.items.store', $shipment), ['item_variant_id' => $other->id, 'quantity' => 5])
            ->assertSessionHas('success');
        $this->assertCount(2, $shipment->fresh()->items);

        $this->get(route('seller.shipments.dispatched', $shipment))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Seller/Shipments/Dispatched/index')->where('transfer_id', $shipment->id));
    }

    #[Test]
    public function a_manifest_line_needs_a_real_variant_and_a_positive_quantity(): void
    {
        [$shipment, $destination] = $this->shipmentToMyStore('draft');
        $this->actingAs($this->user('seller', $destination->id));

        $this->post(route('seller.shipments.items.store', $shipment), ['item_variant_id' => 999999, 'quantity' => 0])
            ->assertSessionHasErrors(['item_variant_id', 'quantity']);
    }

    #[Test]
    public function a_seller_at_neither_end_cannot_touch_the_shipment(): void
    {
        [$shipment, , $variant] = $this->shipmentToMyStore('scheduled');
        // $this->seller works at an unrelated store.

        $this->post(route('seller.shipments.items.store', $shipment), ['item_variant_id' => $variant->id, 'quantity' => 1])->assertForbidden();
        $this->post(route('seller.shipments.handover', $shipment))->assertForbidden();
        $this->get(route('seller.shipments.dispatched', $shipment))->assertForbidden();

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
    }

    #[Test]
    public function only_the_origin_dock_can_hand_over_so_the_destination_seller_is_refused(): void
    {
        [$shipment, $destination, $variant, $origin] = $this->shipmentToMyStore('scheduled');
        $this->actingAs($this->user('seller', $destination->id));

        $this->post(route('seller.shipments.handover', $shipment))->assertSessionHas('error');

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->fresh()->status);
        $this->assertSame(100, $this->stockAt($variant, $origin));
    }

    #[Test]
    public function a_seller_at_the_origin_hands_over_and_stock_leaves_the_origin(): void
    {
        [$shipment, , $variant, $origin] = $this->shipmentToMyStore('scheduled');
        $this->actingAs($this->user('seller', $origin->id));

        $this->post(route('seller.shipments.handover', $shipment))->assertSessionHas('success');

        $this->assertSame(ShipmentWorkflowService::DISPATCHED, $shipment->fresh()->status);
        $this->assertSame(70, $this->stockAt($variant, $origin));
    }

    private function stockAt(ItemVariant $variant, Store $store): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $variant->id)->where('location_type', Store::class)->where('location_id', $store->id)->sum('quantity');
    }
}
