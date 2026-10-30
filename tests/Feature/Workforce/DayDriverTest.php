<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffRide;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use App\Services\Workforce\SwapService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Each site day has a driver next to its opener and closer: the plan makes the
 * opener's pick-up and the closer's ride home, keeps them in step, and only that
 * driver takes them. Without a driver, opening and closing go ahead, flagged.
 */
class DayDriverTest extends TestCase
{
    use RefreshDatabase;

    private SiteDayService $days;

    private StaffRideService $rides;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    private User $driver;

    private User $otherDriver;

    private Vehicle $car;

    private string $today = '2026-10-19';

    protected function setUp(): void
    {
        parent::setUp();

        // A Monday, early: the store opens 08:30, so the pick-up is at 07:45.
        $this->travelTo(CarbonImmutable::parse('2026-10-19 06:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->days = app(SiteDayService::class);
        $this->rides = app(StaffRideService::class);

        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->seller->update(['home_area' => 'Bole Bulbula']);
        $this->second = $this->user('seller', $store->id);
        $this->driver = $this->user('delivery', null, true);
        $this->otherDriver = $this->user('delivery', null, true);
        $this->car = Vehicle::factory()->create(['name' => 'Hiace', 'status' => Vehicle::STATUS_ACTIVE]);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => $d === 0, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');
    }

    private function user(string $role, ?int $storeId, bool $driver = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_driver' => $driver]);
        $user->assignRole($role);

        return $user;
    }

    private function plan(?int $opener, ?int $closer, ?int $driver, ?string $date = null): SiteDay
    {
        return $this->days->plan($this->site, LocalTime::day($date ?? $this->today), $this->manager, $opener, $closer, $driver);
    }

    private function runOf(SiteDay $day, string $purpose): ?StaffRide
    {
        return $this->rides->plannedFor($day->fresh())->get($purpose);
    }

    #[Test]
    public function the_plan_makes_the_pick_up_and_the_ride_home_for_its_driver(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id);

        $pickup = $this->runOf($day, StaffRide::PURPOSE_OPENING);
        $home = $this->runOf($day, StaffRide::PURPOSE_CLOSING);

        $this->assertSame('2026-10-19T07:45', LocalTime::wall($pickup->departs_at));
        $this->assertSame('2026-10-19T19:00', LocalTime::wall($home->departs_at));
        $this->assertSame([$this->driver->id, $this->driver->id], [(int) $pickup->driver_id, (int) $home->driver_id]);
        $this->assertSame(StaffRide::STATUS_REQUESTED, $pickup->status);
        $this->assertSame([$this->seller->id], $pickup->riders()->pluck('user_id')->all());
        $this->assertSame('Bole Bulbula', $pickup->riders()->value('drop_off'));
        $this->assertSame([$this->second->id], $home->riders()->pluck('user_id')->all());

        // The driver's bell has both runs; the day's card shows them.
        $tasks = collect(app(TaskInbox::class)->for($this->driver->fresh()));
        $this->assertNotNull($tasks->firstWhere('id', "drive-{$pickup->id}"));
        $this->assertNotNull($tasks->firstWhere('id', "drive-{$home->id}"));
        $card = $this->days->present($this->site, $day->fresh(), $this->manager);
        $this->assertSame($this->driver->id, $card['driver']['id']);
        $this->assertCount(2, $card['rides']);
    }

    #[Test]
    public function only_a_driver_drives_and_only_the_planned_one_takes_the_run(): void
    {
        try {
            $this->plan($this->seller->id, null, $this->second->id);
            $this->fail('A seller was planned as the driver.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('driver', $e->getMessage());
        }

        $pickup = $this->runOf($this->plan($this->seller->id, null, $this->driver->id), StaffRide::PURPOSE_OPENING);

        // Not in the other driver's pool, and refused if they try.
        $this->assertFalse($this->rides->forDriver($this->otherDriver)->contains('id', $pickup->id));
        $this->assertFalse($this->rides->present($pickup, $this->otherDriver)['can']['claim']);
        try {
            $this->rides->claim($pickup, $this->otherDriver, $this->car);
            $this->fail('Another driver took a planned run.');
        } catch (WorkforceException) {
        }

        $this->assertTrue($this->rides->present($pickup, $this->driver)['can']['claim']);
        $this->rides->claim($pickup, $this->driver, $this->car);
        $this->assertSame(StaffRide::STATUS_CLAIMED, $pickup->fresh()->status);
    }

    #[Test]
    public function the_runs_follow_the_plan_until_they_set_off(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $pickup = $this->runOf($day, StaffRide::PURPOSE_OPENING);
        $this->rides->claim($pickup, $this->driver, $this->car);

        // A new driver: the taken run goes back to them, to pick the car.
        $this->plan($this->seller->id, $this->second->id, $this->otherDriver->id);
        $pickup->refresh();
        $this->assertSame([StaffRide::STATUS_REQUESTED, $this->otherDriver->id, null], [$pickup->status, (int) $pickup->driver_id, $pickup->vehicle_id]);

        // A new closer rides home instead.
        $this->plan($this->seller->id, $this->manager->id, $this->otherDriver->id);
        $this->assertSame([$this->manager->id], $this->runOf($day, StaffRide::PURPOSE_CLOSING)->riders()->pluck('user_id')->all());

        // No driver: both runs are called off.
        $this->plan($this->seller->id, $this->manager->id, null);
        $this->assertNull($this->runOf($day, StaffRide::PURPOSE_OPENING));
        $this->assertNull($this->runOf($day, StaffRide::PURPOSE_CLOSING));
        $this->assertSame(2, StaffRide::query()->where('site_day_id', $day->id)->where('status', StaffRide::STATUS_CANCELLED)->count());

        // A Sunday (closed): no runs at all.
        $sunday = $this->plan($this->seller->id, $this->second->id, $this->driver->id, '2026-10-25');
        $this->assertSame(0, StaffRide::query()->where('site_day_id', $sunday->id)->count());
    }

    #[Test]
    public function without_a_driver_it_still_opens_and_closes_but_flagged(): void
    {
        $this->plan($this->seller->id, $this->seller->id, null);
        $tasks = collect(app(TaskInbox::class)->for($this->manager->fresh()));
        $this->assertNotNull($tasks->firstWhere('id', 'sites-no-driver'));

        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:25:00'));
        $printed = app(CounterQr::class)->printedToken($this->site);
        $day = $this->days->open($this->site, $this->seller, $printed);
        $this->assertTrue($day->fresh()->no_driver);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 19:00:00'));
        $this->days->close($this->site, $this->seller, $printed);
        $this->assertTrue($day->fresh()->no_driver);
        $this->assertSame(SiteDay::STATUS_CLOSED, $day->fresh()->status);
    }

    #[Test]
    public function brought_in_by_the_driver_it_opens_unflagged(): void
    {
        $pickup = $this->runOf($this->plan($this->seller->id, $this->second->id, $this->driver->id), StaffRide::PURPOSE_OPENING);
        $this->travelTo(CarbonImmutable::parse('2026-10-19 07:45:00'));
        $this->rides->claim($pickup, $this->driver, $this->car);
        $this->rides->depart($pickup->fresh(), $this->driver);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:25:00'));
        $day = $this->days->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));
        $this->assertFalse($day->fresh()->no_driver);
        $this->assertNull(collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'sites-no-driver'));
    }

    #[Test]
    public function the_plan_follows_a_shift_given_away_or_cancelled(): void
    {
        $rota = app(RotaService::class);
        $shift = $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-20T08:30', 'ends_at' => '2026-10-20T15:00']);
        $rota->publish($this->site, $this->manager, LocalTime::day('2026-10-19'), LocalTime::day('2026-10-26'));
        $day = $this->plan($this->seller->id, null, $this->driver->id, '2026-10-20');

        // Given to a colleague: they open, and the driver picks them up instead.
        $swaps = app(SwapService::class);
        $swap = $swaps->offer($shift->fresh(), $this->seller, $this->second);
        $swaps->take($swap, $this->second);
        $swaps->approve($swap->fresh(), $this->manager);
        $this->assertSame($this->second->id, (int) $day->fresh()->opener_id);
        $this->assertSame([$this->second->id], $this->runOf($day, StaffRide::PURPOSE_OPENING)->riders()->pluck('user_id')->all());

        // Cancelled: nobody opens, so there is no pick-up.
        $rota->cancel($shift->fresh(), $this->manager);
        $this->assertNull($day->fresh()->opener_id);
        $this->assertNull($this->runOf($day, StaffRide::PURPOSE_OPENING));
    }

    #[Test]
    public function planning_on_the_rota_page_clears_an_old_shift_duty(): void
    {
        $rota = app(RotaService::class);
        $shift = $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-20T08:30', 'ends_at' => '2026-10-20T15:00', 'duty' => Shift::DUTY_OPENER]);
        $rota->publish($this->site, $this->manager, LocalTime::day('2026-10-19'), LocalTime::day('2026-10-26'));

        $day = $this->plan($this->second->id, null, null, '2026-10-20');
        $this->assertSame(Shift::DUTY_NONE, $shift->fresh()->duty);

        // Editing the shift later does not put the old opener back.
        $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-20T09:00', 'ends_at' => '2026-10-20T15:00'], $shift->fresh());
        $this->assertSame($this->second->id, (int) $day->fresh()->opener_id);
    }

    #[Test]
    public function the_rota_page_carries_each_days_plan_and_a_main_hub_gets_the_plan_only(): void
    {
        $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->manager)->get(route('seller.work.rota', ['site' => $this->site, 'week' => $this->today]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Work/Rota')
                ->where('site.has_shifts', true)
                ->where('days.0.plan.driver.id', $this->driver->id)
                ->where('days.0.plan.editable', true)
                ->has('drivers', 2));

        $hub = StockLocation::factory()->mainHub()->create();
        $admin = $this->user('admin', null);
        $this->actingAs($admin)->get(route('seller.work.rota', ['site' => $hub, 'week' => $this->today]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('site.has_shifts', false)->where('shifts', [])->has('days', 7));
    }

    #[Test]
    public function giving_back_a_planned_run_keeps_it_with_the_planned_driver(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $pickup = $this->runOf($day, StaffRide::PURPOSE_OPENING);

        $this->rides->claim($pickup, $this->driver, $this->car);
        $this->rides->release($pickup->fresh(), $this->driver);

        $pickup->refresh();
        $this->assertSame(StaffRide::STATUS_REQUESTED, $pickup->status);
        $this->assertSame($this->driver->id, (int) $pickup->driver_id);
        $this->assertNull($pickup->vehicle_id);

        // Still not in another driver's pool.
        $this->assertFalse($this->rides->forDriver($this->otherDriver)->contains('id', $pickup->id));
    }

    #[Test]
    public function my_work_turns_each_persons_part_of_the_plan_into_jobs_and_drops_opening_once_open(): void
    {
        $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $this->plan($this->second->id, null, null, '2026-10-21');
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->seller)->get(route('seller.work'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Work/Index')
                ->has('duties', 1)
                ->where('duties.0.my_roles', ['opener'])
                ->where('duties.0.is_today', true)
                ->where('duties.0.i_hold_key', true)
                ->where('vehicles', []));

        // The closer: today's closing, and the opening two days later (not today's).
        $this->actingAs($this->second)->get(route('seller.work'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('duties', 2)
                ->where('duties.0.my_roles', ['closer'])
                ->where('duties.1.my_roles', ['opener'])
                ->where('duties.1.is_today', false));

        // Opening done: the opener has nothing left that day, the closer still closes.
        $token = app(CounterQr::class)->printedToken($this->site);
        $this->days->open($this->site, $this->seller, $token);
        $this->assertSame([], app(SiteDayService::class)->dutiesFor($this->seller)->all());
        $this->assertSame(['closer'], app(SiteDayService::class)->dutiesFor($this->second)->first()['my_roles']);
    }

    #[Test]
    public function a_driver_takes_their_runs_from_any_app_with_the_cars_listed(): void
    {
        // A seller who also drives: the cars come with My work and Staff rides on the seller app.
        $this->seller->update(['is_driver' => true]);
        $this->plan($this->second->id, $this->second->id, $this->seller->id);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->seller)->get(route('seller.work'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('vehicles', 1)
                ->where('duties.0.my_roles', ['driver'])
                ->has('driving', 2));

        $this->actingAs($this->seller)->get(route('seller.work.rides'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('vehicles', 1)
                ->where('rides', fn ($rides) => collect($rides)->where('can.claim', true)->count() === 2));
    }

    #[Test]
    public function a_manager_sees_the_week_ahead_with_who_opens_closes_and_drives(): void
    {
        $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->manager)->get(route('seller.work'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('weekPlan', 1)
                ->has('weekPlan.0.days', 7)
                ->where('weekPlan.0.days.0.date', $this->today)
                ->where('weekPlan.0.days.0.opener', trim($this->seller->first_name.' '.$this->seller->last_name))
                ->where('weekPlan.0.days.1.opener', null)
                // Sunday the 25th is a closed day.
                ->where('weekPlan.0.days.6.status', SiteDay::STATUS_CLOSED_DAY));

        $this->actingAs($this->seller)->get(route('seller.work'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('weekPlan', []));
    }

    #[Test]
    public function a_main_hubs_own_stock_keepers_work_there_and_can_be_planned(): void
    {
        $hub = StockLocation::factory()->mainHub()->create();
        $keeper = $this->user('stock_keeper', null);
        $storeKeeper = $this->user('stock_keeper', $this->site->store_id);
        $admin = $this->user('admin', null);
        $sites = app(Sites::class);

        $this->assertTrue($sites->worksAt($keeper, $hub));
        $this->assertFalse($sites->worksAt($storeKeeper, $hub));
        $this->assertTrue($sites->people($hub)->contains('id', $keeper->id));

        $day = $this->days->plan($hub, LocalTime::day($this->today), $admin, $keeper->id, $keeper->id, null);
        $this->assertSame($keeper->id, (int) $day->opener_id);
    }

    #[Test]
    public function copying_last_week_copies_who_opens_closes_and_drives_into_days_nobody_planned(): void
    {
        // Last week: Monday the 12th planned in full, Tuesday the 13th an opener only.
        $this->travelTo(CarbonImmutable::parse('2026-10-12 05:00:00'));
        $this->plan($this->seller->id, $this->second->id, $this->driver->id, '2026-10-12');
        $this->plan($this->second->id, null, null, '2026-10-13');
        $this->travelTo(CarbonImmutable::parse('2026-10-19 06:00:00'));

        // This Tuesday already has a closer: it keeps it, and only gains the opener.
        $this->plan(null, $this->seller->id, null, '2026-10-20');
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->manager)->post(route('seller.work.rota.copy', ['site' => $this->site, 'week' => $this->today]))
            ->assertSessionHas('success', fn (string $message): bool => str_contains($message, 'copied into 2 day(s)'));

        $monday = SiteDay::query()->where('stock_location_id', $this->site->id)->whereDate('date', '2026-10-19')->first();
        $tuesday = SiteDay::query()->where('stock_location_id', $this->site->id)->whereDate('date', '2026-10-20')->first();
        $this->assertSame([$this->seller->id, $this->second->id, $this->driver->id], [(int) $monday->opener_id, (int) $monday->closer_id, (int) $monday->driver_id]);
        $this->assertSame([$this->second->id, $this->seller->id, null], [(int) $tuesday->opener_id, (int) $tuesday->closer_id, $tuesday->driver_id]);
        // The plan made Monday's runs.
        $this->assertNotNull($this->runOf($monday, StaffRide::PURPOSE_OPENING));

        // A driver who no longer drives is not copied.
        $this->driver->update(['is_driver' => false]);
        $this->travelTo(CarbonImmutable::parse('2026-10-26 05:00:00'));
        $this->actingAs($this->manager)->post(route('seller.work.rota.copy', ['site' => $this->site, 'week' => '2026-10-26']));
        $next = SiteDay::query()->where('stock_location_id', $this->site->id)->whereDate('date', '2026-10-26')->first();
        $this->assertSame($this->seller->id, (int) $next->opener_id);
        $this->assertNull($next->driver_id);
    }

    #[Test]
    public function copied_shifts_carry_no_old_duty_that_would_overwrite_the_plan(): void
    {
        $rota = app(RotaService::class);
        $this->travelTo(CarbonImmutable::parse('2026-10-12 05:00:00'));
        $old = $rota->save($this->site, $this->manager, ['user_id' => $this->second->id, 'starts_at' => '2026-10-12T08:00', 'ends_at' => '2026-10-12T16:00', 'duty' => Shift::DUTY_OPENER]);
        $this->assertSame(Shift::DUTY_OPENER, $old->duty);
        $this->travelTo(CarbonImmutable::parse('2026-10-19 06:00:00'));

        $this->plan($this->seller->id, null, null);
        $rota->copyWeek($this->site, $this->manager, LocalTime::day($this->today));
        $copy = Shift::query()->where('user_id', $this->second->id)->where('starts_at', '>=', LocalTime::startOf($this->today))->sole();
        $this->assertSame(Shift::DUTY_NONE, $copy->duty);

        $rota->publish($this->site, $this->manager, LocalTime::day($this->today), LocalTime::day($this->today)->addDays(6));
        $this->assertSame($this->seller->id, (int) SiteDay::query()->where('stock_location_id', $this->site->id)->whereDate('date', $this->today)->value('opener_id'));
    }

    #[Test]
    public function approved_leave_takes_the_person_off_the_plan_even_with_no_shift_and_they_cannot_be_planned_while_away(): void
    {
        $leave = app(\App\Services\Workforce\LeaveService::class);
        // Tomorrow: the seller opens and the driver drives, neither has a shift.
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id, '2026-10-20');
        $this->assertNotNull($this->runOf($day, StaffRide::PURPOSE_OPENING));

        // A global admin records the driver's leave (the driver works at no site of the store manager's);
        // the manager records the seller's.
        $leave->record($this->user('admin', null), $this->driver, 'annual', LocalTime::day('2026-10-20'), LocalTime::day('2026-10-20'));
        $leave->record($this->manager, $this->seller, 'sick', LocalTime::day('2026-10-20'), LocalTime::day('2026-10-21'));

        $day->refresh();
        $this->assertNull($day->opener_id);
        $this->assertSame($this->second->id, (int) $day->closer_id);
        $this->assertNull($day->driver_id);
        $this->assertNull($this->runOf($day, StaffRide::PURPOSE_OPENING), 'No driver: the runs are called off.');

        try {
            $this->plan($this->seller->id, null, null, '2026-10-21');
            $this->fail('Planned someone on leave.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('on leave that day', $e->getMessage());
        }
    }
}
