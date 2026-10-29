<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Services\Finance\SalesReport;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The Finance reports: per business day, outside open hours, by method, by month.
 */
class SalesReportTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $site;

    private User $seller;

    private int $reference = 0;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);
        foreach (['seller', 'store_manager', 'finance'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $manager = User::factory()->create(['role' => 'store_manager', 'store_id' => $this->store->id]);
        $manager->assignRole('store_manager');
        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->seller->assignRole('seller');
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $manager, $this->seller, 'First holder');

        // Monday the 19th: opens 08:30, a cash sale and a credit sale, closes 19:00 with a matching till.
        $token = app(CounterQr::class)->printedToken($this->site);
        $this->at('2026-10-19 08:30');
        app(SiteDayService::class)->open($this->site, $this->seller, $token);
        $this->sold('2026-10-19 10:00', 300.0, Payment::METHOD_CASH);
        $this->sold('2026-10-19 11:00', 200.0, Payment::METHOD_CREDIT);
        $this->at('2026-10-19 19:00');
        app(SiteDayService::class)->close($this->site, $this->seller, $token, [], 300.0);

        // An online order paid by bank at 21:00, after closing.
        $this->sold('2026-10-19 21:00', 50.0, Payment::METHOD_BANK);

        $this->at('2026-10-20 12:00');
    }

    private function at(string $wallClock): void
    {
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    private function sold(string $wallClock, float $amount, string $method): void
    {
        $this->at($wallClock);
        $sale = Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => $amount, 'reference_number' => 'REP-'.(++$this->reference)]);
        Payment::query()->create([
            'sale_id' => $sale->id, 'payment_method' => $method, 'amount' => $amount,
            'status' => Payment::STATUS_CONFIRMED, 'paid_at' => now(), 'claimed_by' => $this->seller->id, 'confirmed_by' => $this->seller->id,
        ]);
    }

    #[Test]
    public function a_business_day_carries_its_sales_takings_credit_and_till(): void
    {
        $days = app(SalesReport::class)->days(null, '2026-10-19', '2026-10-20');

        $this->assertCount(1, $days);
        $this->assertSame('2026-10-19', $days[0]['date']);
        $this->assertSame(2, $days[0]['orders']);
        $this->assertSame(500.0, $days[0]['sales']);
        $this->assertSame(300.0, $days[0]['takings'], 'Credit is owed, not taken.');
        $this->assertSame(['cash' => 300.0], $days[0]['by_method']);
        $this->assertSame(200.0, $days[0]['credit']);
        $this->assertSame(0.0, $days[0]['till_difference']);
    }

    #[Test]
    public function what_came_in_while_closed_has_its_own_line_and_months_count_everything(): void
    {
        $report = app(SalesReport::class);

        $outside = $report->outsideHours(null, '2026-10-19', '2026-10-20');
        $this->assertCount(1, $outside);
        $this->assertSame(1, $outside[0]['orders']);
        $this->assertSame(50.0, $outside[0]['takings']);

        $methods = collect($report->methods(null, '2026-10-19', '2026-10-19'))->pluck('total', 'method')->all();
        $this->assertSame(['cash' => 300.0, 'credit' => 200.0, 'bank' => 50.0], $methods);

        $october = $report->months(null, 1)[0];
        $this->assertSame('2026-10', $october['month']);
        $this->assertSame(3, $october['orders']);
        $this->assertSame(550.0, $october['sales']);
        $this->assertSame(350.0, $october['takings']);
        $this->assertSame(350.0, $october['net']);
    }

    #[Test]
    public function finance_opens_its_dashboard_and_reports(): void
    {
        $finance = User::factory()->create(['role' => 'finance', 'store_id' => null]);
        $finance->assignRole('finance');
        $this->withServerVariables(['HTTP_HOST' => 'finance.localhost'])->actingAs($finance, 'web');

        $this->get(route('finance.reports.index', ['from' => '2026-10-19', 'to' => '2026-10-20']))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Finance/Reports/index')
                ->has('days', 1)->has('outside', 1)->where('filters.from', '2026-10-19'));

        // A period longer than the limit keeps its end and is shortened.
        $this->get(route('finance.reports.index', ['from' => '2026-01-01', 'to' => '2026-10-20']))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('limited', true)->where('filters.to', '2026-10-20'));

        $this->get(route('finance.dashboard'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Finance/Dashboard/index')->has('months', 6)->has('recent_days', 1));
    }
}
