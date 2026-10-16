<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * EnsureStoreRecordInScope for every kind of record a store page acts on: a
 * store admin reaches their own store's variants, prices and transfers, and
 * gets a 404 for another store's — the record is left untouched.
 */
class StoreRecordScopeTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private Store $other;

    private User $storeAdmin;

    private StoreVariant $ownSv;

    private StoreVariant $otherSv;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Own Store', 'type' => Store::TYPE_RETAIL]);
        $this->other = Store::factory()->create(['name' => 'Other Store', 'type' => Store::TYPE_RETAIL]);

        $this->storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->own->id]);
        $this->storeAdmin->assignRole('admin');

        $this->ownSv = $this->variantIn($this->own);
        $this->otherSv = $this->variantIn($this->other);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->storeAdmin->refresh());
    }

    private function variantIn(Store $store): StoreVariant
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        return StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 100.0, 'discount_price' => 90.0, 'discount_ends_at' => null],
        ]);
    }

    private function customerPrice(StoreVariant $sv): StoreVariantCustomerPrice
    {
        static $n = 0;
        $n++;
        $customer = Customer::query()->create([
            'first_name' => "C{$n}", 'email' => "c{$n}@example.com", 'phone_number' => '09110000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT),
            'store_id' => $sv->store_id, 'created_by' => $this->storeAdmin->id,
        ]);

        return StoreVariantCustomerPrice::query()->create(['store_variant_id' => $sv->id, 'customer_id' => $customer->id, 'pricing_matrix' => ['price' => 80.0, 'discount_price' => 70.0]]);
    }

    private function sellerPrice(StoreVariant $sv): StoreVariantSellerPrice
    {
        return StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $sv->id, 'seller_id' => User::factory()->create(['role' => 'seller'])->id, 'active' => true,
            'pricing_matrix' => ['business' => ['price' => 95.0, 'discount_price' => 85.0]],
        ]);
    }

    private function transfer(?Store $from, ?Store $to): Transfer
    {
        return Transfer::query()->create([
            'reference' => 'TRF-'.uniqid(), 'item_variant_id' => $this->ownSv->item_variant_id,
            'from_store_id' => $from?->id, 'to_store_id' => $to?->id,
            'source_location_type' => Store::class, 'source_location_id' => $from?->id ?? 0,
            'destination_location_type' => Store::class, 'destination_location_id' => $to?->id ?? 0,
            'quantity' => 1, 'status' => 'pending', 'origin' => Transfer::ORIGIN_MANUAL, 'approval_state' => Transfer::APPROVAL_NOT_REQUIRED,
        ]);
    }

    #[Test]
    public function a_store_admin_edits_only_their_own_stores_variant_prices(): void
    {
        $this->patch(route('store-variant.update', $this->otherSv), ['price' => 1])->assertNotFound();
        $this->assertEquals(100.0, $this->otherSv->fresh()->pricing_matrix['price']);

        $this->patch(route('store-variant.update', $this->ownSv), ['price' => 120])->assertSuccessful();
        $this->assertEquals(120.0, $this->ownSv->fresh()->pricing_matrix['price']);
    }

    #[Test]
    public function a_store_admin_cannot_add_or_remove_tier_prices_in_another_store(): void
    {
        $this->postJson(route('store-variant.individual-price.upsert', $this->otherSv), ['price' => 1])->assertNotFound();
        $this->deleteJson(route('store-variant.individual-price.destroy', $this->otherSv))->assertNotFound();
        $this->postJson(route('store-variant.seller-price.upsert', $this->otherSv), ['seller_id' => $this->storeAdmin->id, 'customer_type' => 'business', 'price' => 1])->assertNotFound();

        $customerPrice = $this->customerPrice($this->otherSv);
        $sellerPrice = $this->sellerPrice($this->otherSv);
        $this->deleteJson(route('store-variant.customer-price.destroy', $customerPrice))->assertNotFound();
        $this->deleteJson(route('store-variant.seller-price.destroy', $sellerPrice), ['customer_type' => 'business'])->assertNotFound();

        $this->assertModelExists($customerPrice);
        $this->assertModelExists($sellerPrice);
        $this->assertSame(0, StoreVariantIndividualPrice::query()->count());
    }

    #[Test]
    public function a_store_admin_removes_tier_prices_in_their_own_store(): void
    {
        $customerPrice = $this->customerPrice($this->ownSv);
        $sellerPrice = $this->sellerPrice($this->ownSv);

        $this->deleteJson(route('store-variant.customer-price.destroy', $customerPrice))->assertOk();
        $this->deleteJson(route('store-variant.seller-price.destroy', $sellerPrice), ['customer_type' => 'business'])->assertOk();

        $this->assertModelMissing($customerPrice);
        $this->assertModelMissing($sellerPrice);
    }

    #[Test]
    public function discount_overrides_follow_the_record_to_its_store(): void
    {
        $individual = StoreVariantIndividualPrice::query()->create(['store_variant_id' => $this->otherSv->id, 'active' => true, 'pricing_matrix' => ['price' => 115.0, 'discount_price' => 100.0]]);
        $records = [
            'b2b' => $this->otherSv->id,
            'individual' => $individual->id,
            'customer' => $this->customerPrice($this->otherSv)->id,
            'seller' => $this->sellerPrice($this->otherSv)->id,
        ];

        foreach ($records as $source => $id) {
            $this->patch(route('store-price-override.update', ['source' => $source, 'id' => $id]), ['discount_price' => 1])->assertNotFound();
            $this->delete(route('store-price-override.destroy', ['source' => $source, 'id' => $id]))->assertNotFound();
        }

        $this->assertEquals(90.0, $this->otherSv->fresh()->pricing_matrix['discount_price']);
        $this->assertEquals(100.0, $individual->fresh()->pricing_matrix['discount_price']);

        $this->delete(route('store-price-override.destroy', ['source' => 'b2b', 'id' => $this->ownSv->id]))->assertRedirect();
        $this->assertNull($this->ownSv->fresh()->pricing_matrix['discount_price']);
    }

    #[Test]
    public function a_price_record_that_does_not_exist_is_not_found_for_a_store_admin(): void
    {
        $this->delete(route('store-price-override.destroy', ['source' => 'customer', 'id' => 999999]))->assertNotFound();
        $this->delete(route('store-price-override.destroy', ['source' => 'nonsense', 'id' => 1]))->assertNotFound();
    }

    #[Test]
    public function a_transfer_is_reachable_when_either_end_is_the_admins_store(): void
    {
        $foreign = $this->transfer($this->other, $this->other);
        $this->patch(route('store-transfer.cancel', $foreign->id))->assertNotFound();
        $this->assertSame('pending', $foreign->fresh()->status);

        $inbound = $this->transfer($this->other, $this->own);
        $this->patch(route('store-transfer.cancel', $inbound->id))->assertRedirect();
        $this->assertSame('cancelled', $inbound->fresh()->status);

        $this->patch(route('store-transfer.cancel', 999999))->assertNotFound();
    }

    #[Test]
    public function another_stores_pages_are_not_found_for_a_store_admin(): void
    {
        $this->get(route('store.show', $this->other))->assertNotFound();
        $this->get(route('store.deviations', $this->other))->assertNotFound();
        $this->get(route('store.deviations', $this->own))->assertOk();
    }
}
