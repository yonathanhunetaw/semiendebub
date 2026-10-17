<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteHourException;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Opening and closing at the counter: the QR proves you are there, the key
 * proves you may open, the sweep flags late openings, closing hands the key on.
 */
class SiteDayTest extends TestCase
{
    use RefreshDatabase;

    private SiteDayService $days;

    private CounterQr $qr;

    private KeyCustodyService $keys;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $keeper;

    protected function setUp(): void
    {
        parent::setUp();

        // A Monday morning.
        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->days = app(SiteDayService::class);
        $this->qr = app(CounterQr::class);
        $this->keys = app(KeyCustodyService::class);

        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->keeper = $this->user('stock_keeper', $store->id);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => $d === 0, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $this->keys->force($this->keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function printed(): string
    {
        return $this->qr->printedToken($this->site);
    }

    #[Test]
    public function the_key_holder_opens_with_the_printed_qr(): void
    {
        $day = $this->days->open($this->site, $this->seller, $this->printed(), ['Cash float counted'], 500.0);

        $this->assertSame(SiteDay::STATUS_OPEN, $day->status);
        $this->assertSame($this->seller->id, $day->opened_by);
        $this->assertFalse($day->opened_without_key);
        $this->assertEquals(500, $day->float_amount);
        $this->assertTrue(collect($day->open_checklist)->firstWhere('item', 'Cash float counted')['done']);
        $this->assertFalse(collect($day->open_checklist)->firstWhere('item', 'Shelves and floor tidy')['done']);
    }

    #[Test]
    public function without_the_key_a_seller_cannot_open(): void
    {
        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('do not hold the key');

        $this->days->open($this->site, $this->keeper, $this->printed());
    }

    #[Test]
    public function a_manager_without_the_key_opens_only_with_a_note_and_it_is_flagged(): void
    {
        try {
            $this->days->open($this->site, $this->manager, $this->printed());
            $this->fail('Opened without a note.');
        } catch (WorkforceException) {
        }

        $day = $this->days->open($this->site, $this->manager, $this->printed(), [], null, 'Spare key from the owner');

        $this->assertTrue($day->opened_without_key);
        $this->assertSame('Spare key from the owner', $day->open_note);
    }

    #[Test]
    public function a_live_code_expires_after_a_few_minutes_and_a_voided_print_stops_working(): void
    {
        $live = $this->qr->liveToken($this->site);
        $this->assertSame(CounterQr::KIND_LIVE, $this->qr->verify($this->site, $live));

        $this->travel(2)->minutes();
        $this->assertSame(CounterQr::KIND_LIVE, $this->qr->verify($this->site, $live));

        $this->travel(2)->minutes();
        $this->assertNull($this->qr->verify($this->site, $live));

        $printed = $this->printed();
        $this->qr->reprint($this->site);
        $this->assertNull($this->qr->verify($this->site, $printed));
        $this->assertNull($this->qr->verify($this->site, 'pnot-a-real-code'));

        $this->expectException(WorkforceException::class);
        $this->days->open($this->site, $this->seller, $printed);
    }

    #[Test]
    public function closing_hands_the_key_to_the_next_opener(): void
    {
        $this->days->plan($this->site, CarbonImmutable::parse('2026-10-20'), $this->manager, $this->keeper->id, null);
        $this->days->open($this->site, $this->seller, $this->printed());

        $this->travelTo(CarbonImmutable::parse('2026-10-19 19:05:00'));
        $day = $this->days->close($this->site, $this->seller, $this->qr->liveToken($this->site), ['Till counted'], 12000.0, null, $this->keeper);

        $this->assertSame(SiteDay::STATUS_CLOSED, $day->status);
        $this->assertEquals(12000, $day->till_count);

        $handover = KeyHandover::query()->where('status', KeyHandover::STATUS_CLAIMED)->sole();
        $this->assertSame($this->keeper->id, $handover->to_id);
        $this->assertSame('closing', $handover->reason);
    }

    #[Test]
    public function a_site_cannot_be_closed_before_it_opens_or_opened_twice(): void
    {
        try {
            $this->days->close($this->site, $this->seller, $this->printed());
            $this->fail('Closed a site that was not open.');
        } catch (WorkforceException) {
        }

        $this->days->open($this->site, $this->seller, $this->printed());

        $this->expectException(WorkforceException::class);
        $this->days->open($this->site, $this->seller, $this->printed());
    }

    #[Test]
    public function the_sweep_marks_a_late_opening_missed_and_the_manager_is_told(): void
    {
        $this->days->plan($this->site, CarbonImmutable::today(), $this->manager, $this->seller->id, null);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:40:00'));
        $this->assertSame(0, $this->days->sweep());

        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:46:00'));
        $this->assertSame(1, $this->days->sweep());
        $this->assertSame(SiteDay::STATUS_MISSED, $this->days->day($this->site, now())->status);

        $managerTasks = collect(app(TaskInbox::class)->for($this->manager->fresh()));
        $this->assertTrue($managerTasks->firstWhere('id', 'sites-not-open')['urgent']);

        $sellerTasks = collect(app(TaskInbox::class)->for($this->seller->fresh()));
        $this->assertNotNull($sellerTasks->firstWhere('id', "open-site-{$this->site->id}"));

        // Late, but it can still be opened.
        $this->assertSame(SiteDay::STATUS_OPEN, $this->days->open($this->site, $this->seller, $this->printed())->status);
    }

    #[Test]
    public function a_holiday_is_a_closed_day_and_is_never_missed(): void
    {
        SiteHourException::query()->create(['stock_location_id' => $this->site->id, 'date' => '2026-10-19', 'closed' => true, 'note' => 'Holiday']);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:00:00'));
        $this->assertSame(0, $this->days->sweep());
        $this->assertSame(SiteDay::STATUS_CLOSED_DAY, $this->days->day($this->site, now())->status);
    }

    #[Test]
    public function the_key_holder_is_told_to_hand_it_to_tomorrows_opener(): void
    {
        $this->days->plan($this->site, CarbonImmutable::parse('2026-10-20'), $this->manager, $this->keeper->id, null);
        $this->days->open($this->site, $this->seller, $this->printed());

        $open = collect(app(TaskInbox::class)->for($this->seller->fresh()));
        $this->assertNull($open->firstWhere('id', "pass-key-{$this->site->id}"), 'The key is needed while the site is open.');

        $this->days->close($this->site, $this->seller, $this->printed());

        $closed = collect(app(TaskInbox::class)->for($this->seller->fresh()));
        $this->assertStringContainsString($this->keeper->first_name, $closed->firstWhere('id', "pass-key-{$this->site->id}")['detail']);
    }

    #[Test]
    public function the_calendar_shows_each_open_day_and_the_closed_sunday(): void
    {
        $scope = CalendarScope::for('seller', $this->seller);
        $events = collect(app(CalendarFeed::class)->between($scope, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25 23:59:59'), ['site_days']));

        $this->assertCount(7, $events);
        $this->assertSame('Bole Store 08:30–19:00', $events->firstWhere('id', "site-day:{$this->site->id}:2026-10-19")['title']);
        $this->assertSame('closed_day', $events->firstWhere('id', "site-day:{$this->site->id}:2026-10-25")['kind']);
    }

    #[Test]
    public function the_clock_page_and_counter_screen_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];

        $this->actingAs($this->seller)->withServerVariables($host)
            ->get(route('seller.work.clock', [$this->site, $this->printed()]))
            ->assertInertia(fn ($page) => $page->component('Work/Clock')->where('code', 'printed')->where('day.status', 'planned'));

        $this->actingAs($this->seller)->withServerVariables($host)
            ->post(route('seller.work.sites.open', $this->site), ['token' => $this->printed(), 'ticked' => []])
            ->assertSessionHas('success');

        // The opener sees the counter screen; another seller does not.
        $this->actingAs($this->seller)->withServerVariables($host)->get(route('seller.work.sites.counter', $this->site))->assertOk();
        $other = $this->user('seller', $this->seller->store_id);
        $this->actingAs($other)->withServerVariables($host)->get(route('seller.work.sites.counter', $this->site))->assertForbidden();

        $this->get(route('clock.relay', [$this->site->id, 'abc']))
            ->assertInertia(fn ($page) => $page->component('Work/ClockRelay')->has('apps', 3));
    }
}
