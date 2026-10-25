<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Services\Item\ItemDeployer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** Import / Export: store prices, the go-live step. */
class DataExchangePricesTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private string $sku;

    private StoreVariant $row;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local'); // the import audit files

        $this->setUpSetupItem();
        $this->sku = (string) $this->variant->fresh()->sku;

        // deployed the way the Deploy button does it: switched off, unpriced
        app(ItemDeployer::class)->deploy($this->item->fresh(), $this->store);
        $this->row = StoreVariant::query()->where('store_id', $this->store->id)->where('item_variant_id', $this->variant->id)->firstOrFail();
    }

    private function import(string $csv, bool $dry = false)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => 'store_prices']), ['csv' => $csv, 'dry_run' => $dry]);
    }

    private function header(): string
    {
        return "store,sku,price,discount_price,discount_ends_at,individual_price,business_pool\n";
    }

    private function line(string $rest): string
    {
        return $this->header()."Main Store,{$this->sku},{$rest}";
    }

    /** @return list<string> */
    private function errors($response): array
    {
        return (array) ($response->baseResponse->getSession()->get('import_preview')['errors'] ?? []);
    }

    #[Test]
    public function a_price_puts_the_deployed_variant_on_sale_and_the_check_says_so_first(): void
    {
        $this->assertFalse((bool) $this->row->active);

        $this->import($this->line('25,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 1
            && in_array('1 variants go ON SALE with this file', $p['summary']['warnings'], true));
        $this->assertFalse((bool) $this->row->fresh()->active, 'checking saves nothing');

        $this->import($this->line('25,,,,'))->assertSessionHas('success');
        $row = $this->row->fresh();
        $this->assertTrue((bool) $row->active);
        $this->assertSame(25.0, (float) $row->pricing_matrix['price']);

        $this->import($this->line('25,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 0 && $p['summary']['unchanged'] === 1);
    }

    #[Test]
    public function a_price_of_zero_takes_it_off_and_an_admin_forced_off_variant_stays_off(): void
    {
        $this->import($this->line('25,,,,'));
        $this->import($this->line('0,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => in_array('1 variants are taken OFF sale with this file', $p['summary']['warnings'], true));
        $this->import($this->line('0,,,,'));
        $this->assertFalse((bool) $this->row->fresh()->active);

        $this->row->update(['manual_status' => 'forced', 'forced_status' => 'inactive']);
        $this->import($this->line('40,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => str_contains(implode(' ', $p['summary']['warnings']), 'switched off by an admin'));
        $this->import($this->line('40,,,,'));
        $this->assertFalse((bool) $this->row->fresh()->active);
        $this->assertSame(40.0, (float) $this->row->fresh()->pricing_matrix['price']);
    }

    #[Test]
    public function discounts_individual_prices_and_pools_follow_the_item_page_rules(): void
    {
        $this->import($this->line('100,80,2026-12-31,90,50'))->assertSessionHas('success');
        $row = $this->row->fresh();
        $this->assertSame(80.0, (float) $row->pricing_matrix['discount_price']);
        $this->assertSame('2026-12-31', substr((string) $row->pricing_matrix['discount_ends_at'], 0, 10));
        $this->assertSame(50, $row->business_pool);
        $this->assertSame(90.0, (float) StoreVariantIndividualPrice::query()->where('store_variant_id', $row->id)->first()->pricing_matrix['price']);

        // blank keeps, CLEAR removes
        $this->import($this->line('120,,,,'))->assertSessionHas('success');
        $this->assertSame(120.0, (float) $this->row->fresh()->pricing_matrix['price']);
        $this->assertSame(80.0, (float) $this->row->fresh()->pricing_matrix['discount_price'], 'a blank cell keeps the discount');

        $this->import($this->line('120,CLEAR,,CLEAR,CLEAR'))->assertSessionHas('success');
        $row = $this->row->fresh();
        $this->assertNull($row->pricing_matrix['discount_price']);
        $this->assertNull($row->business_pool);
        $this->assertNull(StoreVariantIndividualPrice::query()->where('store_variant_id', $row->id)->first());

        $this->assertStringContainsString('needs a discount_ends_at', implode(' ', $this->errors($this->import($this->line('100,80,,,')))));
        $this->assertStringContainsString('above the price', implode(' ', $this->errors($this->import($this->line('100,150,2026-12-31,,')))));
        $this->assertStringContainsString('must be a date', implode(' ', $this->errors($this->import($this->line('100,80,31/12/2026,,')))));
    }

    #[Test]
    public function a_slipped_decimal_and_a_price_under_cost_are_warned_about(): void
    {
        $this->import($this->line('20,,,,'));
        $this->variant->forceFill(['unit_cost' => 15])->save();

        $this->import($this->line('2000,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => str_contains(implode(' ', $p['summary']['warnings']), 'a change of more than half'));
        $this->import($this->line('12,,,,'), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => str_contains(implode(' ', $p['summary']['warnings']), 'below its cost'));
    }

    #[Test]
    public function a_variant_that_is_not_in_the_store_unknown_names_and_a_missing_price_fail_the_file(): void
    {
        $this->assertStringContainsString("unknown store 'Nowhere'", implode(' ', $this->errors($this->import($this->header()."Nowhere,{$this->sku},5,,,,"))));
        $this->assertStringContainsString("there is no variant with sku 'NOPE'", implode(' ', $this->errors($this->import($this->header().'Main Store,NOPE,5,,,,'))));

        $other = \App\Models\Store\Store::factory()->create(['name' => 'Second Store', 'type' => \App\Models\Store\Store::TYPE_RETAIL, 'status' => 'active']);
        $this->assertStringContainsString('put its item in the store first', implode(' ', $this->errors($this->import($this->header()."Second Store,{$this->sku},5,,,,"))));
        $this->assertSame(0, StoreVariant::query()->where('store_id', $other->id)->count());

        $this->assertStringContainsString('has no price yet', implode(' ', $this->errors($this->import($this->line(',,,,40')))));
        $this->assertStringContainsString('already on line 2', implode(' ', $this->errors($this->import($this->line('5,,,,')."\nMain Store,{$this->sku},6,,,,"))));
    }

    #[Test]
    public function a_download_imports_back_as_a_no_op_and_never_forces_a_variant_off(): void
    {
        $export = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'store_prices']))->streamedContent();
        $this->assertStringContainsString("{$this->sku}", $export);
        $this->assertStringContainsString(',no', $export); // on_sale: not on sale yet

        $this->import($export, dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['updated'] === 0 && $p['summary']['unchanged'] === 1);

        // the on_sale column is only for reading: a sheet that still says "no" must not stop a priced variant going on sale
        $this->import("store,sku,price,on_sale\nMain Store,{$this->sku},30,no")->assertSessionHas('success');
        $row = $this->row->fresh();
        $this->assertTrue((bool) $row->active);
        $this->assertSame('auto', $row->manual_status);
    }
}
