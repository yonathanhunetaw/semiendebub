<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CartService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Buying a big pack and topping it up with smaller ones.
 *
 * The seller item sheet has always shown this: choose a Carton at 9.51 holding
 * 240 pieces in 20 boxes, and the nested rows read "+ Boxes 0.48 ea." and
 * "+ Pieces 0.04 ea." — the carton's own rate, not the standalone box or piece
 * price. The storefront now offers the same thing, and the rate is derived on
 * the server so a crafted request cannot name its own price.
 */
class StorefrontPackPricingTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    /** @var array<string, ItemVariant> */
    private array $variants = [];

    /**
     * One colour and one size across all three packs.
     *
     * The variant factory picks a fresh colour and size per variant, which would
     * make the Piece, Box and Carton rows three unrelated products — and a box
     * only counts as a sub-unit of a carton when it is the same thing in a
     * different wrapper.
     */
    private ItemColor $color;

    private ItemSize $size;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        config(['storefront.store_id' => $this->store->id]);

        $this->color = ItemColor::factory()->create(['name' => 'Gray']);
        $this->size = ItemSize::factory()->create(['name' => '4x4Inch']);

        // Carts key on the session id for a guest, and the test client issues a
        // fresh session per request; a signed-in shopper keys on user_id, which
        // is what lets these assertions span more than one request.
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $category = ItemCategory::factory()->create(['category_name' => 'Stationery']);
        $this->item = Item::factory()->create([
            'product_name' => 'Noteit',
            'status' => 'active',
            'item_category_id' => $category->id,
        ]);

        // One product, three packs of the same thing: a piece, a box of 12, and
        // a carton of 240 (which is 20 boxes).
        $this->pack('Piece', pieces: 1, price: 34.50);
        $this->pack('Box', pieces: 12, price: 9.31);
        $this->pack('Cartoon', pieces: 240, price: 9.51);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function pack(string $packaging, int $pieces, float $price): void
    {
        $type = ItemPackagingType::factory()->create(['name' => $packaging]);

        $variant = ItemVariant::factory()->create([
            'item_id' => $this->item->id,
            'item_packaging_type_id' => $type->id,
            'item_color_id' => $this->color->id,
            'item_size_id' => $this->size->id,
        ]);

        // calculateTotalPieces() reads the packaging pivot, which is what both
        // the card and the prorating rely on.
        $variant->packagingQuantities()->attach($type->id, ['quantity' => $pieces]);

        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'item_id' => $this->item->id,
            'active' => true,
            'pricing_matrix' => [
                'price' => $price,
                'discount_price' => null,
                'discount_ends_at' => null,
            ],
        ]);

        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $variant->id,
                'location_type' => Store::class,
                'location_id' => $this->store->id,
            ],
            ['quantity' => 500, 'min_stock_level' => 0],
        );

        $this->variants[$packaging] = $variant;
    }

    private function carts(): CartService
    {
        return app(CartService::class);
    }

    private function cartLine(): ?object
    {
        $cart = Cart::query()->latest('id')->first();

        return $cart?->variants()->first()?->pivot;
    }

    /* =====================================================================
     | The rate itself
     |====================================================================*/

    #[Test]
    public function a_sub_unit_is_priced_from_the_pack_it_sits_under(): void
    {
        $rates = $this->carts()->proratedSubUnitPrices($this->variants['Cartoon'], 9.51);

        // Exactly the figures the seller sheet shows for this pack.
        $this->assertSame(240, $rates['pieces_per_unit']);
        $this->assertSame(12, $rates['box_units']);
        $this->assertEqualsWithDelta(9.51 / 240, $rates['per_piece'], 0.0001);
        $this->assertEqualsWithDelta(9.51 / 20, $rates['per_box'], 0.0001);
    }

    #[Test]
    public function a_box_is_worth_exactly_its_pieces_at_the_same_rate(): void
    {
        $rates = $this->carts()->proratedSubUnitPrices($this->variants['Cartoon'], 9.51);

        // This identity is what lets the cart keep one extras figure: folding
        // boxes into pieces cannot lose or invent money.
        $this->assertEqualsWithDelta(
            $rates['per_box'],
            $rates['per_piece'] * $rates['box_units'],
            0.0001,
            'Prorating must make a box worth its own pieces.'
        );
    }

    #[Test]
    public function a_pack_that_cannot_be_split_offers_no_sub_units(): void
    {
        $rates = $this->carts()->proratedSubUnitPrices($this->variants['Piece'], 34.50);

        // A piece has nothing underneath it, and a box is not smaller than itself.
        $this->assertNull($rates['per_box']);

        $boxRates = $this->carts()->proratedSubUnitPrices($this->variants['Box'], 9.31);
        $this->assertNull($boxRates['per_box']);
        $this->assertEqualsWithDelta(9.31 / 12, $boxRates['per_piece'], 0.0001);
    }

    /* =====================================================================
     | What reaches the cart
     |====================================================================*/

    #[Test]
    public function extras_are_stored_at_the_chosen_packs_rate(): void
    {
        $this->post(route('storefront.cart.items.store'), [
            'variant_id' => $this->variants['Cartoon']->id,
            'quantity' => 1,
            'extra_pieces' => 5,
        ])->assertSessionHasNoErrors();

        $line = $this->cartLine();

        $this->assertSame(5, (int) $line->extra_pieces);
        $this->assertEqualsWithDelta(
            round(9.51 / 240, 2),
            (float) $line->extra_piece_price,
            0.001,
            'A loose piece under a carton costs the carton rate, not the 34.50 piece price.'
        );
    }

    #[Test]
    public function extra_boxes_are_folded_into_pieces_without_changing_the_money(): void
    {
        $this->post(route('storefront.cart.items.store'), [
            'variant_id' => $this->variants['Cartoon']->id,
            'quantity' => 1,
            'extra_boxes' => 2,
        ])->assertSessionHasNoErrors();

        $line = $this->cartLine();

        // 2 boxes of 12 = 24 pieces...
        $this->assertSame(24, (int) $line->extra_pieces);

        // ...and 24 pieces at the prorated rate is 2 boxes at the box rate.
        $perPiece = (float) $line->extra_piece_price;
        $this->assertEqualsWithDelta(
            2 * (9.51 / 20),
            24 * $perPiece,
            0.05,
            'Folding boxes into pieces must bill the same as billing boxes.'
        );
    }

    #[Test]
    public function a_crafted_request_cannot_name_its_own_sub_unit_price(): void
    {
        $this->post(route('storefront.cart.items.store'), [
            'variant_id' => $this->variants['Cartoon']->id,
            'quantity' => 1,
            'extra_pieces' => 10,
            // Not in the rule set, so it must be ignored outright.
            'extra_piece_price' => 0.01,
        ])->assertSessionHasNoErrors();

        $this->assertEqualsWithDelta(
            round(9.51 / 240, 2),
            (float) $this->cartLine()->extra_piece_price,
            0.001,
        );
    }

    #[Test]
    public function extras_top_up_a_line_that_is_already_in_the_cart(): void
    {
        $payload = [
            'variant_id' => $this->variants['Cartoon']->id,
            'quantity' => 1,
            'extra_pieces' => 3,
        ];

        $this->post(route('storefront.cart.items.store'), $payload)->assertSessionHasNoErrors();
        $this->post(route('storefront.cart.items.store'), $payload)->assertSessionHasNoErrors();

        $line = $this->cartLine();

        $this->assertSame(2, (int) $line->quantity);
        $this->assertSame(6, (int) $line->extra_pieces);
    }

    #[Test]
    public function boxes_cannot_be_added_under_a_product_that_is_not_boxed(): void
    {
        $unboxed = Item::factory()->create(['product_name' => 'Loose only', 'status' => 'active']);
        $type = ItemPackagingType::factory()->create(['name' => 'Bundle']);
        $variant = ItemVariant::factory()->create([
            'item_id' => $unboxed->id,
            'item_packaging_type_id' => $type->id,
            'item_color_id' => $this->color->id,
            'item_size_id' => $this->size->id,
        ]);
        $variant->packagingQuantities()->attach($type->id, ['quantity' => 50]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'item_id' => $unboxed->id,
            'active' => true,
            'pricing_matrix' => ['price' => 20.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);
        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $variant->id,
                'location_type' => Store::class,
                'location_id' => $this->store->id,
            ],
            ['quantity' => 100, 'min_stock_level' => 0],
        );

        $this->post(route('storefront.cart.items.store'), [
            'variant_id' => $variant->id,
            'quantity' => 1,
            'extra_boxes' => 2,
        ])->assertSessionHasErrors('extra_boxes');
    }

    /* =====================================================================
     | What the shopper is shown back
     |====================================================================*/

    #[Test]
    public function the_cart_total_includes_what_was_added_underneath(): void
    {
        $this->post(route('storefront.cart.items.store'), [
            'variant_id' => $this->variants['Cartoon']->id,
            'quantity' => 2,
            'extra_pieces' => 10,
        ])->assertSessionHasNoErrors();

        $props = $this->get(route('storefront.index'))->assertOk()->viewData('page')['props'];
        $line = $props['cart']['lines'][0];

        $expected = round(9.51 * 2 + 10 * round(9.51 / 240, 2), 2);

        $this->assertSame(10, $line['extra_pieces']);
        $this->assertEqualsWithDelta($expected, $line['line_total'], 0.01);
        $this->assertEqualsWithDelta($expected, $props['cart']['subtotal'], 0.01);
    }
}
