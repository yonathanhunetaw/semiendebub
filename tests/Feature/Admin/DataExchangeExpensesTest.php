<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Exceptions\PaymentException;
use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Fulfillment\Vehicle;
use App\Models\Store\Store;
use App\Services\Finance\ExpenseService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Import / Export: expenses are added as claimed, and a second person still confirms each. */
class DataExchangeExpensesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->withoutVite();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 17:00:00'));
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->admin = $this->globalAdmin();
        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        Vehicle::factory()->create(['plate' => 'AA 12345', 'status' => Vehicle::STATUS_ACTIVE]);
    }

    private function globalAdmin(): User
    {
        $user = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $user->assignRole('admin');

        return $user;
    }

    private function import(string $csv, bool $dry = false)
    {
        return $this->actingAs($this->admin)->post(route('admin.data.import', ['dataset' => 'expenses']), ['csv' => $csv, 'dry_run' => $dry]);
    }

    /** @return list<string> */
    private function errors($response): array
    {
        return (array) ($response->baseResponse->getSession()->get('import_preview')['errors'] ?? []);
    }

    private const HEAD = "spent_on,category,amount,description,store,vehicle_plate,litres\n";

    #[Test]
    public function rows_are_recorded_as_claimed_by_the_importer_and_the_check_says_someone_else_confirms(): void
    {
        $csv = self::HEAD."2026-10-18,fuel,2500,Diesel for the van,Bole Store,AA 12345,38.5\n2026-10-19,rent,\"12,000\",,,,";
        // "12,000" is not a number the app accepts: write it plain
        $csv = str_replace('"12,000"', '12000', $csv);

        $this->import($csv, dry: true)->assertSessionHas('import_preview', fn (array $p): bool => $p['summary']['created'] === 2
            && str_contains(implode(' ', $p['summary']['warnings']), '2 expenses worth 14,500.00 ETB are recorded as claimed'));
        $this->assertSame(0, Expense::query()->count());

        $this->import($csv)->assertSessionHas('success');
        $this->assertSame(2, Expense::query()->count());

        $fuel = Expense::query()->where('category', 'fuel')->firstOrFail();
        $this->assertSame(Expense::STATUS_CLAIMED, $fuel->status);
        $this->assertSame($this->admin->id, (int) $fuel->recorded_by);
        $this->assertSame($this->store->id, (int) $fuel->store_id);
        $this->assertSame('AA 12345', $fuel->vehicle->plate);
        $this->assertSame(38.5, (float) $fuel->litres);

        // the importer can not confirm what they recorded; a different global admin can
        $this->expectException(PaymentException::class);
        try {
            app(ExpenseService::class)->confirm($fuel, $this->admin);
        } finally {
            app(ExpenseService::class)->confirm($fuel->fresh(), $this->globalAdmin());
            $this->assertSame(Expense::STATUS_CONFIRMED, $fuel->fresh()->status);
        }
    }

    #[Test]
    public function a_bad_line_fails_the_whole_file(): void
    {
        $csv = self::HEAD
            ."2026-10-18,fuel,100,ok,,,\n"
            ."2026-10-18,petrol,100,,,,\n"
            ."2026-10-18,fuel,0,,,,\n"
            ."2026-10-18,fuel,abc,,,,\n"
            ."2027-01-01,fuel,100,,,,\n"
            ."2026-10-18,fuel,100,,Nowhere,,\n"
            ."2026-10-18,fuel,100,,,ZZ 999,\n"
            .'18/10/2026,fuel,100,,,,';

        $text = implode(' | ', $this->errors($this->import($csv)));
        $this->assertStringContainsString("category 'petrol' must be one of fuel, rent", $text);
        $this->assertStringContainsString('An expense is above zero', $text);
        $this->assertStringContainsString("amount 'abc' is not a number", $text);
        $this->assertStringContainsString('for today or a day before', $text);
        $this->assertStringContainsString("unknown store 'Nowhere'", $text);
        $this->assertStringContainsString("unknown vehicle_plate 'ZZ 999'", $text);
        $this->assertStringContainsString('must be a date', $text);
        $this->assertSame(0, Expense::query()->count(), 'one bad line saves nothing');
    }

    #[Test]
    public function the_same_expense_cannot_be_loaded_twice(): void
    {
        $csv = self::HEAD."2026-10-18,fuel,2500,Diesel,Bole Store,,\n";
        $this->import($csv)->assertSessionHas('success');

        $again = $this->import($csv);
        $this->assertStringContainsString('is already recorded', implode(' ', $this->errors($again)));
        $this->assertSame(1, Expense::query()->count());

        $twice = $this->import(self::HEAD."2026-10-17,rent,500,Shop,,,\n2026-10-17,rent,500,Shop,,,\n");
        $this->assertStringContainsString('the same expense is already on line 2', implode(' ', $this->errors($twice)));

        // a rejected one may be recorded again
        $expense = Expense::query()->firstOrFail();
        app(ExpenseService::class)->reject($expense, $this->globalAdmin(), 'Wrong amount');
        $this->import($csv)->assertSessionHas('success');
        $this->assertSame(2, Expense::query()->count());
    }

    #[Test]
    public function a_download_is_for_reading_and_the_template_is_for_adding(): void
    {
        $this->import(self::HEAD."2026-10-18,fuel,2500,Diesel,Bole Store,,\n");
        $export = $this->actingAs($this->admin)->get(route('admin.data.export', ['dataset' => 'expenses']))->streamedContent();
        $this->assertStringContainsString('recorded_by', $export);
        $this->assertStringContainsString('claimed', $export);

        $this->assertStringContainsString("Unknown column 'id'", implode(' ', $this->errors($this->import($export))));

        $template = $this->actingAs($this->admin)->get(route('admin.data.template', ['dataset' => 'expenses']))->streamedContent();
        $this->assertStringContainsString('spent_on,category,amount,description,store,vehicle_plate,litres', $template);
        $this->assertStringNotContainsString('recorded_by', $template);
    }
}
