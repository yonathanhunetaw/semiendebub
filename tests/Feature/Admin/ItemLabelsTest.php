<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\ItemLookup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** QR labels for item variants: the code each label holds is the one every scanner finds. */
class ItemLabelsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');
    }

    #[Test]
    public function each_label_holds_the_barcode_or_else_the_sku_and_the_scanner_finds_it(): void
    {
        $item = Item::factory()->create(['product_name' => 'Thermos flask']);
        $withBarcode = ItemVariant::factory()->create(['item_id' => $item->id, 'barcode' => '6291041500213', 'sku' => 'TF-1']);
        $skuOnly = ItemVariant::factory()->create(['item_id' => $item->id, 'barcode' => null, 'sku' => 'TF-2']);

        $this->actingAs($this->admin)->get(route('admin.items.labels', ['items' => $item->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Items/Labels')
                ->where('items.0.name', 'Thermos flask')
                ->where('items.0.variants.0.code', '6291041500213')
                ->where('items.0.variants.1.code', 'TF-2')
                // "All stores": no one shelf price to print.
                ->where('store', null)
                ->where('items.0.variants.0.price', null));

        $lookup = app(ItemLookup::class);
        $this->assertSame($withBarcode->id, $lookup->findVariant('6291041500213')?->id);
        $this->assertSame($skuOnly->id, $lookup->findVariant('TF-2')?->id);
    }

    #[Test]
    public function with_one_store_chosen_a_label_carries_its_shelf_price(): void
    {
        $store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'sku' => 'GL-1']);
        StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true,
            'pricing_matrix' => ['price' => 120.0, 'discount_price' => null, 'discount_ends_at' => null],
        ]);

        $this->actingAs($this->admin)->get(route('admin.items.labels', ['items' => $item->id, 'store' => $store->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('store.name', 'Main Store')
                ->where('items.0.variants.0.sold_here', true)
                ->where('items.0.variants.0.price', fn ($price) => (float) $price > 0));
    }

    #[Test]
    public function several_items_print_on_one_sheet_in_the_order_chosen_and_nothing_chosen_goes_back(): void
    {
        $a = Item::factory()->create(['product_name' => 'A item']);
        $b = Item::factory()->create(['product_name' => 'B item']);
        ItemVariant::factory()->create(['item_id' => $a->id, 'sku' => 'A-1']);
        ItemVariant::factory()->create(['item_id' => $b->id, 'sku' => 'B-1']);

        $this->actingAs($this->admin)->get(route('admin.items.labels', ['items' => "{$b->id},{$a->id},nope"]))
            ->assertInertia(fn ($page) => $page->has('items', 2)->where('items.0.name', 'B item')->where('items.1.name', 'A item'));

        $this->actingAs($this->admin)->get(route('admin.items.labels'))
            ->assertRedirect(route('admin.items.index'))->assertSessionHas('error');
    }

    #[Test]
    public function a_store_admin_without_the_items_area_cannot_open_it(): void
    {
        $store = Store::factory()->create();
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $store->id]);
        $storeAdmin->assignRole('admin');
        $item = Item::factory()->create();

        $this->actingAs($storeAdmin)->get(route('admin.items.labels', ['items' => $item->id]))->assertForbidden();
    }

    #[Test]
    public function the_sellers_search_finds_an_item_by_a_scanned_barcode_or_sku(): void
    {
        Role::firstOrCreate(['name' => 'seller']);
        $store = Store::factory()->create(['type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $store->id]);
        $seller->assignRole('seller');
        $item = Item::factory()->create(['product_name' => 'Thermos flask', 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'barcode' => '6291041500213', 'sku' => 'TF-1']);
        StoreVariant::factory()->create(['store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true, 'pricing_matrix' => ['price' => 250.0]]);

        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])->actingAs($seller);
        foreach (['6291041500213', 'TF-1', 'thermos'] as $search) {
            $this->get(route('seller.items.search', ['search' => $search]))->assertOk()
                ->assertInertia(fn ($page) => $page->has('items', 1)->where('items.0.id', $item->id));
        }
        $this->get(route('seller.items.search', ['search' => 'TF-']))->assertInertia(fn ($page) => $page->has('items', 0));
    }
}
