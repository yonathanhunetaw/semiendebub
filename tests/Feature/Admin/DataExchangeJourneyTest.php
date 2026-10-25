<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StocktakeService;
use App\Services\Item\ItemReadiness;
use App\Models\Inventory\Stocktake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** A catalogue set up from files only, in the order the Import / Export page lists: it ends up for sale, with stock. */
class DataExchangeJourneyTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private function import(string $dataset, string $csv)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => $dataset]), ['csv' => $csv])->assertSessionHas('success');
    }

    #[Test]
    public function a_new_item_goes_from_files_to_on_sale_and_in_stock(): void
    {
        Storage::fake('local');
        $this->setUpSetupItem();

        $this->import('categories', "path\nZoo > Soft toys");
        $this->import('item_colors', "name\nZPink\nZGrey");
        $this->import('item_sizes', "name\nZSmall");
        $this->import('item_packaging_types', "name\nZUnit\nZBox");
        $this->import('items', "product_name,category_path,status,colors,sizes,packaging\nZ Bear,Zoo > Soft toys,active,ZPink; ZGrey,ZSmall,ZUnit:1; ZBox:6");

        $bear = Item::query()->where('product_name', 'Z Bear')->firstOrFail();
        $variants = ItemVariant::query()->where('item_id', $bear->id)->with('itemPackagingType')->orderBy('id')->get();
        $this->assertCount(4, $variants);

        $this->import('item_variants', "sku,barcode\n".$variants->map(fn (ItemVariant $v): string => "{$v->sku},AUTO")->implode("\n"));
        $this->assertSame(4, ItemVariant::query()->where('item_id', $bear->id)->whereNotNull('barcode')->count());

        $before = app(ItemReadiness::class)->for($bear->fresh())['percent'];

        $this->actingAs($this->admin)->post(route('admin.data.deploy'), ['store_id' => $this->store->id, 'scope' => 'file', 'csv' => "item_id\n{$bear->id}"])->assertSessionHas('success');
        $this->assertSame(0, StoreVariant::query()->where('store_id', $this->store->id)->where('item_id', $bear->id)->where('active', true)->count(), 'deployed, not for sale yet');

        $this->import('store_prices', "store,sku,price\n".$variants->map(fn (ItemVariant $v): string => "Main Store,{$v->sku},".($v->itemPackagingType->name === 'ZBox' ? 500 : 100))->implode("\n"));
        $this->assertSame(4, StoreVariant::query()->where('store_id', $this->store->id)->where('item_id', $bear->id)->where('active', true)->count(), 'a price puts them on sale');

        $this->import('stock_counts', "location,sku,unit,counted\n".$variants->map(fn (ItemVariant $v): string => "Main Store · Store Shelf,{$v->sku},{$v->itemPackagingType->name},10")->implode("\n"));
        $this->assertSame(0, (int) \App\Models\Inventory\ItemStock::query()->whereIn('item_variant_id', $variants->pluck('id'))->sum('quantity'), 'a count is not stock yet');

        app(StocktakeService::class)->post(Stocktake::query()->where('status', Stocktake::SUBMITTED)->firstOrFail(), $this->makeUser('admin', null));
        $this->assertSame(40, (int) \App\Models\Inventory\ItemStock::query()->whereIn('item_variant_id', $variants->pluck('id'))->sum('quantity'));

        $this->assertGreaterThan($before, app(ItemReadiness::class)->for($bear->fresh())['percent']);
    }
}
