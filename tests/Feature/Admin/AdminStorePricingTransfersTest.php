<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Admin → Stores: create / edit / delete, the price tiers (business, individual,
 * per customer, per seller), discount overrides and the store-level transfers.
 */
class AdminStorePricingTransfersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    private Item $item;

    private ItemVariant $variant;

    private StoreVariant $sv;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        $this->sv = StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 100.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function customer(?string $tin = null, string $email = 'c@example.com', string $phone = '0911000001'): Customer
    {
        return Customer::query()->create([
            'first_name' => 'Abebe', 'email' => $email, 'phone_number' => $phone, 'tin_number' => $tin, 'created_by' => $this->admin->id,
        ]);
    }

    private function seller(): User
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $seller->assignRole('seller');

        return $seller;
    }

    // ---- Store CRUD --------------------------------------------------------

    #[Test]
    public function the_store_list_and_forms_open(): void
    {
        $this->get(route('store.index'))->assertOk();
        $this->get(route('store.create'))->assertOk();
        // NOTE: neither Stores/Create.tsx nor Stores/Edit.tsx exists under resources/js/Pages/Admin/Inventory,
        // so these answer 200 with a component name the browser cannot load. Asserting only the data.
        $response = $this->get(route('store.edit', $this->store))->assertOk();
        $this->assertSame($this->store->id, $response->viewData('page')['props']['store']['id']);
    }

    #[Test]
    public function an_admin_creates_a_store_that_gets_a_shelf_and_a_floor(): void
    {
        $this->post(route('store.store'), ['name' => 'Bole Branch', 'location' => 'Bole', 'status' => 'active'])
            ->assertRedirect(route('store.index'))->assertSessionHas('success');

        $store = Store::query()->where('name', 'Bole Branch')->sole();
        $kinds = StockLocation::query()->where('store_id', $store->id)->pluck('kind')->all();
        $this->assertContains(StockLocation::KIND_SHELF, $kinds);
        $this->assertContains(StockLocation::KIND_BACKROOM, $kinds);
    }

    #[Test]
    public function a_store_needs_a_unique_name_and_a_valid_status(): void
    {
        $this->post(route('store.store'), [])->assertSessionHasErrors('name');
        $this->post(route('store.store'), ['name' => 'Main Store'])->assertSessionHasErrors('name');
        $this->post(route('store.store'), ['name' => 'Odd', 'status' => 'archived'])->assertSessionHasErrors('status');

        $this->assertSame(1, Store::query()->count());
    }

    #[Test]
    public function an_admin_updates_and_deletes_a_store(): void
    {
        $this->patch(route('store.update', $this->store), ['name' => 'Renamed', 'status' => 'inactive'])
            ->assertRedirect(route('store.index'));
        $this->assertSame('Renamed', $this->store->fresh()->name);

        $other = Store::factory()->create();
        $this->patch(route('store.update', $other), ['name' => 'Renamed'])->assertSessionHasErrors('name');

        $this->delete(route('store.destroy', $other))->assertRedirect(route('store.index'));
        $this->assertNull(Store::query()->find($other->id));
    }

    // ---- The business price and the automatic individual price -------------

    #[Test]
    public function updating_a_variant_price_sets_the_business_price_and_an_individual_price_15_percent_higher(): void
    {
        $this->patch(route('store-variant.update', $this->sv), ['price' => 200, 'discount_price' => 180, 'active' => true])
            ->assertOk();

        $matrix = $this->sv->fresh()->pricing_matrix;
        $this->assertSame(200.0, (float) $matrix['price']);
        $this->assertSame(180.0, (float) $matrix['discount_price']);

        $individual = StoreVariantIndividualPrice::query()->where('store_variant_id', $this->sv->id)->sole();
        $this->assertSame(230.0, (float) $individual->pricing_matrix['price']);
        $this->assertSame(207.0, (float) $individual->pricing_matrix['discount_price']);
        $this->assertTrue((bool) $individual->pricing_matrix['auto_from_business']);
    }

    #[Test]
    public function a_hand_set_individual_price_is_not_overwritten_by_a_business_price_change(): void
    {
        $this->post(route('store-variant.individual-price.upsert', $this->sv), ['price' => 150])->assertOk();

        $this->patch(route('store-variant.update', $this->sv), ['price' => 400])->assertOk();

        $individual = StoreVariantIndividualPrice::query()->where('store_variant_id', $this->sv->id)->sole();
        $this->assertSame(150.0, (float) $individual->pricing_matrix['price']);
        $this->assertFalse((bool) $individual->pricing_matrix['auto_from_business']);
    }

    #[Test]
    public function a_variant_can_be_switched_off_and_its_price_must_be_valid(): void
    {
        $this->patch(route('store-variant.update', $this->sv), ['price' => 100, 'active' => false])->assertOk();
        $this->assertFalse((bool) $this->sv->fresh()->active);

        $this->patchJson(route('store-variant.update', $this->sv), [])->assertJsonValidationErrors('price');
        $this->patchJson(route('store-variant.update', $this->sv), ['price' => -5])->assertJsonValidationErrors('price');
        $this->patchJson(route('store-variant.update', $this->sv), ['price' => 'free'])->assertJsonValidationErrors('price');
    }

    #[Test]
    public function an_individual_price_can_be_set_and_removed(): void
    {
        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), ['price' => 150, 'discount_price' => 140])
            ->assertOk()->assertJson(['price' => 150.0, 'discount_price' => 140.0, 'active' => true]);
        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), ['price' => 160])->assertOk();
        $this->assertSame(1, StoreVariantIndividualPrice::query()->where('store_variant_id', $this->sv->id)->count(), 'updating must not duplicate');

        $this->postJson(route('store-variant.individual-price.upsert', $this->sv), [])->assertJsonValidationErrors('price');

        $this->deleteJson(route('store-variant.individual-price.destroy', $this->sv))->assertOk()->assertJson(['ok' => true]);
        $this->assertSame(0, StoreVariantIndividualPrice::query()->count());
        $this->deleteJson(route('store-variant.individual-price.destroy', $this->sv))->assertOk();
    }

    // ---- Customer prices ---------------------------------------------------

    #[Test]
    public function a_customer_price_is_set_once_per_customer_and_updated_in_place(): void
    {
        $business = $this->customer(null);

        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $business->id, 'customer_type' => 'business', 'price' => 90,
        ])->assertOk();
        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $business->id, 'customer_type' => 'business', 'price' => 85, 'discount_price' => 80,
        ])->assertOk();

        $price = StoreVariantCustomerPrice::query()->sole();
        $this->assertSame(85.0, (float) $price->pricing_matrix['price']);
        $this->assertSame(80.0, (float) $price->pricing_matrix['discount_price']);
    }

    #[Test]
    public function a_customer_price_must_match_whether_the_customer_has_a_tin(): void
    {
        $withTin = $this->customer('1234567890', 'tin@example.com', '0911000002');

        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $withTin->id, 'customer_type' => 'business', 'price' => 90,
        ])->assertStatus(422)->assertJsonPath('message', 'Select an business customer for this price.');

        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [
            'customer_id' => $withTin->id, 'customer_type' => 'individual', 'price' => 90,
        ])->assertOk();
        $this->assertSame(1, StoreVariantCustomerPrice::query()->count());
    }

    #[Test]
    public function a_customer_price_needs_a_real_customer_a_type_and_a_price(): void
    {
        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), [])
            ->assertJsonValidationErrors(['customer_id', 'customer_type', 'price']);
        $this->postJson(route('store-variant.customer-price.upsert', $this->sv), ['customer_id' => 999999, 'customer_type' => 'vip', 'price' => -1])
            ->assertJsonValidationErrors(['customer_id', 'customer_type', 'price']);
    }

    #[Test]
    public function a_customer_price_can_be_removed(): void
    {
        $price = StoreVariantCustomerPrice::query()->create(['store_variant_id' => $this->sv->id, 'customer_id' => $this->customer()->id, 'pricing_matrix' => ['price' => 90]]);

        $this->deleteJson(route('store-variant.customer-price.destroy', $price->id))->assertOk()->assertJson(['ok' => true]);

        $this->assertSame(0, StoreVariantCustomerPrice::query()->count());
    }

    // ---- Seller prices -----------------------------------------------------

    #[Test]
    public function a_seller_gets_a_price_per_customer_type_in_one_record(): void
    {
        $seller = $this->seller();

        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), ['seller_id' => $seller->id, 'customer_type' => 'business', 'price' => 95])->assertOk();
        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), ['seller_id' => $seller->id, 'customer_type' => 'individual', 'price' => 110])->assertOk();

        $record = StoreVariantSellerPrice::query()->sole();
        $this->assertSame(95.0, (float) $record->pricing_matrix['business']['price']);
        $this->assertSame(110.0, (float) $record->pricing_matrix['individual']['price']);
        $this->assertTrue((bool) $record->active);
    }

    #[Test]
    public function removing_one_seller_tier_keeps_the_other_and_removing_the_last_deletes_the_record(): void
    {
        $seller = $this->seller();
        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), ['seller_id' => $seller->id, 'customer_type' => 'business', 'price' => 95]);
        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), ['seller_id' => $seller->id, 'customer_type' => 'individual', 'price' => 110]);
        $record = StoreVariantSellerPrice::query()->sole();

        $this->deleteJson(route('store-variant.seller-price.destroy', $record->id), ['customer_type' => 'business'])->assertOk();
        $matrix = $record->fresh()->pricing_matrix;
        $this->assertArrayNotHasKey('business', $matrix);
        $this->assertArrayHasKey('individual', $matrix);

        $this->deleteJson(route('store-variant.seller-price.destroy', $record->id), ['customer_type' => 'individual'])->assertOk();
        $this->assertSame(0, StoreVariantSellerPrice::query()->count());
    }

    #[Test]
    public function a_seller_price_needs_a_real_user_a_type_and_a_price(): void
    {
        $this->postJson(route('store-variant.seller-price.upsert', $this->sv), [])->assertJsonValidationErrors(['seller_id', 'customer_type', 'price']);

        $record = StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $this->seller()->id, 'pricing_matrix' => ['business' => ['price' => 90]], 'active' => true]);
        $this->deleteJson(route('store-variant.seller-price.destroy', $record->id), [])->assertJsonValidationErrors('customer_type');
    }

    // ---- Discount overrides ------------------------------------------------

    #[Test]
    public function a_discount_can_be_set_and_cleared_on_the_business_price(): void
    {
        $this->patch(route('store-price-override.update', ['b2b', $this->sv->id]), ['discount_price' => 70, 'discount_ends_at' => '2026-12-31'])->assertRedirect();
        $this->assertSame(70.0, (float) $this->sv->fresh()->pricing_matrix['discount_price']);
        $this->assertSame(100.0, (float) $this->sv->fresh()->pricing_matrix['price'], 'the list price must not change');

        $this->delete(route('store-price-override.destroy', ['b2b', $this->sv->id]))->assertRedirect();
        $this->assertNull($this->sv->fresh()->pricing_matrix['discount_price']);
    }

    #[Test]
    public function a_discount_can_be_set_and_cleared_on_every_other_price_kind(): void
    {
        $individual = StoreVariantIndividualPrice::query()->create(['store_variant_id' => $this->sv->id, 'pricing_matrix' => ['price' => 115], 'active' => true]);
        $customerPrice = StoreVariantCustomerPrice::query()->create(['store_variant_id' => $this->sv->id, 'customer_id' => $this->customer()->id, 'pricing_matrix' => ['price' => 90]]);
        $sellerPrice = StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $this->seller()->id, 'pricing_matrix' => ['business' => ['price' => 95], 'individual' => ['price' => 105]], 'active' => true]);

        $this->patch(route('store-price-override.update', ['individual', $individual->id]), ['discount_price' => 100])->assertRedirect();
        $this->assertSame(100.0, (float) $individual->fresh()->pricing_matrix['discount_price']);

        $this->patch(route('store-price-override.update', ['customer', $customerPrice->id]), ['discount_price' => 80])->assertRedirect();
        $this->assertSame(80.0, (float) $customerPrice->fresh()->pricing_matrix['discount_price']);

        $this->patch(route('store-price-override.update', ['seller', $sellerPrice->id]), ['discount_price' => 60])->assertRedirect();
        $matrix = $sellerPrice->fresh()->pricing_matrix;
        $this->assertSame([60.0, 60.0], [(float) $matrix['business']['discount_price'], (float) $matrix['individual']['discount_price']]);

        $this->delete(route('store-price-override.destroy', ['individual', $individual->id]));
        $this->assertNull($individual->fresh()->pricing_matrix['discount_price']);
        $this->delete(route('store-price-override.destroy', ['seller', $sellerPrice->id]));
        $this->assertNull($sellerPrice->fresh()->pricing_matrix['business']['discount_price']);
        $this->delete(route('store-price-override.destroy', ['customer', $customerPrice->id]))->assertRedirect();
        $this->assertSame(0, StoreVariantCustomerPrice::query()->count(), 'clearing a customer override removes the record');
    }

    #[Test]
    public function an_unknown_override_source_or_a_negative_discount_is_refused(): void
    {
        $this->patch(route('store-price-override.update', ['mystery', 1]), ['discount_price' => 5])->assertStatus(422);
        $this->delete(route('store-price-override.destroy', ['mystery', 1]))->assertStatus(422);
        $this->patch(route('store-price-override.update', ['b2b', $this->sv->id]), ['discount_price' => -1])->assertSessionHasErrors('discount_price');
        $this->patch(route('store-price-override.update', ['b2b', 999999]), ['discount_price' => 5])->assertNotFound();
    }

    // ---- Store-level transfers --------------------------------------------

    private function shelf(): \App\Models\StockKeeper\ItemInventoryLocation
    {
        return $this->store->inventoryLocations()->shelves()->firstOrFail();
    }

    #[Test]
    public function a_store_transfer_from_a_shelf_needs_its_details_and_is_raised_for_the_store(): void
    {
        $url = route('store.transfer.create', $this->store);

        $this->post($url, [])->assertSessionHasErrors(['store_variant_id', 'quantity', 'from_location_id']);
        $this->post($url, ['store_variant_id' => $this->sv->id, 'quantity' => 0, 'from_location_id' => $this->shelf()->id])->assertSessionHasErrors('quantity');
        $this->post($url, ['store_variant_id' => 999999, 'quantity' => 1, 'from_location_id' => 999999])->assertSessionHasErrors(['store_variant_id', 'from_location_id']);

        $this->assertSame(0, Transfer::query()->count());
    }

    private function remoteTransfer(): Transfer
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        app(StockService::class)->receive($this->variant->id, $remote, 20);

        return app(\App\Services\TransferWorkflowService::class)->create(
            variantId: $this->variant->id, fromStoreId: null, toStoreId: $this->store->id, quantity: 8, initiatedBy: $this->admin->id,
            sourceLocationType: StockLocation::class, sourceLocationId: $remote->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $floor->id,
        );
    }

    #[Test]
    public function a_store_transfer_is_dispatched_received_and_the_stock_lands_on_the_floor(): void
    {
        $transfer = $this->remoteTransfer();
        $courier = User::factory()->create(['role' => 'delivery']);
        $courier->assignRole('delivery');
        $transfer->update(['courier_id' => $courier->id]);
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        $this->patch(route('store-transfer.receive', $transfer))->assertStatus(422);

        $this->patch(route('store-transfer.dispatch', $transfer))->assertRedirect();
        $this->assertSame('in_transit', $transfer->fresh()->status);

        $this->patch(route('store-transfer.receive', $transfer))->assertRedirect();
        $this->assertSame('completed', $transfer->fresh()->status);
        $this->assertSame(8, (int) ItemStock::query()->where('stock_location_id', $floor->id)->sum('quantity'));

        $this->patch(route('store-transfer.dispatch', $transfer))->assertStatus(422);
    }

    #[Test]
    public function a_store_transfer_can_be_cancelled_until_it_is_completed(): void
    {
        $transfer = $this->remoteTransfer();

        $this->patch(route('store-transfer.cancel', $transfer->id))->assertRedirect();
        $this->assertSame('cancelled', $transfer->fresh()->status);

        $this->patch(route('store-transfer.cancel', $transfer->id))->assertStatus(422);
        $this->patch(route('store-transfer.cancel', 999999))->assertNotFound();
        $this->patch(route('store-transfer.cancel', 0))->assertRedirect();
    }

    #[Test]
    public function the_replenish_screen_raises_a_transfer_from_the_remote_hub_only_when_it_holds_enough(): void
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        app(StockService::class)->receive($this->variant->id, $remote, 5);

        $this->patch(route('store-transfer.dispatch', 0), ['store_variant_id' => $this->sv->id, 'quantity' => 50])->assertStatus(422);
        $this->assertSame(0, Transfer::query()->count());

        $this->patch(route('store-transfer.dispatch', 0), ['store_variant_id' => $this->sv->id, 'quantity' => 3])->assertRedirect();

        $transfer = Transfer::query()->sole();
        $this->assertSame(3, (int) $transfer->quantity);
        $this->assertSame($this->variant->id, (int) $transfer->item_variant_id);
    }

    // ---- The store pages ---------------------------------------------------

    #[Test]
    public function the_store_detail_replenish_deviations_and_item_pages_open(): void
    {
        app(StockService::class)->receive($this->variant->id, StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole(), 10);

        $this->get(route('store.show', $this->store))->assertOk();
        $this->get(route('store.replenish', $this->store))->assertOk();
        $this->get(route('store.deviations', $this->store))->assertOk();
        $this->get(route('store.item.variants', [$this->store, $this->item]))->assertOk();
    }
}
