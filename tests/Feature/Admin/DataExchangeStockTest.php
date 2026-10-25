<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\Stocktake;
use App\Services\Inventory\StocktakeService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** Import / Export: stock enters only as a count that someone approves. */
class DataExchangeStockTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private string $sku;

    private string $unit;

    private string $place = 'Main Store · Store Shelf';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->setUpSetupItem();
        $this->sku = (string) $this->variant->fresh()->sku;
        $this->unit = (string) $this->variant->fresh()->itemPackagingType->name;
    }

    private function import(string $csv, bool $dry = false)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => 'stock_counts']), ['csv' => $csv, 'dry_run' => $dry]);
    }

    private function csv(string $rest): string
    {
        return "location,sku,unit,counted\n".$rest;
    }

    /** @return list<string> */
    private function errors($response): array
    {
        return (array) ($response->baseResponse->getSession()->get('import_preview')['errors'] ?? []);
    }

    private function onHand(): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $this->shelf()->id)->value('quantity');
    }

    #[Test]
    public function importing_makes_a_submitted_count_and_changes_no_stock_until_it_is_approved(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->shelf(), 5);

        $this->import($this->csv("{$this->place},{$this->sku},{$this->unit},12"), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['created'] === 1
            && str_contains(implode(' ', $p['summary']['warnings']), 'Nothing changes in stock yet'));
        $this->assertSame(0, Stocktake::query()->count());

        $this->import($this->csv("{$this->place},{$this->sku},{$this->unit},12"))->assertSessionHas('success');
        $take = Stocktake::query()->firstOrFail();
        $this->assertSame(Stocktake::SUBMITTED, $take->status);
        $this->assertSame($this->shelf()->id, (int) $take->stock_location_id);
        $this->assertSame($this->admin->id, (int) $take->submitted_by);
        $this->assertSame(5, $this->onHand(), 'the ledger has not moved');

        // a different person approves; the difference is booked through the ledger
        $approver = $this->makeUser('admin', null);
        app(StocktakeService::class)->post($take, $approver);
        $this->assertSame(12, $this->onHand());
        $this->assertSame(7, (int) InventoryMovement::query()->where('item_variant_id', $this->variant->id)->orderByDesc('id')->value('quantity'));
    }

    #[Test]
    public function a_file_in_the_wrong_unit_an_unknown_place_or_a_bad_figure_fails_whole(): void
    {
        $text = implode(' | ', $this->errors($this->import($this->csv(
            "{$this->place},{$this->sku},Crate-of-nothing,3\n"
            ."Nowhere,{$this->sku},{$this->unit},3\n"
            ."{$this->place},NOPE,{$this->unit},3\n"
            ."{$this->place},{$this->sku},{$this->unit},-2\n"
            ."{$this->place},{$this->sku},{$this->unit},two"
        ))));

        $this->assertStringContainsString('count it in '.$this->unit, $text);
        $this->assertStringContainsString("unknown location 'Nowhere'", $text);
        $this->assertStringContainsString("there is no variant with sku 'NOPE'", $text);
        $this->assertStringContainsString('a count cannot be negative', $text);
        $this->assertStringContainsString("counted 'two' is not a whole number", $text);
        $this->assertSame(0, Stocktake::query()->count());

        $dup = implode(' ', $this->errors($this->import($this->csv("{$this->place},{$this->sku},{$this->unit},3\n{$this->place},{$this->sku},{$this->unit},4"))));
        $this->assertStringContainsString('is already on line 2 for that place', $dup);
    }

    #[Test]
    public function a_place_with_a_count_open_is_refused_until_it_is_approved_or_voided(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->shelf(), 5);
        $open = app(StocktakeService::class)->start($this->shelf(), $this->admin);

        $refused = $this->import($this->csv("{$this->place},{$this->sku},{$this->unit},9"));
        $this->assertStringContainsString("already has a count open ({$open->reference})", implode(' ', $this->errors($refused)));
        $this->assertSame(1, Stocktake::query()->count());

        app(StocktakeService::class)->void($open, $this->admin);
        $this->import($this->csv("{$this->place},{$this->sku},{$this->unit},9"))->assertSessionHas('success');
        $this->assertSame(2, Stocktake::query()->count());
    }

    #[Test]
    public function a_big_drop_is_warned_about_and_a_download_lists_what_is_on_hand_in_its_unit(): void
    {
        app(StockService::class)->receive($this->variant->id, $this->shelf(), 40);

        $this->import($this->csv("{$this->place},{$this->sku},{$this->unit},3"), dry: true)->assertSessionHas('import_preview', fn (array $p): bool => str_contains(implode(' ', $p['summary']['warnings']), 'is counted at 3, the ledger has 40'));

        $export = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'stock_counts']))->streamedContent();
        $this->assertStringContainsString("\"{$this->place}\",{$this->sku},", $export);
        $this->assertStringContainsString($this->unit, $export);
        $this->assertStringContainsString(',40', $export);
    }
}
