<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * What a seller can see in their catalogue, and why.
 *
 * Two conditions decide it, and only two: the item is `active`, and the store
 * holds an `active` store_variant for one of its variants. Stock is not one of
 * them — a shop that has run out of something still carries it, and the seller
 * needs it on screen to tell a customer when it is back or to build an order
 * ahead of a delivery.
 *
 * It did not work out that way before. Imagery was a gate on the item's status:
 * any variant without two photographs forced the item to `draft`, and draft
 * items are filtered out here, so an unphotographed variant took the whole item
 * out of every seller's catalogue. Deployment compounded it by creating
 * store_variants with `active = false`.
 */
class SellerCatalogueVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $seller;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withServerVariables(['HTTP_HOST' => 'seller.localhost']);

        $this->store = Store::factory()->create();

        $this->seller = User::factory()->create([
            'store_id' => $this->store->id,
            'role' => 'seller',
        ]);

        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'seller']);
        $this->seller->assignRole('seller');

        $this->actingAs($this->seller, 'web');
    }

    /**
     * An item carried by this seller's store.
     *
     * @return array{0: Item, 1: ItemVariant, 2: StoreVariant}
     */
    private function carry(string $name, bool $active = true, string $status = 'active'): array
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => $status]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'active' => $active,
            'pricing_matrix' => ['price' => 50, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        return [$item, $variant, $storeVariant];
    }

    private function stock(ItemVariant $variant, int $quantity): void
    {
        ItemStock::create([
            'item_variant_id' => $variant->id,
            'location_id' => $this->store->id,
            'location_type' => Store::class,
            'quantity' => $quantity,
        ]);
    }

    /** @return array<int, string> */
    private function namesOn(string $route): array
    {
        $names = [];

        $this->get(route($route))->assertInertia(function (Assert $page) use (&$names): void {
            foreach ($page->toArray()['props']['items'] ?? [] as $item) {
                $names[] = $item['product_name'];
            }
        });

        return $names;
    }

    #[Test]
    public function an_active_item_with_no_stock_stays_in_the_dashboard(): void
    {
        [, $variant] = $this->carry('Sold Out Sugar');
        $this->stock($variant, 0);

        $this->assertContains('Sold Out Sugar', $this->namesOn('seller.dashboard'));
    }

    #[Test]
    public function an_active_item_with_no_stock_row_at_all_stays_in_the_dashboard(): void
    {
        // Nothing has ever been received for this variant, so item_stocks has
        // no row for it — distinct from a row reading zero.
        $this->carry('Never Received Rice');

        $this->assertContains('Never Received Rice', $this->namesOn('seller.dashboard'));
    }

    #[Test]
    public function an_out_of_stock_item_reports_zero_rather_than_being_dropped(): void
    {
        [, $variant] = $this->carry('Empty Shelf Oil');
        $this->stock($variant, 0);

        $this->get(route('seller.dashboard'))->assertInertia(
            fn (Assert $page) => $page
                ->has('items', 1)
                ->where('items.0.product_name', 'Empty Shelf Oil')
                // The figure StockCaption renders as "Out of stock".
                ->where('items.0.store_stock', 0),
        );
    }

    #[Test]
    public function search_also_keeps_out_of_stock_items(): void
    {
        // Search is a separate query from the dashboard's, with its own copy of
        // the same filters, so it gets its own assertion.
        [, $variant] = $this->carry('Sold Out Salt');
        $this->stock($variant, 0);

        $this->get(route('seller.items.search', ['search' => 'Sold Out Salt']))
            ->assertInertia(
                fn (Assert $page) => $page
                    ->component('Seller/Items/SearchResults')
                    ->has('items', 1)
                    ->where('items.0.product_name', 'Sold Out Salt'),
            );
    }

    #[Test]
    public function a_draft_item_is_still_hidden(): void
    {
        // Dropping the imagery gate did not make draft mean nothing. An admin
        // who chooses draft is still choosing to keep the item back.
        $this->carry('Work In Progress', status: 'draft');

        $this->assertNotContains('Work In Progress', $this->namesOn('seller.dashboard'));
    }

    #[Test]
    public function a_deactivated_store_variant_is_still_hidden(): void
    {
        // `active` remains the per-store switch; deployment just no longer
        // leaves it off.
        $this->carry('Withdrawn Flour', active: false);

        $this->assertNotContains('Withdrawn Flour', $this->namesOn('seller.dashboard'));
    }

    #[Test]
    public function stocked_and_unstocked_items_appear_together(): void
    {
        [, $stocked] = $this->carry('In Stock Tea');
        $this->stock($stocked, 40);

        [, $empty] = $this->carry('Out Of Stock Coffee');
        $this->stock($empty, 0);

        $names = $this->namesOn('seller.dashboard');

        $this->assertContains('In Stock Tea', $names);
        $this->assertContains('Out Of Stock Coffee', $names);
    }
}
