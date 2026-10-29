<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\DayBook;
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
 * The time filter on lists: it narrows finished work to a store's business day,
 * never hides work still open, and sales outside open hours have a view of their own.
 */
class TimeFilterTest extends TestCase
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
        foreach (['admin', 'seller', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->seller->assignRole('seller');
        $manager = User::factory()->create(['role' => 'store_manager', 'store_id' => $this->store->id]);
        $manager->assignRole('store_manager');
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $manager, $this->seller, 'First holder');

        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $admin->assignRole('admin');
        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost'])->actingAs($admin, 'web');
    }

    private function at(string $wallClock): void
    {
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    private function openDay(string $open, string $close): void
    {
        $token = app(CounterQr::class)->printedToken($this->site);
        $this->at($open);
        app(SiteDayService::class)->open($this->site, $this->seller, $token);
        $this->at($close);
        app(SiteDayService::class)->close($this->site, $this->seller, $token, [], null);
    }

    private function sale(string $wallClock, string $stage = Sale::STAGE_DELIVERED): Sale
    {
        $this->at($wallClock);

        return Sale::query()->create([
            'store_id' => $this->store->id,
            'total_amount' => 100,
            'reference_number' => 'TF-'.(++$this->reference),
            'fulfillment_stage' => $stage,
        ]);
    }

    /** @return list<string> the references the admin orders list shows */
    private function listed(string $query): array
    {
        $refs = [];
        $this->get(route('admin.orders.index').'?'.$query)->assertOk()->assertInertia(function (Assert $page) use (&$refs): void {
            $refs = collect($page->toArray()['props']['orders'])->pluck('reference')->sort()->values()->all();
        });

        return $refs;
    }

    #[Test]
    public function today_narrows_finished_orders_to_the_business_day_but_never_hides_open_ones(): void
    {
        $this->openDay('2026-10-19 08:30', '2026-10-19 19:00');
        $yesterdayDone = $this->sale('2026-10-19 10:00');
        $yesterdayOpen = $this->sale('2026-10-19 11:00', Sale::STAGE_AWAITING_PAYMENT);
        $this->openDay('2026-10-20 08:30', '2026-10-20 19:00');
        $todayDone = $this->sale('2026-10-20 10:00');
        $night = $this->sale('2026-10-20 23:00'); // closed by then: outside open hours

        $this->at('2026-10-20 20:00');

        $this->assertSame([$yesterdayOpen->reference_number, $todayDone->reference_number], $this->listed('when=today'));
        $this->assertSame([$yesterdayDone->reference_number, $yesterdayOpen->reference_number], $this->listed('when=yesterday'));
        $this->assertCount(4, $this->listed('when=all'));

        // Outside open hours is strict: only what came while the store was closed.
        $this->assertSame([$night->reference_number], $this->listed('when=outside'));
    }

    #[Test]
    public function rows_are_tagged_with_their_business_day(): void
    {
        $this->openDay('2026-10-19 08:30', '2026-10-19 19:00');
        $inside = $this->sale('2026-10-19 10:00');
        $outside = $this->sale('2026-10-19 22:00');
        $this->at('2026-10-20 12:00');

        $book = app(DayBook::class);
        $this->assertSame('Yesterday', $book->tag($this->store->id, $inside->created_at)['label']);
        $this->assertFalse($book->tag($this->store->id, $inside->created_at)['outside']);
        $this->assertSame('Outside open hours', $book->tag($this->store->id, $outside->created_at)['label']);
        $this->assertTrue($book->tag($this->store->id, $outside->created_at)['outside']);
        $this->assertSame('Yesterday', $book->dateLabel('2026-10-19'));
        $this->assertSame('Sunday, Oct 18', $book->dateLabel('2026-10-18'));
    }

    #[Test]
    public function the_dashboard_shows_each_stores_day_side_by_side(): void
    {
        $this->openDay('2026-10-19 08:30', '2026-10-19 19:00');
        $this->sale('2026-10-19 10:00');
        $this->sale('2026-10-19 22:00'); // outside open hours
        $this->at('2026-10-20 07:00');

        $rows = [];
        $this->get(route('admin.dashboard'))->assertOk()->assertInertia(function (Assert $page) use (&$rows): void {
            $page->loadDeferredProps(function (Assert $loaded) use (&$rows): void {
                $rows = $loaded->toArray()['props']['shopDays'];
            });
        });

        $row = collect($rows)->firstWhere('store', 'Bole Store');
        $this->assertNotNull($row);
        $this->assertFalse($row['open']);
        $this->assertNull($row['today'], 'Not opened yet today.');
        $this->assertSame(1, $row['yesterday']['orders']);
        $this->assertSame(1, $row['outside_orders']);
        $this->assertSame(SiteDay::STATUS_CLOSED, $row['yesterday']['status']);
    }

    #[Test]
    public function people_with_no_store_day_filter_on_addis_calendar_dates(): void
    {
        $late = $this->sale('2026-10-19 23:30');
        $early = $this->sale('2026-10-20 01:00'); // still the 19th in UTC
        $this->at('2026-10-20 12:00');

        $time = app(\App\Services\Workforce\TimeFilter::class);
        $refs = fn (string $when) => $time->applyCalendar(Sale::query(), 'sales.created_at', ['when' => $when, 'date' => null])->pluck('reference_number')->all();

        $this->assertSame([$early->reference_number], $refs('today'));
        $this->assertSame([$late->reference_number], $refs('yesterday'));
        $this->assertCount(2, $refs('week'));
        $this->assertCount(2, $refs('outside'), 'Means nothing without a store day: narrows nothing.');
    }

    #[Test]
    public function the_dashboard_cards_count_their_facts_over_the_chosen_period(): void
    {
        $this->sale('2026-10-19 10:00'); // delivered yesterday
        $this->at('2026-10-20 09:00');

        $facts = function (string $query): array {
            $orders = [];
            $this->get(route('admin.dashboard').$query)->assertOk()->assertInertia(function (Assert $page) use (&$orders): void {
                $page->loadDeferredProps(function (Assert $loaded) use (&$orders): void {
                    $orders = collect($loaded->toArray()['props']['areas'])->firstWhere('key', 'orders');
                });
            });

            return collect($orders['facts'] ?? [])->mapWithKeys(fn ($fact) => [$fact['label'] => $fact['value']])->all();
        };

        $this->assertSame(0, $facts('')['Delivered · today']);
        $this->assertSame(1, $facts('?when=yesterday')['Delivered · yesterday']);
        $this->assertSame(1, $facts('?when=week')['Delivered · last 7 days']);
        $this->assertArrayHasKey('Delivered · today', $facts('?when=outside'), 'No business-day view across stores: back to today.');
    }
}
