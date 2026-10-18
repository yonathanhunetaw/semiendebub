<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Services\Item\ItemDeployer;
use App\Services\Item\ItemReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The item setup page: the readiness percentage, deploying, prices and shelf limits saved on their
 * own, and who may change what.
 */
class ItemSetupTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Item $item;

    private ItemVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $category = ItemCategory::factory()->create(['category_name' => 'Pencils']);
        $this->item = Item::factory()->create([
            'product_name' => 'Pencil HB', 'item_category_id' => $category->id, 'status' => 'active',
            'general_images' => ['uploads/items/pencil.jpg'], 'description' => '',
        ]);
        $this->variant = ItemVariant::factory()->create([
            'item_id' => $this->item->id, 'barcode' => '6001234567890',
            'item_packaging_type_id' => ItemPackagingType::factory()->create()->id,
        ]);
    }

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $user->assignRole('admin');

        return $user;
    }

    private function readiness(): array
    {
        return app(ItemReadiness::class)->for($this->item->fresh());
    }

    private function check(array $part, string $key): array
    {
        return collect($part['checks'])->firstWhere('key', $key);
    }

    // ---- the score ----------------------------------------------------------

    #[Test]
    public function an_item_sold_nowhere_is_ready_except_for_being_sold(): void
    {
        $r = $this->readiness();

        $this->assertSame(86, $r['item']['percent'], '6 of 7 required checks');
        $this->assertFalse($this->check($r['item'], 'sold')['done']);
        $this->assertSame([], $r['stores']);
    }

    #[Test]
    public function an_optional_check_never_lowers_the_score_and_raises_it_once_done(): void
    {
        $before = $this->readiness()['item']['percent'];
        $this->assertFalse($this->check($this->readiness()['item'], 'description')['done']);

        $this->item->forceFill(['description' => 'A pencil'])->save();

        $this->assertGreaterThan($before, $this->readiness()['item']['percent'], '7 of 8 beats 6 of 7');
        $this->assertSame(88, $this->readiness()['item']['percent']);
    }

    #[Test]
    public function a_missing_barcode_or_picture_is_not_ready(): void
    {
        $this->variant->forceFill(['barcode' => ''])->save();
        $this->item->forceFill(['general_images' => []])->save();
        $r = $this->readiness();

        $this->assertFalse($this->check($r['item'], 'barcode')['done']);
        $this->assertFalse($this->check($r['item'], 'picture')['done']);
    }

    #[Test]
    public function a_store_part_needs_a_real_price_not_zero_and_a_shelf_bin(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $store = $this->readiness()['stores'][$this->store->id];

        $this->assertTrue($this->check($store, 'deployed')['done']);
        $this->assertFalse($this->check($store, 'priced')['done'], 'deploy writes price 0, which is not a price');
        $this->assertFalse($this->check($store, 'bin')['done']);
        $this->assertFalse($this->check($store, 'count')['done']);

        StoreVariant::query()->update(['pricing_matrix' => ['price' => 12.5, 'discount_price' => null, 'discount_ends_at' => null]]);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        ShelfItemBand::query()->create(['stock_location_id' => $shelf->id, 'item_id' => $this->item->id, 'max_units' => 10, 'refill_units' => 4, 'critical_units' => 1]);

        $store = $this->readiness()['stores'][$this->store->id];
        $this->assertTrue($this->check($store, 'priced')['done']);
        $this->assertTrue($this->check($store, 'bin')['done']);
        $this->assertTrue($this->check($this->readiness()['item'], 'sold')['done']);
    }

    #[Test]
    public function deploying_twice_creates_nothing_the_second_time(): void
    {
        $this->assertSame(1, app(ItemDeployer::class)->deploy($this->item, $this->store));
        $this->assertSame(0, app(ItemDeployer::class)->deploy($this->item, $this->store));
        $this->assertSame(1, StoreVariant::query()->count());
    }

    // ---- the page -------------------------------------------------------------

    #[Test]
    public function a_global_admin_opens_the_setup_page(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);

        $this->actingAs($this->admin())->get(route('admin.items.setup', $this->item))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Items/Setup')
                ->where('item.name', 'Pencil HB')
                ->has('readiness.percent')
                ->has('stores', 1)
                ->where('stores.0.deployed', true)
                ->has('history.movements'));
    }

    #[Test]
    public function a_seller_cannot_open_it(): void
    {
        $seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);

        $this->actingAs($seller)->get(route('admin.items.setup', $this->item))->assertForbidden();
    }

    // ---- saving a part on its own ---------------------------------------------

    #[Test]
    public function prices_are_saved_and_keep_the_rest_of_the_matrix(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $row = StoreVariant::query()->sole();
        $row->forceFill(['pricing_matrix' => ['price' => 0, 'discount_price' => null, 'discount_ends_at' => null, 'business' => 9]])->save();

        $this->actingAs($this->admin())->put(route('admin.items.setup.prices', [$this->item, $this->store]), [
            'variants' => [['store_variant_id' => $row->id, 'price' => 20, 'discount_price' => 15, 'discount_ends_at' => '2030-01-01', 'individual_price' => 22]],
        ])->assertRedirect();

        $matrix = $row->fresh()->pricing_matrix;
        $this->assertSame(20.0, (float) $matrix['price']);
        $this->assertSame(15.0, (float) $matrix['discount_price']);
        $this->assertSame(9, $matrix['business'], 'keys the page does not edit are kept');
        $this->assertSame(22.0, (float) StoreVariantIndividualPrice::query()->sole()->pricing_matrix['price']);

        $this->actingAs($this->admin())->put(route('admin.items.setup.prices', [$this->item, $this->store]), [
            'variants' => [['store_variant_id' => $row->id, 'price' => 20, 'discount_price' => null, 'discount_ends_at' => null, 'individual_price' => null]],
        ])->assertRedirect();
        $this->assertSame(0, StoreVariantIndividualPrice::query()->count(), 'a blank individual price removes it');
    }

    #[Test]
    public function a_discount_above_the_price_or_without_an_end_date_is_refused(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $row = StoreVariant::query()->sole();

        $this->actingAs($this->admin())->put(route('admin.items.setup.prices', [$this->item, $this->store]), [
            'variants' => [['store_variant_id' => $row->id, 'price' => 10, 'discount_price' => 12, 'discount_ends_at' => null]],
        ])->assertSessionHasErrors(['variants.0.discount_price', 'variants.0.discount_ends_at']);
    }

    #[Test]
    public function a_price_line_from_another_item_is_refused_and_saves_nothing(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $other = Item::factory()->create(['status' => 'active']);
        $otherVariant = ItemVariant::factory()->create(['item_id' => $other->id]);
        $foreign = StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $other->id, 'item_variant_id' => $otherVariant->id, 'pricing_matrix' => ['price' => 5]]);

        $this->withoutExceptionHandling();
        $this->expectException(\InvalidArgumentException::class);
        $this->actingAs($this->admin())->put(route('admin.items.setup.prices', [$this->item, $this->store]), [
            'variants' => [['store_variant_id' => $foreign->id, 'price' => 1]],
        ]);
    }

    #[Test]
    public function an_admin_sets_and_removes_a_shelf_bin_and_the_score_follows(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $admin = $this->admin();

        $this->actingAs($admin)->put(route('admin.items.setup.bin', [$this->item, $shelf]), ['max' => 20, 'refill' => 8, 'critical' => 2])->assertRedirect();
        $this->assertSame(20, (int) ShelfItemBand::query()->sole()->max_units);
        $this->assertTrue($this->check($this->readiness()['stores'][$this->store->id], 'bin')['done']);

        $this->actingAs($admin)->delete(route('admin.items.setup.bin.destroy', [$this->item, $shelf]))->assertRedirect();
        $this->assertSame(0, ShelfItemBand::query()->count());
    }

    #[Test]
    public function limits_out_of_order_are_refused_with_a_message(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();

        $this->actingAs($this->admin())->put(route('admin.items.setup.bin', [$this->item, $shelf]), ['max' => 5, 'refill' => 9, 'critical' => 2])
            ->assertSessionHasErrors('bin');
        $this->assertSame(0, ShelfItemBand::query()->count());
    }

    #[Test]
    public function someone_who_may_not_edit_the_planogram_is_refused(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);
        $shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $this->store->id]);
        $storeAdmin->assignRole('admin');

        // A store admin who is not a manager of the shelf has no say in its planogram; the global-zone page is refused anyway.
        $this->actingAs($storeAdmin)->put(route('admin.items.setup.bin', [$this->item, $shelf]), ['max' => 20, 'refill' => 8, 'critical' => 2])
            ->assertForbidden();
        $this->assertSame(0, ShelfItemBand::query()->count());
    }
}
