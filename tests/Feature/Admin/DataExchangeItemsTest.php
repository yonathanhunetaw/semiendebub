<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** Import / Export for the catalogue: option names, items (and the variants they generate) and barcodes. */
class DataExchangeItemsTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private ItemColor $red;

    private ItemColor $blue;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local'); // the import audit files

        $this->setUpSetupItem();

        $shirts = ItemCategory::query()->create(['category_name' => 'Clothing']);
        ItemCategory::query()->create(['category_name' => 'T-shirts', 'parent_id' => $shirts->id]);
        $this->red = ItemColor::query()->create(['name' => 'ZRed']);
        $this->blue = ItemColor::query()->create(['name' => 'ZBlue']);
        foreach (['ZS', 'ZM'] as $size) {
            ItemSize::query()->create(['name' => $size]);
        }
        ItemPackagingType::query()->create(['name' => 'ZPiece', 'quantity' => 1]);
        ItemPackagingType::query()->create(['name' => 'ZCarton', 'quantity' => 1]);
    }

    private function import(string $dataset, string $csv, bool $dry = false, array $extra = [])
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => $dataset]), ['csv' => $csv, 'dry_run' => $dry] + $extra);
    }

    private function export(string $dataset): string
    {
        return $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => $dataset]))->assertOk()->streamedContent();
    }

    /** @return list<string> the lines of the last preview's errors */
    private function errors($response): array
    {
        return (array) ($response->baseResponse->getSession()->get('import_preview')['errors'] ?? []);
    }

    private function tee(): Item
    {
        $csv = "product_name,category_path,status,colors,sizes,packaging,hs_code\n"
            ."Tee,Clothing > T-shirts,active,ZRed; ZBlue,ZS; ZM,ZPiece:1; ZCarton:12,\n"
            .'Horse,Clothing,draft,,,,0101.21';
        $this->import('items', $csv)->assertSessionHas('success');

        return Item::query()->where('product_name', 'Tee')->firstOrFail();
    }

    #[Test]
    public function option_names_are_added_renamed_by_id_and_never_duplicated(): void
    {
        $this->import('item_colors', "name\nZTeal\nzred")->assertSessionHas('success');
        $this->assertSame(1, ItemColor::query()->where('name', 'ZTeal')->count());
        $this->assertSame(1, ItemColor::query()->whereRaw('lower(name) = ?', ['zred'])->count()); // "red" is Red, not a new colour
        $this->assertSame('ZRed', $this->red->fresh()->name);

        $this->import('item_colors', "id,name\n{$this->red->id},ZCrimson")->assertSessionHas('success');
        $this->assertSame('ZCrimson', $this->red->fresh()->name);

        $response = $this->import('item_colors', "id,name\n{$this->red->id},ZBlue");
        $this->assertStringContainsString("'ZBlue' is already the name of another", implode(' ', $this->errors($response)));
        $this->assertSame('ZCrimson', $this->red->fresh()->name);
    }

    #[Test]
    public function a_new_item_gets_the_whole_matrix_and_the_status_it_asked_for(): void
    {
        $tee = $this->tee();

        $this->assertSame('active', $tee->status);
        $this->assertSame(8, ItemVariant::query()->where('item_id', $tee->id)->count()); // 2 colours × 2 sizes × 2 packaging
        $this->assertSame(['active'], ItemVariant::query()->where('item_id', $tee->id)->pluck('status')->unique()->all());
        $this->assertSame(12, (int) $tee->packagingTypes()->where('name', 'ZCarton')->first()->pivot->quantity);
        $this->assertSame(
            ItemCategory::query()->where('category_name', 'T-shirts')->value('id'),
            $tee->item_category_id,
        );

        $horse = Item::query()->where('product_name', 'Horse')->firstOrFail();
        $this->assertSame('010121', $horse->hs_code); // the leading zero stays
        // Options asked for and none given: an item with no options is one plain variant, as on the setup page.
        $this->assertSame(1, ItemVariant::query()->where('item_id', $horse->id)->count());

        // A file with no option columns makes the item and leaves the variants for the setup page.
        $this->import('items', "product_name,category_path\nBare,Clothing")->assertSessionHas('success');
        $this->assertSame(0, ItemVariant::query()->where('item_id', Item::query()->where('product_name', 'Bare')->value('id'))->count());
    }

    #[Test]
    public function a_download_imports_back_as_a_no_op(): void
    {
        $this->tee();

        $this->import('items', $this->export('items'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['created'] === 0
            && $p['summary']['updated'] === 0 && $p['summary']['unchanged'] === 3);
    }

    #[Test]
    public function the_same_name_without_an_id_is_refused_and_unknown_names_fail_the_whole_file(): void
    {
        $this->tee();

        $dup = $this->import('items', "product_name,category_path\nTee,Clothing > T-shirts");
        $this->assertStringContainsString('put its id on the line to change it', implode(' ', $this->errors($dup)));

        $bad = $this->import('items', "product_name,category_path,colors,packaging\nGood,Clothing,ZRed,\nBad,Nowhere,Nogreen,ZCarton\nWorse,Clothing,,ZCarton:x\nWorst,Clothing,,Zcrate:3");
        $text = implode(' | ', $this->errors($bad));
        $this->assertStringContainsString("unknown category 'Nowhere'", $text);
        $this->assertStringContainsString("unknown colour 'Nogreen'", $text);
        $this->assertStringContainsString("packaging 'ZCarton:x' must look like Carton:12", $text);
        $this->assertStringContainsString("unknown packaging 'Zcrate'", $text);
        $this->assertNull(Item::query()->where('product_name', 'Good')->first(), 'one bad line saves nothing');

        $this->assertStringContainsString('category_path is required for a new item', implode(' ', $this->errors($this->import('items', "product_name\nNo Category"))));
    }

    #[Test]
    public function dropping_an_option_needs_the_tick_and_never_removes_stock(): void
    {
        $tee = $this->tee();
        $shrink = "id,product_name,colors\n{$tee->id},Tee,ZRed";

        $refused = $this->import('items', $shrink);
        $this->assertStringContainsString('would lose 4 variants', implode(' ', $this->errors($refused)));
        $this->assertSame(8, ItemVariant::query()->where('item_id', $tee->id)->count());

        $this->import('items', $shrink, dry: true, extra: ['allow_removals' => true])->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 1
            && str_contains(implode(' ', $p['summary']['warnings']), '4 variants are removed'));

        // A blue variant holds stock: that is never removed, ticked or not.
        $blueVariant = ItemVariant::query()->where('item_id', $tee->id)->where('item_color_id', $this->blue->id)->firstOrFail();
        app(StockService::class)->receive($blueVariant->id, $this->shelf(), 3);
        $held = $this->import('items', $shrink, extra: ['allow_removals' => true]);
        $this->assertStringContainsString('still hold stock', implode(' ', $this->errors($held)));
        $this->assertSame(8, ItemVariant::query()->where('item_id', $tee->id)->count());
    }

    #[Test]
    public function with_the_tick_the_dropped_variants_go_and_a_column_left_out_changes_nothing(): void
    {
        $tee = $this->tee();

        $this->import('items', "id,product_name,colors\n{$tee->id},Tee,ZRed", extra: ['allow_removals' => true])->assertSessionHas('success');
        $this->assertSame(4, ItemVariant::query()->where('item_id', $tee->id)->count());
        $this->assertSame(['ZRed'], $tee->fresh()->colors->pluck('name')->all());
        $this->assertSame(2, $tee->fresh()->sizes->count(), 'sizes were not in the file, so they stay');

        $this->import('items', "id,product_name,status\n{$tee->id},Tee,inactive")->assertSessionHas('success');
        $this->assertSame('inactive', $tee->fresh()->status);
        $this->assertSame(4, ItemVariant::query()->where('item_id', $tee->id)->count());
    }

    #[Test]
    public function barcodes_are_set_cleared_generated_and_checked_like_the_item_page(): void
    {
        $tee = $this->tee();
        [$one, $two, $three] = ItemVariant::query()->where('item_id', $tee->id)->orderBy('id')->take(3)->get()->all();

        $this->import('item_variants', "sku,barcode\n{$one->sku},1111-AAAA\n{$two->sku},AUTO")->assertSessionHas('success');
        $this->assertSame('1111-AAAA', $one->fresh()->barcode);
        $this->assertMatchesRegularExpression('/^2\d{12}$/', (string) $two->fresh()->barcode);

        $this->import('item_variants', "sku,barcode\n{$one->sku},CLEAR\n{$three->sku},")->assertSessionHas('success');
        $this->assertNull($one->fresh()->barcode);
        $this->assertNull($three->fresh()->barcode);

        $this->import('item_variants', "sku,barcode\n{$one->sku},9999-ZZZZ\n{$three->sku},9999-ZZZZ");
        $this->assertNull($one->fresh()->barcode, 'the same code twice in one file saves nothing');

        $usedElsewhere = $this->import('item_variants', "sku,barcode\n{$three->sku},6001234567890"); // the Pencil's code
        $this->assertStringContainsString('already used by another variant', implode(' ', $this->errors($usedElsewhere)));

        $bad = $this->import('item_variants', "sku,barcode\n{$three->sku},ab");
        $this->assertStringContainsString('4 to 32', implode(' ', $this->errors($bad)));
    }

    #[Test]
    public function a_stale_variants_sheet_is_refused_instead_of_coding_the_wrong_variant(): void
    {
        $tee = $this->tee();
        $one = ItemVariant::query()->where('item_id', $tee->id)->where('item_color_id', $this->red->id)->firstOrFail();

        $stale = $this->import('item_variants', "sku,barcode,colour\n{$one->sku},5555-AAAA,ZBlue");
        $this->assertStringContainsString('download the file again', implode(' ', $this->errors($stale)));
        $this->assertNull($one->fresh()->barcode);

        $this->assertStringContainsString("there is no variant with sku 'NOPE'", implode(' ', $this->errors($this->import('item_variants', "sku,barcode\nNOPE,5555-AAAA"))));

        $this->import('item_variants', $this->export('item_variants'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 0 && $p['summary']['created'] === 0);
    }

    #[Test]
    public function deploying_puts_every_missing_variant_in_a_store_switched_off_and_unpriced(): void
    {
        $tee = $this->tee();

        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $this->store->id, 'scope' => 'missing', 'dry_run' => true])
            ->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['created'] === 3 // Pencil HB, Tee, Horse
                && str_contains(implode(' ', $p['summary']['warnings']), '10 store variants'));
        $this->assertSame(0, StoreVariant::query()->where('store_id', $this->store->id)->count());

        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $this->store->id, 'scope' => 'missing'])->assertSessionHas('success');
        $rows = StoreVariant::query()->where('store_id', $this->store->id)->get();
        $this->assertCount(10, $rows);
        $this->assertSame([false], $rows->pluck('active')->map(fn ($a): bool => (bool) $a)->unique()->all());
        $this->assertNull($rows->first()->pricing_matrix['price'] ?? null);

        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $this->store->id, 'scope' => 'missing'])
            ->assertSessionHas('error', fn (string $m): bool => str_contains($m, 'already in'));

        // a file names the items for another store; archived items are left out
        $other = Store::factory()->create(['name' => 'Second Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $other->id, 'scope' => 'file', 'csv' => "item_id\n{$tee->id}"])->assertSessionHas('success');
        $this->assertSame(8, StoreVariant::query()->where('store_id', $other->id)->count());

        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $other->id, 'scope' => 'file', 'csv' => "item_id\n99999"])
            ->assertSessionHas('import_preview', fn (array $p): bool => in_array('Line 2: there is no item 99999', $p['errors'], true));
    }

    #[Test]
    public function only_a_global_admin_can_deploy_from_the_settings_page(): void
    {
        $storeAdmin = $this->makeUser('admin', $this->store->id);

        $this->actingAs($storeAdmin)->post(route('admin.data.deploy'), ['store_id' => $this->store->id, 'scope' => 'missing'])->assertForbidden();
        $this->assertSame(0, StoreVariant::query()->count());
    }

    #[Test]
    public function a_download_larger_than_one_page_lists_every_row_exactly_once(): void
    {
        // The exporters read in pages of 300; an orderBy before lazyById once made the pages overlap and repeat rows.
        // Two items with interleaved ids: ordering by item first and by id second would skip some rows and repeat others.
        $other = Item::factory()->create(['item_category_id' => $this->item->item_category_id]);
        ItemVariant::factory()->count(320)->sequence(['item_id' => $this->item->id], ['item_id' => $other->id])->create();
        $total = ItemVariant::query()->count();

        $rows = array_filter(explode("\n", trim($this->export('item_variants'))));
        $this->assertCount($total + 1, $rows, 'one line per variant, plus the header');

        $skus = array_map(fn (string $line): string => str_getcsv($line)[0], array_slice($rows, 1));
        $this->assertSame(count($skus), count(array_unique($skus)), 'no variant twice');
    }
}
