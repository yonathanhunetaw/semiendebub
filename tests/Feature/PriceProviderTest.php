<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\PriceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The price ladder: store price, then the individual price (walk-ins and TIN
 * customers only), then the seller's, then the customer's own — the last rung
 * that applies is what the customer pays.
 */
class PriceProviderTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private StoreVariant $sv;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create();
        $this->item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        $this->sv = StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $variant->id, 'active' => true,
            'pricing_matrix' => ['price' => 100.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
    }

    private function customer(?string $tin): Customer
    {
        static $n = 0;
        $n++;

        return Customer::query()->create([
            'first_name' => "C{$n}", 'email' => "c{$n}@example.com", 'phone_number' => '09110000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT),
            'tin_number' => $tin, 'created_by' => $this->seller->id,
        ]);
    }

    private function ladder(?int $sellerId = null, ?int $customerId = null): array
    {
        return PriceProvider::getPriceLadder($this->sv->id, $this->store->id, $sellerId, $customerId);
    }

    private function levels(array $ladder): array
    {
        return array_column($ladder, 'level');
    }

    // ---- getPriceLadder ----------------------------------------------------

    #[Test]
    public function a_variant_of_another_store_or_without_a_price_has_no_ladder(): void
    {
        $this->assertSame([], PriceProvider::getPriceLadder($this->sv->id, $this->store->id + 1));

        $this->sv->update(['pricing_matrix' => []]);
        $this->assertSame([], $this->ladder(), 'an empty matrix is unpriced, not free');

        $this->sv->update(['pricing_matrix' => ['discount_price' => 5.0]]);
        $this->assertSame([], $this->ladder(), 'a matrix with no price is unpriced');
    }

    #[Test]
    public function the_store_price_alone_when_nothing_overrides_it(): void
    {
        $ladder = $this->ladder();

        $this->assertSame(['store'], $this->levels($ladder));
        $this->assertSame(100.0, PriceProvider::getFinalPrice($ladder));
    }

    #[Test]
    public function a_list_shaped_store_price_reads_its_first_tier(): void
    {
        $this->sv->update(['pricing_matrix' => [['price' => 80.0], ['price' => 70.0]]]);

        $this->assertSame(80.0, PriceProvider::getFinalPrice($this->ladder()));
    }

    #[Test]
    public function a_running_discount_applies_and_an_expired_one_does_not(): void
    {
        $this->sv->update(['pricing_matrix' => ['price' => 100.0, 'discount_price' => 90.0, 'discount_ends_at' => now()->addDay()->toDateTimeString()]]);
        $this->assertSame(90.0, PriceProvider::getFinalPrice($this->ladder()));

        $this->sv->update(['pricing_matrix' => ['price' => 100.0, 'discount_price' => 90.0, 'discount_ends_at' => now()->subDay()->toDateTimeString()]]);
        $this->assertSame(100.0, PriceProvider::getFinalPrice($this->ladder()));

        $this->sv->update(['pricing_matrix' => ['price' => 100.0, 'discount_price' => 85.0, 'discount_ends_at' => null]]);
        $this->assertSame(85.0, PriceProvider::getFinalPrice($this->ladder()), 'a discount with no end date runs until removed');
    }

    #[Test]
    public function the_individual_price_reaches_walk_ins_and_tin_customers_but_not_businesses(): void
    {
        StoreVariantIndividualPrice::query()->create(['store_variant_id' => $this->sv->id, 'active' => true, 'pricing_matrix' => ['price' => 115.0]]);

        $this->assertSame(['store', 'individual'], $this->levels($this->ladder()));
        $this->assertSame(115.0, PriceProvider::getFinalPrice($this->ladder()));

        $this->assertSame(['store', 'individual'], $this->levels($this->ladder(customerId: $this->customer('0012345678')->id)));
        $this->assertSame(['store'], $this->levels($this->ladder(customerId: $this->customer(null)->id)));
    }

    #[Test]
    public function an_inactive_override_is_ignored(): void
    {
        StoreVariantIndividualPrice::query()->create(['store_variant_id' => $this->sv->id, 'active' => false, 'pricing_matrix' => ['price' => 115.0]]);
        StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $this->seller->id, 'active' => false, 'pricing_matrix' => ['price' => 95.0]]);

        $this->assertSame(['store'], $this->levels($this->ladder($this->seller->id)));
    }

    #[Test]
    public function the_seller_tier_matching_the_customer_type_applies(): void
    {
        StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $this->seller->id, 'active' => true,
            'pricing_matrix' => ['business' => ['price' => 95.0], 'individual' => ['price' => 110.0]],
        ]);

        $this->assertSame(110.0, PriceProvider::getFinalPrice($this->ladder($this->seller->id)), 'walk-in → individual tier');
        $this->assertSame(95.0, PriceProvider::getFinalPrice($this->ladder($this->seller->id, $this->customer(null)->id)), 'business → business tier');

        $other = User::factory()->create(['role' => 'seller']);
        $this->assertSame(['store'], $this->levels($this->ladder($other->id)), 'another seller gets no seller rung');
    }

    #[Test]
    public function a_seller_price_with_only_one_tier_does_not_apply_to_the_other_type(): void
    {
        StoreVariantSellerPrice::query()->create([
            'store_variant_id' => $this->sv->id, 'seller_id' => $this->seller->id, 'active' => true,
            'pricing_matrix' => ['business' => ['price' => 95.0]],
        ]);

        $this->assertSame(['store'], $this->levels($this->ladder($this->seller->id)));
    }

    #[Test]
    public function a_flat_legacy_seller_price_applies_to_everyone(): void
    {
        StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $this->seller->id, 'active' => true, 'pricing_matrix' => ['price' => 92.0]]);

        $this->assertSame(92.0, PriceProvider::getFinalPrice($this->ladder($this->seller->id)));
        $this->assertSame(92.0, PriceProvider::getFinalPrice($this->ladder($this->seller->id, $this->customer(null)->id)));
    }

    #[Test]
    public function the_customers_own_price_is_the_last_word(): void
    {
        $customer = $this->customer(null);
        StoreVariantSellerPrice::query()->create(['store_variant_id' => $this->sv->id, 'seller_id' => $this->seller->id, 'active' => true, 'pricing_matrix' => ['price' => 92.0]]);
        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $this->sv->id, 'customer_id' => $customer->id, 'pricing_matrix' => ['price' => 88.0]]);

        $ladder = $this->ladder($this->seller->id, $customer->id);

        $this->assertSame(['store', 'seller', 'customer'], $this->levels($ladder));
        $this->assertSame(88.0, PriceProvider::getFinalPrice($ladder));
    }

    #[Test]
    public function an_unpriced_variant_cannot_go_into_a_cart_for_nothing(): void
    {
        $this->sv->update(['pricing_matrix' => []]);
        $cart = \App\Models\Seller\Cart::query()->create(['store_id' => $this->store->id, 'seller_id' => $this->seller->id, 'user_id' => $this->seller->id]);

        $this->expectExceptionMessage('That variant has no price configured in this store.');
        app(\App\Services\CartService::class)->resolveLinePrice($cart, $this->sv->itemVariant);
    }

    #[Test]
    public function loose_pieces_are_not_sold_when_the_piece_variant_has_no_price_here(): void
    {
        $carton = \App\Models\Item\ItemPackagingType::factory()->create(['name' => 'Carton']);
        $piece = \App\Models\Item\ItemPackagingType::factory()->create(['name' => 'Piece']);
        $pack = $this->sv->itemVariant;
        $pack->update(['item_packaging_type_id' => $carton->id]);
        $pieceVariant = ItemVariant::factory()->create([
            'item_id' => $this->item->id, 'item_color_id' => $pack->item_color_id, 'item_size_id' => $pack->item_size_id, 'item_packaging_type_id' => $piece->id,
        ]);
        $cart = \App\Models\Seller\Cart::query()->create(['store_id' => $this->store->id, 'seller_id' => $this->seller->id, 'user_id' => $this->seller->id]);
        $cartService = app(\App\Services\CartService::class);

        // Not listed in this store at all.
        $this->assertNull($cartService->resolveExtraPiecePrice($cart, $pack->fresh()));

        // Listed, but unpriced.
        $pieceSv = StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $pieceVariant->id, 'active' => true, 'pricing_matrix' => []]);
        $this->assertNull($cartService->resolveExtraPiecePrice($cart, $pack->fresh()));

        // Priced: that is the loose-piece price.
        $pieceSv->update(['pricing_matrix' => ['price' => 1.5]]);
        $this->assertSame(1.5, $cartService->resolveExtraPiecePrice($cart, $pack->fresh()));
    }

    // ---- getFinalPrice -----------------------------------------------------

    #[Test]
    public function the_final_price_reads_the_last_rung_in_any_shape(): void
    {
        $this->assertNull(PriceProvider::getFinalPrice([]));
        $this->assertSame(42.0, PriceProvider::getFinalPrice([10, '42']));
        $this->assertSame(7.0, PriceProvider::getFinalPrice([['price' => 7]]), 'price when there is no final');
        $this->assertNull(PriceProvider::getFinalPrice(['oops']));
        $this->assertSame(0.0, PriceProvider::getFinalPriceWithTax([], 'business'));
    }

    // ---- getItemPriceRange -------------------------------------------------

    #[Test]
    public function an_item_with_no_priced_variant_in_the_store_shows_zero(): void
    {
        $this->sv->update(['active' => false]);

        $range = PriceProvider::getItemPriceRange($this->item->fresh('variants.storeVariants'), $this->store->id);

        $this->assertSame(0, $range['final_price']);
        $this->assertSame('individual', $range['customer_type']);
    }

    #[Test]
    public function the_item_shows_its_cheapest_variant_with_the_tier_its_customer_sees(): void
    {
        $dear = ItemVariant::factory()->create(['item_id' => $this->item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $this->item->id, 'item_variant_id' => $dear->id, 'active' => true,
            'pricing_matrix' => ['price' => 300.0],
        ]);
        StoreVariantIndividualPrice::query()->create(['store_variant_id' => $this->sv->id, 'active' => true, 'pricing_matrix' => ['price' => 115.0, 'discount_ends_at' => '2026-12-31']]);
        $item = $this->item->fresh('variants.storeVariants');

        $walkIn = PriceProvider::getItemPriceRange($item, $this->store->id);
        $this->assertSame(115.0, $walkIn['store_price'], 'walk-ins see the individual price');
        $this->assertSame(115.0, $walkIn['final_price']);
        $this->assertSame('2026-12-31', $walkIn['discount_ends_at']);

        $business = PriceProvider::getItemPriceRange($item, $this->store->id, null, $this->customer(null));
        $this->assertSame('business', $business['customer_type']);
        $this->assertSame(100.0, $business['store_price']);
        $this->assertSame(100.0, $business['final_price']);
        $this->assertSame(['store'], $this->levels($business['pricing_matrix']));

        $tin = PriceProvider::getItemPriceRange($item, $this->store->id, null, $this->customer('0012345678'));
        $this->assertSame('individual', $tin['customer_type']);
    }
}
