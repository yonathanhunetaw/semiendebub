<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Inventory\ItemStock;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemPackagingType;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\ShelfMatrix;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** Import / Export: which items a shelf, floor or hub holds, and its max / refill / critical lines. */
class DataExchangeLevelsTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private string $shelfName = 'Main Store · Store Shelf';

    private string $floorName = 'Main Store · Store Floor';

    private Item $second;

    private Item $third;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->setUpSetupItem();

        $piece = ItemPackagingType::query()->create(['name' => 'ZPiece', 'quantity' => 1]);
        $carton = ItemPackagingType::query()->create(['name' => 'ZCarton', 'quantity' => 1]);
        $this->second = Item::factory()->create(['product_name' => 'Aardvark Pad', 'item_category_id' => $this->item->item_category_id]);
        $this->third = Item::factory()->create(['product_name' => 'Zebra Pad', 'item_category_id' => $this->item->item_category_id]);
        foreach ([$this->item, $this->second, $this->third] as $item) {
            $item->packagingTypes()->attach([$piece->id => ['quantity' => 1], $carton->id => ['quantity' => 12]]);
        }
    }

    private function import(string $csv, bool $dry = false)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => 'item_levels']), ['csv' => $csv, 'dry_run' => $dry]);
    }

    /** @return list<string> */
    private function errors($response): array
    {
        return (array) ($response->baseResponse->getSession()->get('import_preview')['errors'] ?? []);
    }

    private function band(StockLocation $place, Item $item): ?ShelfItemBand
    {
        return ShelfItemBand::query()->where('stock_location_id', $place->id)->where('item_id', $item->id)->first();
    }

    #[Test]
    public function a_shelf_row_gives_the_item_a_bin_and_new_bins_fill_in_file_order(): void
    {
        $csv = "location,item_id,unit,max,refill,critical\n"
            ."{$this->shelfName},{$this->third->id},ZPiece,24,8,2\n"
            ."{$this->shelfName},{$this->item->id},ZPiece,36,12,3\n"
            ."{$this->shelfName},{$this->second->id},ZCarton,5,2,1";

        $this->import($csv, dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['created'] === 3
            && str_contains(implode(' ', $p['summary']['warnings']), 'in the order of the file'));
        $this->assertSame(0, ShelfItemBand::query()->where('stock_location_id', $this->shelf()->id)->count());

        $this->import($csv)->assertSessionHas('success');

        $band = $this->band($this->shelf(), $this->second);
        $this->assertSame([5, 2, 1], [$band->max_units, $band->refill_units, $band->critical_units]);
        $this->assertNotNull($band->item_packaging_type_id, 'the unit named in the file');

        // the bins read Zebra, Pencil, Aardvark: the order of the file, not the alphabet
        $bins = app(ShelfMatrix::class)->forShelf($this->shelf())['bins'];
        $this->assertSame(
            [$this->third->product_name, $this->item->product_name, $this->second->product_name],
            array_slice(array_column($bins, 'name'), 0, 3),
        );
        $this->assertSame(0, ItemStock::query()->count(), 'levels never put stock anywhere');
    }

    #[Test]
    public function floors_use_the_same_rows_and_an_empty_unit_means_the_smallest(): void
    {
        $this->import("location,item_id,unit,max,refill,critical\n{$this->floorName},{$this->item->id},,500,100,20")->assertSessionHas('success');

        $band = $this->band($this->floor(), $this->item);
        $this->assertSame([500, 100, 20], [$band->max_units, $band->refill_units, $band->critical_units]);
        $this->assertNull($band->item_packaging_type_id);
    }

    #[Test]
    public function the_lines_unit_place_item_and_duplicates_are_checked_and_one_bad_row_saves_nothing(): void
    {
        $head = "location,item_id,item,unit,max,refill,critical\n";
        $text = implode(' | ', $this->errors($this->import($head
            ."{$this->shelfName},{$this->item->id},Pencil HB,ZPiece,10,20,5\n"
            ."{$this->shelfName},{$this->second->id},Aardvark Pad,Crate,10,5,2\n"
            ."Nowhere,{$this->third->id},Zebra Pad,ZPiece,10,5,2\n"
            ."{$this->shelfName},99999,,ZPiece,10,5,2\n"
            ."{$this->shelfName},{$this->third->id},Not The Name,ZPiece,10,5,2\n"
            ."{$this->shelfName},{$this->second->id},Aardvark Pad,ZPiece,0,0,0\n"
            ."{$this->shelfName},{$this->item->id},Pencil HB,ZPiece,10,5,2")));

        $this->assertStringContainsString('critical (5) ≤ refill (20) ≤ max (10)', $text);
        $this->assertStringContainsString("is not packed in 'Crate'", $text);
        $this->assertStringContainsString("unknown location 'Nowhere'", $text);
        $this->assertStringContainsString('there is no item 99999', $text);
        $this->assertStringContainsString("not 'Not The Name': download the file again", $text);
        $this->assertStringContainsString('with a max of at least 1', $text);
        $this->assertStringContainsString('is already on line 2 for that place', $text);
        $this->assertSame(0, ShelfItemBand::query()->whereIn('stock_location_id', [$this->shelf()->id])->count());
    }

    #[Test]
    public function changing_a_line_keeps_the_bin_and_a_download_imports_back_as_a_no_op(): void
    {
        $this->import("location,item_id,max,refill,critical\n{$this->shelfName},{$this->third->id},24,8,2\n{$this->shelfName},{$this->item->id},24,8,2")->assertSessionHas('success');
        $firstId = $this->band($this->shelf(), $this->third)->id;

        $this->import("location,item_id,max,refill,critical\n{$this->shelfName},{$this->third->id},30,10,3")->assertSessionHas('success');
        $this->assertSame($firstId, $this->band($this->shelf(), $this->third)->id, 'same bin');
        $this->assertSame(30, $this->band($this->shelf(), $this->third)->max_units);

        $export = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'item_levels']))->streamedContent();
        $this->assertStringContainsString('Zebra Pad', $export);
        $this->import($export, dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 0 && $p['summary']['created'] === 0 && $p['summary']['unchanged'] === 2);
    }

    #[Test]
    public function every_place_name_in_the_template_is_one_the_import_knows(): void
    {
        $names = array_column(app(CatalogueSheet::class)->locations(), 'name');
        $this->assertContains($this->shelfName, $names);
        $this->assertContains($this->floorName, $names);
    }
}
