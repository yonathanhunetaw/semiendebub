<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Items list filters beyond ItemControllerTest: a parent category
 * lists its subcategories' items, a number finds an item by id, and the list
 * sorts by variant counts.
 */
class ItemCatalogueFiltersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    private function names(array $query): array
    {
        $names = [];
        $this->get(route('admin.items.index', $query))->assertOk()
            ->assertInertia(function ($page) use (&$names) {
                $names = array_column($page->toArray()['props']['items']['data'], 'product_name');
            });

        return $names;
    }

    private function itemWithVariants(string $name, int $variants, int $live = 0, ?ItemCategory $category = null): Item
    {
        $item = Item::factory()->create(['product_name' => $name, 'status' => 'active', 'item_category_id' => $category?->id ?? ItemCategory::factory()->create()->id]);
        $store = Store::query()->first() ?? Store::factory()->create();

        foreach (range(1, $variants) as $n) {
            $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'status' => 'active']);
            if ($n <= $live) {
                StoreVariant::factory()->create(['store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true]);
            }
        }

        return $item;
    }

    #[Test]
    public function a_parent_category_lists_its_subcategories_items_too(): void
    {
        $tools = ItemCategory::factory()->create(['category_name' => 'Tools', 'parent_id' => null]);
        $hammers = ItemCategory::factory()->create(['category_name' => 'Hammers', 'parent_id' => $tools->id]);
        $paint = ItemCategory::factory()->create(['category_name' => 'Paint', 'parent_id' => null]);

        $this->itemWithVariants('Spanner', 1, category: $tools);
        $this->itemWithVariants('Claw Hammer', 1, category: $hammers);
        $this->itemWithVariants('Emulsion', 1, category: $paint);

        $this->assertSame(['Claw Hammer', 'Spanner'], $this->names(['category' => $tools->id]));
        $this->assertSame(['Claw Hammer'], $this->names(['category' => $hammers->id]));
    }

    #[Test]
    public function a_number_finds_an_item_by_its_id(): void
    {
        $this->itemWithVariants('Alpha', 1);
        $target = $this->itemWithVariants('Bravo', 1);

        $this->assertContains('Bravo', $this->names(['q' => (string) $target->id]));
    }

    #[Test]
    public function the_list_sorts_by_variant_and_live_variant_counts(): void
    {
        $this->itemWithVariants('One', 1, 1);
        $this->itemWithVariants('Three', 3, 0);
        $this->itemWithVariants('Two', 2, 2);

        $this->assertSame(['Three', 'Two', 'One'], $this->names(['sort' => 'variants', 'direction' => 'desc']));
        $this->assertSame(['Two', 'One', 'Three'], $this->names(['sort' => 'live', 'direction' => 'desc']));
        $this->assertSame(['One', 'Three', 'Two'], $this->names(['sort' => 'created', 'direction' => 'asc']));
    }
}
