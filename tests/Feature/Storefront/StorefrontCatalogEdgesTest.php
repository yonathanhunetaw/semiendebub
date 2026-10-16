<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StorefrontCatalogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * StorefrontCatalogService edges: an unpriced variant shows no price (never
 * 0.00), a variant the store does not carry is left off the product page, and
 * an item without photos of its own borrows its variants'.
 */
class StorefrontCatalogEdgesTest extends TestCase
{
    use RefreshDatabase;

    private StorefrontCatalogService $catalog;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->catalog = app(StorefrontCatalogService::class);
        $this->store = Store::factory()->create(['status' => 'active']);
        config(['storefront.store_id' => $this->store->id, 'filesystems.disks.r2.url' => 'https://cdn.duka.test']);
    }

    #[Test]
    public function an_unpriced_variant_shows_no_price_rather_than_zero(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $sv = StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'pricing_matrix' => []]);

        $this->assertSame(
            ['price' => null, 'final_price' => null, 'discount_ends_at' => null, 'is_discounted' => false],
            $this->catalog->pricing($sv, $this->store),
        );
    }

    #[Test]
    public function an_item_without_photos_borrows_its_variants_and_a_variant_not_carried_is_left_off(): void
    {
        $item = Item::factory()->create(['status' => 'active', 'general_images' => []]);
        $carried = ItemVariant::factory()->create(['item_id' => $item->id, 'images' => ['uploads/variants/a.jpg']]);
        ItemVariant::factory()->create(['item_id' => $item->id, 'images' => ['uploads/variants/b.jpg']]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $carried->id, 'active' => true,
            'pricing_matrix' => ['price' => 50.0],
        ]);

        $this->get(route('storefront.items.show', $item))->assertOk()
            ->assertInertia(function ($page) use ($carried) {
                $props = $page->toArray()['props'];
                $this->assertContains('https://cdn.duka.test/uploads/variants/a.jpg', $props['item']['images']);
                $this->assertSame([$carried->id], array_column($props['item']['variants'], 'id'));
            });
    }
}
