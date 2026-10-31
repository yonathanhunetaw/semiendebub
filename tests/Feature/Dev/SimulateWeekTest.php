<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Finance\Sale;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteHour;
use App\Services\Dev\Sim\SimCast;
use App\Services\Dev\Sim\SimReport;
use App\Services\StockService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The shop simulator (make sim) still plays a day through the real services:
 * one open day of sales, shipment, keys, cash and closing, with nothing
 * refused and every check passing. Keeps sim:week in step as the services change.
 */
final class SimulateWeekTest extends TestCase
{
    use RefreshDatabase;

    private string $storage;

    protected function setUp(): void
    {
        parent::setUp();

        // A Wednesday, so yesterday was an open Tuesday.
        Carbon::setTestNow(CarbonImmutable::parse('2026-11-04 01:00:00'));
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-04 01:00:00'));

        // The report and today's script go to a scratch folder, not the real storage/app/sim.
        $this->storage = sys_get_temp_dir().'/duka-sim-test-'.uniqid();
        $this->app->useStoragePath($this->storage);

        $store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        Vehicle::query()->create(['name' => 'Van', 'plate' => 'AA-1-00001', 'status' => 'active', 'max_cbm' => 6]);

        $site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        foreach (range(0, 6) as $weekday) {
            SiteHour::query()->create(['stock_location_id' => $site->id, 'weekday' => $weekday, 'opens_at' => '07:00', 'closes_at' => '18:00', 'closed' => $weekday === 0]);
        }

        $floor = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->firstOrFail();
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->firstOrFail();

        foreach (range(1, 15) as $n) {
            $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active', 'product_name' => "Good {$n}"])->id]);
            StoreVariant::factory()->create([
                'store_id' => $store->id,
                'item_variant_id' => $variant->id,
                'active' => true,
                'pricing_matrix' => ['price' => 60 * $n],
            ]);
            app(StockService::class)->receive((int) $variant->id, $floor, 400);
            app(StockService::class)->receive((int) $variant->id, $shelf, 40);
        }
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storage);
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();

        parent::tearDown();
    }

    #[Test]
    public function a_simulated_day_runs_through_the_services_with_nothing_refused(): void
    {
        $this->artisan('sim:week', ['--days' => 2])->assertSuccessful();

        $report = File::get($this->storage.'/'.SimReport::PATH);

        $this->assertStringContainsString('## Refused by the app (0)', $report);
        $this->assertStringNotContainsString('❌', $report);

        // Yesterday was sold, paid, handed over and closed; today waits for sim:live.
        $this->assertGreaterThan(30, Sale::query()->count());
        $this->assertSame(SiteDay::STATUS_CLOSED, SiteDay::query()->whereDate('date', '2026-11-03')->value('status'));
        $this->assertNotSame('[]', File::get($this->storage.'/app/sim/today.json'));
    }

    #[Test]
    public function the_simulated_day_is_recorded_as_the_worlds_demo_week_with_only_sim_people(): void
    {
        $this->artisan('sim:week', ['--days' => 2])->assertSuccessful();
        // Someone who is not part of the sim, on the same copy: never in the demo files.
        \App\Models\Auth\User::factory()->create(['first_name' => 'Realperson', 'role' => 'seller']);

        $dir = $this->storage.'/demo';
        $this->artisan('sim:export-world', ['--days' => 2, '--dir' => $dir])->assertSuccessful();

        $index = json_decode(File::get($dir.'/index.json'), true);
        $this->assertSame(['2026-11-03'], $index['days']);

        $day = json_decode(File::get($dir.'/2026-11-03.json'), true);
        $this->assertNotEmpty($day['orders']);
        $this->assertNotEmpty($day['shipments']);
        $this->assertEmpty(array_diff(array_unique(array_column($day['orders'], 'seller')), ['Hana', 'Dawit', 'Selam', 'Meseret']));
        $this->assertStringNotContainsString('Realperson', File::get($dir.'/2026-11-03.json'));
        // Money and staff come with their people: who gave and who took.
        $this->assertNotEmpty(array_filter($day['events'], fn (array $e): bool => ($e['fx'] ?? null) === 'walk_in' && isset($e['actor']['role'])));
    }

    #[Test]
    public function it_runs_only_on_a_sim_copy_outside_production(): void
    {
        $this->assertNull(SimCast::refusalFor('duka_sim', production: false, tests: false));
        $this->assertStringContainsString('only a *_sim database', (string) SimCast::refusalFor('duka', production: false, tests: false));
        $this->assertStringContainsString('only a *_sim database', (string) SimCast::refusalFor('duka_e2e', production: false, tests: false));
        $this->assertSame('Refusing to simulate in production.', SimCast::refusalFor('duka_sim', production: true, tests: false));
    }
}
