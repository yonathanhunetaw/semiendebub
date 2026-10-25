<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\ItemCategory;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\Tariff;
use App\Models\Store\Store;
use App\Services\DataExchange\DatasetRegistry;
use App\Services\Shared\CsvReader;
use App\Services\Shared\CsvWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Settings → Import / Export: every module as CSV, setup data back in, all or nothing. */
class DataExchangeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local'); // the import audit files

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');
    }

    private function import(string $dataset, string $csv, bool $dry = false)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => $dataset]), ['csv' => $csv, 'dry_run' => $dry]);
    }

    #[Test]
    public function only_a_global_admin_can_open_it(): void
    {
        $store = Store::factory()->create();
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $store->id]);
        $storeAdmin->assignRole('admin');

        $this->actingAs($storeAdmin)->get(route('admin.data.index'))->assertForbidden();
        $this->actingAs($storeAdmin)->get(route('admin.data.export', ['dataset' => 'suppliers']))->assertForbidden();
        $this->actingAs($storeAdmin)->post(route('admin.data.import', ['dataset' => 'suppliers']), ['csv' => 'name'])->assertForbidden();

        $this->actingAs($this->admin)->get(route('admin.data.index'))->assertOk();
    }

    #[Test]
    public function every_dataset_downloads_with_its_header_and_never_a_secret(): void
    {
        $registry = new DatasetRegistry();
        $this->assertGreaterThan(60, count($registry->all()));

        foreach ($registry->all() as $key => $set) {
            $csv = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => $key]))->assertOk()->streamedContent();
            $first = strtok(ltrim($csv, "\xEF\xBB\xBF"), "\n");

            $this->assertSame(implode(',', $set->columns()), trim((string) $first), "header of {$key}");
            $this->assertDoesNotMatchRegularExpression('/password|remember_token|secret/i', implode(',', $set->columns()), "secret column in {$key}");
        }
    }

    #[Test]
    public function money_ledgers_and_statuses_have_no_import_door(): void
    {
        foreach (['payments', 'sales', 'inventory_movements', 'item_stocks', 'supplier_payments', 'purchases', 'users', 'time_entries'] as $key) {
            $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => $key]), ['csv' => "id\n1"])->assertNotFound();
            $this->actingAs($this->admin)->get(route('admin.data.template', ['dataset' => $key]))->assertNotFound();
        }
        $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'nope']))->assertNotFound();
    }

    #[Test]
    public function a_dry_run_changes_nothing_and_apply_saves_it_and_a_second_apply_is_a_no_op(): void
    {
        $csv = "name,country,currency,default_payment_days,is_active\nGuangzhou Bags,China,USD,30,yes\nDubai Trading,UAE,AED,,no";

        $this->import('suppliers', $csv, dry: true)->assertSessionHas('import_preview', fn (array $p) => $p['summary']['created'] === 2 && $p['errors'] === []);
        $this->assertSame(0, Supplier::query()->count());

        $this->import('suppliers', $csv)->assertSessionHas('success');
        $this->assertSame(2, Supplier::query()->count());
        $this->assertSame(30, Supplier::query()->where('name', 'Guangzhou Bags')->value('default_payment_days'));
        $this->assertFalse((bool) Supplier::query()->where('name', 'Dubai Trading')->value('is_active'));

        $this->import('suppliers', $csv, dry: true)->assertSessionHas('import_preview', fn (array $p) => $p['summary']['created'] === 0 && $p['summary']['updated'] === 0 && $p['summary']['unchanged'] === 2);
    }

    #[Test]
    public function a_bad_row_rejects_the_whole_file_with_its_line_number(): void
    {
        $csv = "name,default_payment_days\nGood Co,30\nBad Co,thirty\n,5";

        $this->import('suppliers', $csv)->assertSessionHas('error')->assertSessionHas('import_preview', function (array $p): bool {
            return in_array("Line 3: default_payment_days 'thirty' is not a whole number", $p['errors'], true)
                && in_array('Line 4: name is empty', $p['errors'], true);
        });
        $this->assertSame(0, Supplier::query()->count());
    }

    #[Test]
    public function a_column_left_out_is_not_changed_and_an_export_round_trips(): void
    {
        $supplier = Supplier::query()->create(['name' => 'Keep Me', 'country' => 'Kenya', 'phone' => '+254 700', 'is_active' => true, 'created_by' => $this->admin->id]);

        $this->import('suppliers', "id,name\n{$supplier->id},Renamed Co")->assertSessionHas('success');
        $supplier->refresh();
        $this->assertSame('Renamed Co', $supplier->name);
        $this->assertSame('+254 700', $supplier->phone);

        $export = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'suppliers']))->streamedContent();
        $this->import('suppliers', $export, dry: true)->assertSessionHas('import_preview', fn (array $p) => $p['summary']['updated'] === 0 && $p['summary']['unchanged'] === 1);
    }

    #[Test]
    public function tariffs_are_matched_by_hs_code_whatever_its_dots(): void
    {
        $this->import('tariffs', "hs_code,description,duty_pct,vat_pct\n8471.30.00,Laptops,5,15")->assertSessionHas('success');
        $this->import('tariffs', "hs_code,duty_pct\n84713000,7")->assertSessionHas('success');

        $this->assertSame(1, Tariff::query()->count());
        $this->assertSame(7.0, (float) Tariff::forCode('8471.30.00')->duty_pct);
        $this->assertSame(15.0, (float) Tariff::forCode('8471.30.00')->vat_pct);

        $this->import('tariffs', "hs_code,duty_pct\n84713000,7\n8471.30.00,8")->assertSessionHas('error');
    }

    #[Test]
    public function category_paths_create_only_what_is_missing_parents_first(): void
    {
        $bags = ItemCategory::query()->create(['category_name' => 'Bags']);

        $this->import('categories', "path\nBags > School bags\nbags > school bags > Kids\nShoes")->assertSessionHas('success');

        $school = ItemCategory::query()->where('category_name', 'School bags')->firstOrFail();
        $this->assertSame($bags->id, $school->parent_id);
        $this->assertSame($school->id, ItemCategory::query()->where('category_name', 'Kids')->value('parent_id'));
        $this->assertNull(ItemCategory::query()->where('category_name', 'Shoes')->value('parent_id'));
        $this->assertSame(4, ItemCategory::query()->count());
    }

    #[Test]
    public function the_everything_download_is_a_zip_with_a_readme(): void
    {
        $response = $this->actingAs($this->admin)->get(route('admin.data.everything'))->assertOk();
        $zip = new \ZipArchive();
        $this->assertTrue($zip->open($response->baseResponse->getFile()->getPathname()));
        $this->assertNotFalse($zip->locateName('README.csv'));
        $this->assertNotFalse($zip->locateName('suppliers.csv'));
        $this->assertFalse(str_contains((string) $zip->getFromName('README.csv'), 'failed'));
    }

    #[Test]
    public function the_writer_guards_formulas_and_the_reader_keeps_quoted_newlines(): void
    {
        $csv = (new CsvWriter())->write(['a', 'b'], [['=1+1', "line one\nline two"], ["\tTab", null]]);
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString("'=1+1", $csv);
        $this->assertStringContainsString("'\tTab", $csv);

        $table = (new CsvReader())->parse($csv, ['a', 'b']);
        $this->assertTrue($table->ok());
        $this->assertSame("line one\nline two", $table->rows[0]['data']['b']);
        $this->assertSame('=1+1', $table->rows[0]['data']['a']);
        $this->assertSame('Tab', $table->rows[1]['data']['a']);

        $this->assertFalse((new CsvReader())->parse("a,x\n1,2", ['a', 'b'])->ok());
    }

    #[Test]
    public function an_applied_import_leaves_an_audit_file_with_who_what_and_the_old_values(): void
    {
        $supplier = Supplier::query()->create(['name' => 'Old Name', 'country' => 'Kenya', 'is_active' => true, 'created_by' => $this->admin->id]);

        $this->import('suppliers', "id,name\n{$supplier->id},New Name\n,Fresh Co")->assertSessionHas('success');

        $files = Storage::disk('local')->allFiles('imports');
        $this->assertCount(2, $files);
        $json = collect($files)->first(fn (string $f): bool => str_ends_with($f, '.json'));
        $audit = json_decode((string) Storage::disk('local')->get($json), true);

        $this->assertSame('suppliers', $audit['dataset']);
        $this->assertSame($this->admin->id, $audit['by']);
        $this->assertSame(1, $audit['summary']['created']);
        $this->assertSame(1, $audit['summary']['updated']);
        $changes = collect($audit['changes']);
        $this->assertSame('Old Name', $changes->firstWhere('kind', 'update')['before']['name']);
        $this->assertNotNull($changes->firstWhere('kind', 'create'));

        $csv = collect($files)->first(fn (string $f): bool => str_ends_with($f, '.csv'));
        $this->assertStringContainsString('Fresh Co', (string) Storage::disk('local')->get($csv));

        // checking only (dry run) leaves nothing behind
        Storage::fake('local');
        $this->import('suppliers', "name\nAnother", dry: true);
        $this->assertSame([], Storage::disk('local')->allFiles('imports'));
    }
}
