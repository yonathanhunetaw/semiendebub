<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\Shift;
use App\Models\Workforce\TimeEntry;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Clock in and out with the counter's live code; the opener and closer are
 * clocked by opening and closing; the sweep closes forgotten clock-ins.
 */
class AttendanceTest extends TestCase
{
    use RefreshDatabase;

    private AttendanceService $attendance;

    private SiteDayService $days;

    private CounterQr $qr;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    private User $keeper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-19 07:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->attendance = app(AttendanceService::class);
        $this->days = app(SiteDayService::class);
        $this->qr = app(CounterQr::class);

        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->second = $this->user('seller', $store->id);
        $this->keeper = $this->user('stock_keeper', $store->id);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => $d === 0, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');

        $rota = app(RotaService::class);
        $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19 08:30', 'ends_at' => '2026-10-19 14:00', 'duty' => Shift::DUTY_OPENER]);
        $rota->save($this->site, $this->manager, ['user_id' => $this->second->id, 'starts_at' => '2026-10-19 10:00', 'ends_at' => '2026-10-19 19:00', 'duty' => Shift::DUTY_CLOSER]);
        $rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function live(): string
    {
        return $this->qr->liveToken($this->site);
    }

    private function open(string $at = '08:25'): void
    {
        $this->travelTo(CarbonImmutable::parse("2026-10-19 {$at}:00"));
        $this->days->open($this->site, $this->seller, $this->qr->printedToken($this->site));
    }

    #[Test]
    public function opening_clocks_in_the_opener_against_their_shift_and_flags_a_late_open(): void
    {
        $this->open('08:40');

        $entry = TimeEntry::query()->where('user_id', $this->seller->id)->sole();
        $this->assertSame(TimeEntry::METHOD_OPENING, $entry->in_method);
        $this->assertNotNull($entry->shift_id);
        $this->assertSame([TimeEntry::FLAG_LATE], $entry->flags);
    }

    #[Test]
    public function nobody_clocks_in_before_the_site_opens_or_with_the_printed_qr(): void
    {
        try {
            $this->attendance->clockIn($this->second, $this->site, $this->live());
            $this->fail('Clocked in to a closed site.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('not open yet', $e->getMessage());
        }

        $this->open();

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('printed QR only opens');
        $this->attendance->clockIn($this->second, $this->site, $this->qr->printedToken($this->site));
    }

    #[Test]
    public function the_live_code_clocks_in_once_and_without_a_shift_it_is_flagged(): void
    {
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:02:00'));

        $entry = $this->attendance->clockIn($this->second, $this->site, $this->live());
        $this->assertSame([], $entry->flags);

        $keeper = $this->attendance->clockIn($this->keeper, $this->site, $this->live());
        $this->assertSame([TimeEntry::FLAG_UNSCHEDULED], $keeper->flags);

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('already clocked in');
        $this->attendance->clockIn($this->second, $this->site, $this->live());
    }

    #[Test]
    public function leaving_early_is_flagged(): void
    {
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:00:00'));

        $entry = $this->attendance->clockOut($this->seller, $this->site, $this->live());

        $this->assertSame([TimeEntry::FLAG_EARLY_LEAVE], $entry->flags);
        $this->assertSame(TimeEntry::METHOD_QR, $entry->out_method);
    }

    #[Test]
    public function closing_waits_for_everyone_unless_the_closer_clocks_them_out(): void
    {
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:00:00'));
        $this->attendance->clockIn($this->second, $this->site, $this->live());

        $this->travelTo(CarbonImmutable::parse('2026-10-19 19:00:00'));

        try {
            $this->days->close($this->site, $this->second, $this->live());
            $this->fail('Closed with someone still clocked in.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString($this->seller->first_name, $e->getMessage());
        }

        $this->days->close($this->site, $this->second, $this->live(), [], null, null, null, true);

        $this->assertSame(0, TimeEntry::query()->open()->count());
        $this->assertSame(2, TimeEntry::query()->where('out_method', TimeEntry::METHOD_CLOSING)->count());
        $this->assertStringContainsString('closed the site', (string) TimeEntry::query()->where('user_id', $this->seller->id)->value('note'));
    }

    #[Test]
    public function the_sweep_closes_a_forgotten_clock_in_at_closing_time_for_the_manager_to_check(): void
    {
        $this->open();

        $this->travelTo(CarbonImmutable::parse('2026-10-19 20:30:00'));
        $this->assertSame(0, $this->attendance->autoClose());

        $this->travelTo(CarbonImmutable::parse('2026-10-19 21:00:00'));
        $this->assertSame(1, $this->attendance->autoClose());

        $entry = TimeEntry::query()->sole();
        $this->assertSame('2026-10-19 19:00', $entry->clock_out_at->format('Y-m-d H:i'));
        $this->assertTrue($entry->hasFlag(TimeEntry::FLAG_AUTO_CLOSED));

        $task = collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'clock-review');
        $this->assertSame(1, $task['count']);

        $this->attendance->fix($this->manager, $entry, CarbonImmutable::parse('2026-10-19 08:25'), CarbonImmutable::parse('2026-10-19 14:05'), 'Left after her shift');

        $entry->refresh();
        $this->assertTrue($entry->hasFlag(TimeEntry::FLAG_FIXED));
        $this->assertSame(340, $entry->minutes());
        $this->assertNull(collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'clock-review'));
    }

    #[Test]
    public function the_person_is_told_to_clock_out_after_their_shift(): void
    {
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 14:45:00'));

        $this->assertTrue(collect(app(TaskInbox::class)->for($this->seller->fresh()))->firstWhere('id', 'still-clocked-in')['urgent']);
    }

    #[Test]
    public function a_seller_cannot_clock_others_in_by_hand(): void
    {
        $this->open();

        $this->expectException(WorkforceException::class);
        $this->attendance->managerClockIn($this->seller, $this->second, $this->site, null, 'helping');
    }

    #[Test]
    public function clocking_and_attendance_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:00:00'));

        $this->actingAs($this->second)->withServerVariables($host)
            ->get(route('seller.work.clock', [$this->site, $this->live()]))
            ->assertInertia(fn ($page) => $page->where('code', 'live')->where('my_entry', null)->has('still_in', 1));

        $this->actingAs($this->second)->withServerVariables($host)
            ->post(route('seller.work.clock-in', $this->site), ['token' => $this->live()])
            ->assertSessionHas('success', 'Clocked in at 10:00.');

        // Clocked in, so they may show the counter screen.
        $this->actingAs($this->second)->withServerVariables($host)->get(route('seller.work.sites.counter', $this->site))->assertOk();

        $this->actingAs($this->manager)->withServerVariables($host)
            ->get(route('seller.work.attendance', ['site' => $this->site]))
            ->assertInertia(fn ($page) => $page->component('Work/Attendance')->has('here', 2)->has('entries', 2));

        $this->actingAs($this->second)->withServerVariables($host)
            ->get(route('seller.work.attendance', ['site' => $this->site]))
            ->assertForbidden();
    }

    #[Test]
    public function a_day_at_the_counter_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $as = fn (User $user) => $this->actingAs($user)->withServerVariables($host);
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:00:00'));
        $this->attendance->clockIn($this->second, $this->site, $this->live());

        $as($this->manager)->getJson(route('seller.work.sites.counter.code', $this->site))
            ->assertOk()->assertJsonPath('open', true)->assertJsonStructure(['url', 'seconds_left', 'open']);
        $as($this->keeper)->getJson(route('seller.work.sites.counter.code', $this->site))->assertForbidden();

        $as($this->seller)->post(route('seller.work.break.start'))->assertSessionHas('success', 'On a break. End it in My work.');
        $as($this->seller)->post(route('seller.work.break.start'))->assertSessionHas('error', 'You are already on a break.');
        $this->travelTo(CarbonImmutable::parse('2026-10-19 10:30:00'));
        $as($this->seller)->post(route('seller.work.break.end'))->assertSessionHas('success', 'Back from the break.');
        $as($this->seller)->post(route('seller.work.break.end'))->assertSessionHas('error', 'You are not on a break.');
        $this->actingAs($this->keeper)->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')])
            ->post(route('stock_keeper.work.break.start'))->assertSessionHas('error', 'Clock in first.');

        $this->travelTo(CarbonImmutable::parse('2026-10-19 14:00:00'));
        $as($this->seller)->post(route('seller.work.clock-out', $this->site), ['token' => $this->live()])
            ->assertSessionHas('success', 'Clocked out at 14:00.');
        $as($this->seller)->post(route('seller.work.clock-out', $this->site), [])->assertSessionHasErrors('token');

        $this->travelTo(CarbonImmutable::parse('2026-10-19 19:00:00'));
        $as($this->second)->post(route('seller.work.sites.close', $this->site), ['token' => 'not-a-code'])->assertSessionHas('error');
        $as($this->second)->post(route('seller.work.sites.close', $this->site), ['token' => $this->live(), 'ticked' => [], 'till_count' => 1200, 'difference_note' => 'No float was recorded'])
            ->assertSessionHas('success', "{$this->site->name} is closed.");
        $this->assertSame(0, TimeEntry::query()->open()->count());
    }

    #[Test]
    public function a_manager_clocks_people_and_fixes_times_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $as = fn (User $user) => $this->actingAs($user)->withServerVariables($host);
        $this->open();
        $this->travelTo(CarbonImmutable::parse('2026-10-19 11:00:00'));

        $as($this->manager)->post(route('seller.work.attendance.clock-in', $this->site), ['user_id' => $this->keeper->id])
            ->assertSessionHasErrors('note');
        $as($this->seller)->post(route('seller.work.attendance.clock-in', $this->site), ['user_id' => $this->keeper->id, 'note' => 'Phone dead'])
            ->assertForbidden();
        $as($this->manager)->post(route('seller.work.attendance.clock-in', $this->site), ['user_id' => $this->keeper->id, 'note' => 'Phone dead'])
            ->assertSessionHas('success', "{$this->keeper->first_name} clocked in.");
        $entry = TimeEntry::query()->where('user_id', $this->keeper->id)->sole();
        $this->assertSame(TimeEntry::METHOD_MANAGER, $entry->in_method);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 13:00:00'));
        $as($this->seller)->post(route('seller.work.time-entries.clock-out', $entry), ['note' => 'Went home'])->assertForbidden();
        $as($this->manager)->post(route('seller.work.time-entries.clock-out', $entry), ['note' => 'Went home'])
            ->assertSessionHas('success', 'Clocked out.');
        $as($this->manager)->post(route('seller.work.time-entries.clock-out', $entry), ['note' => 'Again'])
            ->assertSessionHas('error', 'Already clocked out. Fix the times instead.');

        $as($this->manager)->put(route('seller.work.time-entries.fix', $entry), ['clock_in_at' => '2026-10-19T12:00', 'clock_out_at' => '2026-10-19T11:00', 'note' => 'x'])
            ->assertSessionHasErrors('clock_out_at');
        $as($this->manager)->put(route('seller.work.time-entries.fix', $entry), ['clock_in_at' => '2026-10-19T11:00', 'clock_out_at' => '2026-10-19T12:30', 'note' => 'Right times'])
            ->assertSessionHas('success', 'Times fixed.');
        $entry->refresh();
        $this->assertTrue($entry->hasFlag(TimeEntry::FLAG_FIXED));
        $this->assertSame(90, $entry->minutes());

        $as($this->seller)->post(route('seller.work.time-entries.review', $entry))->assertForbidden();
        $entry->update(['reviewed_at' => null]);
        $as($this->manager)->post(route('seller.work.time-entries.review', $entry))->assertSessionHas('success', 'Marked as looked at.');
        $this->assertSame($this->manager->id, (int) $entry->fresh()->reviewed_by);
    }
}
