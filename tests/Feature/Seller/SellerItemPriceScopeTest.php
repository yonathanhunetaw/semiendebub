<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The seller's item page prices by their own open cart. A cart_id from another
 * store, or another seller's id in the query string, must not reveal that
 * customer's negotiated price or that seller's tier.
 */
class SellerItemPriceScopeTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Store $other;

    private User $seller;

    private Item $item;

    private StoreVariant $sv;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Own']);
        $this->other = Store::factory()->create(['name' => 'Other']);
        $this->seller = $this->seller($this->store);

        $this->item = Item::factory()->create(['status' => 'active', 'general_images' => json_encode(['uploads/items/a.jpg', ''])]);
        $variant = ItemVariant::factory()->create(['item_id' => $this->item->id, 'images' => json_encode(['uploads/variants/v1.jpg'])]);
        $this->sv = StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $variant->id, 'active' => true,
            'pricing_matrix' => ['price' => 100.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);
    }

    private function seller(Store $store): User
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $store->id]);
        $seller->assignRole('seller');

        return $seller->refresh();
    }

    private function cartFor(User $seller, Store $store, int $customerPrice): Cart
    {
        static $n = 0;
        $n++;
        $customer = Customer::query()->create([
            'first_name' => "C{$n}", 'email' => "c{$n}@example.com", 'phone_number' => '09110000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT),
            'store_id' => $store->id, 'created_by' => $seller->id,
        ]);
        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $this->sv->id, 'customer_id' => $customer->id, 'pricing_matrix' => ['price' => $customerPrice]]);

        return Cart::query()->create(['store_id' => $store->id, 'seller_id' => $seller->id, 'user_id' => $seller->id, 'customer_id' => $customer->id, 'status' => 'open', 'priority' => 1]);
    }

    private function show(array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->seller)->get(route('seller.items.show', ['item' => $this->item] + $query))->assertOk();
    }

    #[Test]
    public function the_sellers_own_open_cart_prices_the_page(): void
    {
        $this->cartFor($this->seller, $this->store, 88);

        $this->show()->assertInertia(fn (Assert $page) => $page
            ->where('variantData.0.customer_price', 88)
            ->where('variantData.0.final_price', 88));
    }

    #[Test]
    public function a_cart_from_another_store_does_not_reveal_its_customers_price(): void
    {
        $foreign = $this->cartFor($this->seller($this->other), $this->other, 55);

        $this->show(['cart_id' => $foreign->id])->assertInertia(fn (Assert $page) => $page
            ->where('variantData.0.customer_price', null)
            ->where('variantData.0.final_price', 100));
    }

    #[Test]
    public function another_sellers_tier_is_not_shown_to_a_seller_but_an_admin_may_look(): void
    {
        $colleague = $this->seller($this->store);
        StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $colleague->id, 'active' => true, 'pricing_matrix' => ['price' => 77.0]]);

        $this->show(['seller_id' => $colleague->id])->assertInertia(fn (Assert $page) => $page
            ->where('variantData.0.seller_price', null)
            ->where('variantData.0.final_price', 100));

        $admin = User::factory()->create(['role' => 'admin', 'store_id' => $this->store->id]);
        $admin->assignRole('admin');
        $this->show(['seller_id' => $colleague->id], $admin->refresh())->assertInertia(fn (Assert $page) => $page
            ->where('variantData.0.seller_price', 77));
    }

    #[Test]
    public function images_saved_as_json_text_are_read_and_blanks_dropped(): void
    {
        config(['filesystems.disks.r2.url' => 'https://cdn.duka.test']);

        $this->show()->assertInertia(fn (Assert $page) => $page
            ->where('variantData.0.images', ['https://cdn.duka.test/uploads/variants/v1.jpg'])
            ->where('variantData.0.img', 'https://cdn.duka.test/uploads/variants/v1.jpg'));
    }

    #[Test]
    public function the_item_page_does_not_send_other_peoples_details(): void
    {
        $this->seller($this->other); // a seller elsewhere

        $this->show()->assertInertia(fn (Assert $page) => $page->missing('sellers'));
    }

    #[Test]
    public function search_without_a_store_goes_back_to_the_dashboard(): void
    {
        $storeless = User::factory()->create(['role' => 'seller', 'store_id' => null]);
        $storeless->assignRole('seller');

        $this->actingAs($storeless->refresh())->get(route('seller.items.search', ['search' => 'pen']))
            ->assertRedirect(route('seller.dashboard'));
    }
}
