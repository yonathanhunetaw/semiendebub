<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StocktakeLine;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Item\ItemDeployer;
use App\Services\Item\ItemWriter;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/**
 * One item or store cannot reach another's records through the setup page, repeating a save is harmless, and the
 * page survives the odd shapes real data has.
 */
class ItemSetupScopingTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private Item $other;

    private ItemVariant $otherVariant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpSetupItem();
        Storage::fake('r2');
        $this->actingAs($this->admin);

        $this->other = Item::factory()->create(['product_name' => 'Other', 'general_images' => ['uploads/items/theirs.jpg']]);
        $this->otherVariant = ItemVariant::factory()->create(['item_id' => $this->other->id, 'barcode' => 'THEIRS-1', 'images' => ['uploads/variants/theirs/1.jpg']]);
    }

    // ---- one item's variant is not another's -------------------------------------------------------------

    #[Test]
    public function another_items_variant_cannot_be_given_a_barcode_or_pictures_or_deleted_through_this_item(): void
    {
        $this->post(route('admin.items.setup.barcode.generate', [$this->item, $this->otherVariant]))->assertNotFound();
        $this->post(route('admin.items.setup.image', [$this->item, $this->otherVariant, 0]), ['image' => UploadedFile::fake()->image('a.jpg')])->assertNotFound();
        $this->delete(route('admin.items.setup.image.destroy', [$this->item, $this->otherVariant, 0]))->assertNotFound();
        $this->delete(route('admin.items.variants.destroy', [$this->item, $this->otherVariant]))->assertNotFound();

        $fresh = $this->otherVariant->fresh();
        $this->assertSame('THEIRS-1', $fresh->barcode);
        $this->assertSame(['uploads/variants/theirs/1.jpg'], $fresh->images);
    }

    #[Test]
    public function a_barcode_save_naming_another_items_variant_is_refused_whole(): void
    {
        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$this->variant->id => 'MINE-0001', $this->otherVariant->id => 'HIJACK-1']])
            ->assertSessionHasErrors("barcodes.{$this->otherVariant->id}");

        $this->assertSame('6001234567890', $this->variant->fresh()->barcode, 'the valid line was not saved either');
        $this->assertSame('THEIRS-1', $this->otherVariant->fresh()->barcode);
    }

    #[Test]
    public function a_deleted_variant_cannot_be_targeted_and_deleting_twice_is_not_found(): void
    {
        $this->delete(route('admin.items.variants.destroy', [$this->item, $this->variant]))->assertRedirect();
        $this->delete(route('admin.items.variants.destroy', [$this->item, $this->variant]))->assertNotFound();
        $this->post(route('admin.items.setup.barcode.generate', [$this->item, $this->variant]))->assertNotFound();
    }

    #[Test]
    public function a_deleted_variants_barcode_can_be_used_again(): void
    {
        $second = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => null, 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);
        $this->variant->delete();

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$second->id => '6001234567890']])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame('6001234567890', $second->fresh()->barcode);
    }

    // ---- one store or item's price lines are not another's ---------------------------------------------------------------

    #[Test]
    public function a_price_save_with_one_foreign_line_saves_nothing_at_all(): void
    {
        $mine = $this->deployed(10);
        app(ItemDeployer::class)->deploy($this->other, $this->store);
        $foreign = StoreVariant::query()->where('item_id', $this->other->id)->firstOrFail();
        $foreign->forceFill(['pricing_matrix' => ['price' => 5]])->save();

        $this->put(route('admin.items.setup.prices', [$this->item, $this->store]), [
            'variants' => [['store_variant_id' => $mine->id, 'price' => 99], ['store_variant_id' => $foreign->id, 'price' => 1]],
        ])->assertSessionHasErrors('variants');

        $this->assertSame(10.0, (float) $mine->fresh()->pricing_matrix['price']);
        $this->assertSame(5.0, (float) $foreign->fresh()->pricing_matrix['price']);
    }

    #[Test]
    public function a_line_for_this_item_in_another_store_is_refused(): void
    {
        $this->deployed(10);
        $two = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);
        app(ItemDeployer::class)->deploy($this->item->fresh(), $two);
        $theirs = StoreVariant::query()->where('store_id', $two->id)->firstOrFail();

        $this->put(route('admin.items.setup.prices', [$this->item, $this->store]), ['variants' => [['store_variant_id' => $theirs->id, 'price' => 50]]])
            ->assertSessionHasErrors('variants');

        $this->assertNull(((array) $theirs->fresh()->pricing_matrix)['price']);
    }

    #[Test]
    public function seller_and_customer_price_lines_are_scoped_the_same_way(): void
    {
        $this->deployed();
        app(ItemDeployer::class)->deploy($this->other, $this->store);
        $foreign = StoreVariant::query()->where('item_id', $this->other->id)->firstOrFail();
        $seller = $this->makeUser('seller', $this->store->id);
        $customer = Customer::factory()->create(['store_id' => $this->store->id]);

        $this->put(route('admin.items.setup.seller-prices', [$this->item, $this->store]), ['seller_id' => $seller->id, 'customer_type' => 'business', 'variants' => [['store_variant_id' => $foreign->id, 'price' => 3]]])->assertSessionHasErrors('variants');
        $this->put(route('admin.items.setup.customer-prices', [$this->item, $this->store]), ['customer_id' => $customer->id, 'variants' => [['store_variant_id' => $foreign->id, 'price' => 3]]])->assertSessionHasErrors('variants');

        $this->assertSame(0, StoreVariantSellerPrice::query()->count());
        $this->assertSame(0, StoreVariantCustomerPrice::query()->count());
    }

    #[Test]
    public function removing_prices_that_are_not_there_is_a_quiet_success_and_touches_nothing_else(): void
    {
        $row = $this->deployed();
        $seller = $this->makeUser('seller', $this->store->id);
        $customer = Customer::factory()->create(['store_id' => $this->store->id]);
        $keeps = StoreVariantCustomerPrice::query()->create(['store_variant_id' => $row->id, 'customer_id' => Customer::factory()->create()->id, 'pricing_matrix' => ['price' => 7]]);

        $this->delete(route('admin.items.setup.seller-prices.destroy', [$this->item, $this->store, $seller]), ['customer_type' => 'business'])->assertRedirect()->assertSessionHas('success');
        $this->delete(route('admin.items.setup.customer-prices.destroy', [$this->item, $this->store, $customer]))->assertRedirect()->assertSessionHas('success');

        $this->assertNotNull($keeps->fresh(), "another customer's price stays");
    }

    #[Test]
    public function saving_the_same_prices_twice_leaves_one_individual_price_and_one_matrix(): void
    {
        $row = $this->deployed();
        $body = ['variants' => [['store_variant_id' => $row->id, 'price' => 20, 'individual_price' => 22]]];

        $this->put(route('admin.items.setup.prices', [$this->item, $this->store]), $body)->assertRedirect();
        $this->put(route('admin.items.setup.prices', [$this->item, $this->store]), $body)->assertRedirect();

        $this->assertSame(1, \App\Models\Store\StoreVariantIndividualPrice::query()->count());
        $this->assertSame(1, StoreVariant::query()->count());
        $this->assertSame(20.0, (float) $row->fresh()->pricing_matrix['price']);
    }

    // ---- limits and counts at places that cannot hold them -----------------------------------------------------------------

    #[Test]
    public function limits_cannot_be_set_at_the_in_delivery_place_or_a_store_node(): void
    {
        $transit = StockLocation::factory()->create(['kind' => StockLocation::KIND_TRANSIT, 'is_stockable' => true]);
        $node = $this->place(StockLocation::KIND_STORE);

        foreach ([$transit, $node] as $place) {
            $this->put(route('admin.items.setup.bin', [$this->item, $place]), ['max' => 10, 'refill' => 4, 'critical' => 1])->assertForbidden();
        }
        $this->assertSame(0, ShelfItemBand::query()->count());
    }

    #[Test]
    public function a_count_cannot_be_made_at_the_in_delivery_place_or_a_store_node(): void
    {
        $transit = StockLocation::factory()->create(['kind' => StockLocation::KIND_TRANSIT, 'is_stockable' => true]);
        $node = $this->place(StockLocation::KIND_STORE);

        foreach ([$transit, $node] as $place) {
            $this->post(route('admin.items.setup.count', [$this->item, $place]), ['counts' => [$this->variant->id => 3]])->assertSessionHasErrors('count');
        }
        $this->assertSame(0, Stocktake::query()->count());
    }

    #[Test]
    public function a_count_not_yet_submitted_cannot_be_approved_and_nothing_is_booked(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->floor(), 10);
        $take = Stocktake::query()->create(['reference' => 'ST-OPEN', 'stock_location_id' => $this->floor()->id, 'status' => Stocktake::COUNTING, 'started_by' => $this->admin->id]);
        StocktakeLine::query()->create(['stocktake_id' => $take->id, 'item_variant_id' => $this->variant->id, 'expected' => 10, 'counted' => 4]);

        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertSessionHasErrors('count');

        $this->assertSame(Stocktake::COUNTING, $take->fresh()->status);
        $this->assertSame(10, (int) ItemStock::query()->where('stock_location_id', $this->floor()->id)->value('quantity'));
    }

    #[Test]
    public function a_count_that_only_holds_another_item_is_not_approved_or_voided_from_this_items_page(): void
    {
        app(StockService::class)->receive($this->otherVariant->id, $this->floor(), 10);
        $take = Stocktake::query()->create(['reference' => 'ST-THEIRS', 'stock_location_id' => $this->floor()->id, 'status' => Stocktake::SUBMITTED, 'started_by' => $this->admin->id, 'submitted_by' => $this->admin->id]);
        StocktakeLine::query()->create(['stocktake_id' => $take->id, 'item_variant_id' => $this->otherVariant->id, 'expected' => 10, 'counted' => 1]);

        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertSessionHasErrors('count');
        $this->post(route('admin.items.setup.count.void', [$this->item, $take]))->assertSessionHasErrors('count');

        $this->assertSame(Stocktake::SUBMITTED, $take->fresh()->status);
        $this->assertSame(10, (int) ItemStock::query()->where('item_variant_id', $this->otherVariant->id)->value('quantity'));
    }

    #[Test]
    public function a_posted_count_cannot_be_approved_or_voided_again(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->floor(), 10);
        $this->post(route('admin.items.setup.count', [$this->item, $this->floor()]), ['counts' => [$this->variant->id => 7]])->assertRedirect();
        $take = Stocktake::query()->sole();
        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertRedirect()->assertSessionHas('success');

        $this->post(route('admin.items.setup.count.approve', [$this->item, $take]))->assertSessionHasErrors('count');
        $this->post(route('admin.items.setup.count.void', [$this->item, $take]))->assertSessionHasErrors('count');
        $this->assertSame(7, (int) ItemStock::query()->where('stock_location_id', $this->floor()->id)->value('quantity'), 'booked once');
        $this->assertSame(1, DB::table('inventory_movements')->where('reason', 'like', 'Stocktake %')->count());
    }

    // ---- pictures ------------------------------------------------------------------------------------------------------------

    #[Test]
    public function another_items_picture_cannot_be_removed_through_this_item(): void
    {
        $this->delete(route('admin.items.setup.pictures.destroy', $this->item), ['path' => 'uploads/items/theirs.jpg'])->assertNotFound();

        $this->assertSame(['uploads/items/theirs.jpg'], $this->other->fresh()->general_images);
        $this->assertSame(['uploads/items/pencil.jpg'], $this->item->fresh()->general_images);
    }

    // ---- the page survives odd data ----------------------------------------------------------------------------------------------

    #[Test]
    public function the_page_opens_for_an_item_with_no_variants_no_category_and_no_pictures(): void
    {
        $bare = Item::factory()->create(['product_name' => 'Bare', 'item_category_id' => null, 'general_images' => null]);

        $this->get(route('admin.items.setup', $bare))->assertOk()->assertInertia(fn ($page) => $page
            ->component('Admin/Items/Setup')->where('item.variants', [])->where('item.basics.item_category_id', null)->where('item.basics.pictures', []));
    }

    #[Test]
    public function the_page_opens_for_a_store_with_no_shelf_floor_or_remote_hub(): void
    {
        $this->deployed();
        StockLocation::query()->where('store_id', $this->store->id)->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])->delete();

        $this->get(route('admin.items.setup', $this->item))->assertOk()
            ->assertInertia(fn ($page) => $page->where('stores.0.places', [])->has('stores.0.route'));
    }

    #[Test]
    public function the_page_opens_when_a_variants_images_are_strange(): void
    {
        $this->variant->forceFill(['images' => [null, 'uploads/v/2.jpg', null, null, null, 'extra-sixth.jpg']])->save();

        $this->get(route('admin.items.setup', $this->item))->assertOk()->assertInertia(fn ($page) => $page->has('item.variants.0.slots', 5));
    }

    #[Test]
    public function the_page_opens_for_a_deleted_variants_item_and_for_an_archived_one(): void
    {
        $second = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => 'X-2', 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);
        $second->delete();
        $this->item->forceFill(['status' => 'archived'])->save();

        $this->get(route('admin.items.setup', $this->item))->assertOk()->assertInertia(fn ($page) => $page->has('item.variants', 1)->where('item.basics.status', 'archived'));
    }

    #[Test]
    public function the_page_is_not_found_for_a_deleted_item(): void
    {
        $this->delete(route('admin.items.destroy', $this->item))->assertRedirect();

        $this->get(route('admin.items.setup', $this->item->id))->assertNotFound();
    }

    #[Test]
    public function the_page_carries_exactly_the_props_the_screen_reloads_and_reads(): void
    {
        $this->deployed();

        $this->get(route('admin.items.setup', $this->item))->assertInertia(fn ($page) => $page
            // the names in RELOAD (VariantsPart.tsx) and the ItemSetupProps type must all exist
            ->has('item')->has('options')->has('catalog')->has('readiness')->has('stores')->has('warehouses')->has('stock')->has('history')
            ->has('item.basics', fn ($b) => $b->hasAll(['product_name', 'product_description', 'packaging_details', 'item_category_id', 'status', 'pictures']))
            ->has('catalog', fn ($c) => $c->hasAll(['categories', 'colors', 'sizes', 'packaging']))
            ->has('stores.0', fn ($s) => $s->hasAll(['id', 'name', 'deployed', 'readiness', 'lines', 'seller_prices', 'customer_prices', 'sellers', 'prices_url', 'places', 'route', 'count_url']))
            ->has('stores.0.lines.0', fn ($l) => $l->hasAll(['store_variant_id', 'variant', 'sku', 'active', 'on_sale', 'forced_off', 'business_pool', 'price', 'discount_price', 'discount_ends_at', 'individual_price']))
            ->has('stores.0.places.0', fn ($p) => $p->hasAll(['location_id', 'name', 'kind', 'can_edit', 'managers', 'pieces', 'band', 'count']))
            ->has('stores.0.places.0.count', fn ($c) => $c->hasAll(['lines', 'open']))
            ->has('stores.0.route', fn ($r) => $r->hasAll(['sources', 'set', 'can_edit', 'managers', 'available']))
            ->has('history', fn ($h) => $h->hasAll(['transfers', 'shipments', 'movements', 'sales'])));
    }

    #[Test]
    public function the_pages_queries_do_not_grow_with_the_number_of_variants(): void
    {
        $this->deployed();
        $two = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);
        app(ItemDeployer::class)->deploy($this->item->fresh(), $two);

        $queries = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->get(route('admin.items.setup', $this->item))->assertOk();
            $count = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $count;
        };

        $one = $queries();
        foreach (range(1, 8) as $n) {
            ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => "BC-{$n}", 'item_packaging_type_id' => ItemPackagingType::factory()->create()->id]);
        }
        app(ItemDeployer::class)->deploy($this->item->fresh(), $this->store);
        app(ItemDeployer::class)->deploy($this->item->fresh(), $two);
        $nine = $queries();

        // Eight more variants in two stores: a per-variant or per-place loop would add well over a hundred.
        $this->assertLessThan(20, $nine - $one, "1 variant: {$one} queries, 9 variants: {$nine}");
        $this->assertLessThan(150, $nine, "the setup page ran {$nine} queries");
    }

    // ---- barcodes at scale ------------------------------------------------------------------------------------------------------------

    #[Test]
    public function thirty_generated_barcodes_are_all_distinct_valid_ean13s(): void
    {
        $writer = app(ItemWriter::class);
        $codes = [];
        foreach (range(1, 30) as $n) {
            $variant = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => null, 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);
            $codes[] = $writer->generateBarcode($variant);
        }

        $this->assertCount(30, array_unique($codes));
        foreach ($codes as $code) {
            $this->assertMatchesRegularExpression('/^2\d{12}$/', $code);
            $this->assertSame((int) $code[12], $writer->checkDigit(substr($code, 0, 12)));
        }
    }

    #[Test]
    public function a_generated_barcode_never_collides_with_one_somebody_typed(): void
    {
        $writer = app(ItemWriter::class);
        $variant = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => null, 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);
        $first = $writer->generateBarcode($variant);
        $variant->update(['barcode' => null]);
        ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => $first, 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);

        $again = $writer->generateBarcode($variant->fresh());

        $this->assertNotSame($first, $again);
        $this->assertSame(1, ItemVariant::query()->where('barcode', $again)->count());
    }

    // ---- options at scale ------------------------------------------------------------------------------------------------------------------

    #[Test]
    public function four_colours_three_sizes_two_packagings_make_twenty_four_variants_and_fewer_options_remove_the_rest(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $all = ['color_ids' => ['A', 'B', 'C', 'D'], 'size_ids' => ['S', 'M', 'L'], 'packaging' => [['item_packaging_type_id' => 'new:Piece', 'quantity' => 1], ['item_packaging_type_id' => 'new:Box', 'quantity' => 12]]];

        $this->postJson(route('admin.items.setup.options.preview', $item), $all)->assertOk()->assertJson(['add' => 24, 'keep' => 0, 'remove' => 0]);
        $this->put(route('admin.items.setup.options', $item), $all)->assertRedirect();
        $this->assertSame(24, ItemVariant::query()->where('item_id', $item->id)->count());

        $fewer = ['color_ids' => ['A', 'B'], 'size_ids' => ['S', 'M', 'L'], 'packaging' => $all['packaging']];
        $this->postJson(route('admin.items.setup.options.preview', $item), $fewer)->assertJson(['add' => 0, 'keep' => 12, 'remove' => 12]);
        $this->put(route('admin.items.setup.options', $item), $fewer)->assertRedirect();
        $this->assertSame(12, ItemVariant::query()->where('item_id', $item->id)->count());
        $this->assertSame(24, ItemVariant::withTrashed()->where('item_id', $item->id)->count(), 'removed ones are kept for history');
    }

    #[Test]
    public function applying_the_same_options_twice_changes_nothing_the_second_time(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $body = ['color_ids' => ['A', 'B'], 'size_ids' => [], 'packaging' => [['item_packaging_type_id' => 'new:Piece', 'quantity' => 1]]];
        $this->put(route('admin.items.setup.options', $item), $body)->assertRedirect();
        $ids = ItemVariant::query()->where('item_id', $item->id)->orderBy('id')->pluck('id')->all();

        $this->postJson(route('admin.items.setup.options.preview', $item), $body)->assertJson(['add' => 0, 'restore' => 0, 'remove' => 0, 'keep' => 2]);
        $this->put(route('admin.items.setup.options', $item), $body)->assertRedirect();

        $this->assertSame($ids, ItemVariant::query()->where('item_id', $item->id)->orderBy('id')->pluck('id')->all());
    }

    #[Test]
    public function no_options_at_all_leave_one_plain_variant(): void
    {
        $item = Item::factory()->create(['status' => 'active']);

        $this->put(route('admin.items.setup.options', $item), ['color_ids' => [], 'size_ids' => [], 'packaging' => []])->assertRedirect();

        $variants = ItemVariant::query()->where('item_id', $item->id)->get();
        $this->assertCount(1, $variants);
        $this->assertNull($variants->first()->item_color_id);
        $this->assertNull($variants->first()->item_packaging_type_id);
    }
}
