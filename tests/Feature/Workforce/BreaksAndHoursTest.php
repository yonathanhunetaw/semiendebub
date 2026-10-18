<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\TimeEntry;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\HoursReport;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Breaks come off worked time; the hours download adds it up per person. */
class BreaksAndHoursTest extends TestCase
{
    use RefreshDatabase;

    private AttendanceService $attendance;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-19 08:25:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->attendance = app(AttendanceService::class);
        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->second = $this->user('seller', $store->id);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');

        $rota = app(RotaService::class);
        $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19 08:30', 'ends_at' => '2026-10-19 16:30']);
        $rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));

        app(SiteDayService::class)->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    #[Test]
    public function a_break_comes_off_worked_time_and_clocking_out_ends_it(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:00:00'));
        $this->attendance->startBreak($this->seller);

        try {
            $this->attendance->startBreak($this->seller);
            $this->fail('Two breaks at once.');
        } catch (WorkforceException) {
        }

        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:45:00'));
        $this->attendance->endBreak($this->seller);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 15:00:00'));
        $this->attendance->startBreak($this->seller);

        $this->travelTo(CarbonImmutable::parse('2026-10-19 15:15:00'));
        $entry = $this->attendance->clockOut($this->seller, $this->site, app(CounterQr::class)->liveToken($this->site));

        $entry = TimeEntry::query()->with('breaks')->findOrFail($entry->id);
        $this->assertSame(410, $entry->minutes());
        $this->assertSame(60, $entry->breakMinutes());
        $this->assertSame(350, $entry->workedMinutes());
        $this->assertNotNull($entry->breaks->last()->ended_at, 'Clocking out ended the open break.');
    }

    #[Test]
    public function no_break_without_being_clocked_in(): void
    {
        $this->expectException(WorkforceException::class);
        $this->attendance->startBreak($this->second);
    }

    #[Test]
    public function the_hours_summary_adds_worked_time_flags_and_leave(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:00:00'));
        $this->attendance->startBreak($this->seller);
        $this->travelTo(CarbonImmutable::parse('2026-10-19 12:30:00'));
        $this->attendance->endBreak($this->seller);
        $this->travelTo(CarbonImmutable::parse('2026-10-19 16:25:00'));
        $this->attendance->clockOut($this->seller, $this->site, app(CounterQr::class)->liveToken($this->site));

        app(LeaveService::class)->record($this->manager, $this->second, 'sick', CarbonImmutable::parse('2026-10-20'), CarbonImmutable::parse('2026-10-21'));

        $rows = collect(app(HoursReport::class)->summary(collect([$this->site]), CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25')))
            ->keyBy(0);

        $seller = $rows[trim($this->seller->first_name.' '.$this->seller->last_name)];
        $this->assertSame(1, $seller[3]);      // days worked
        $this->assertSame(7.5, $seller[4]);    // 08:25–16:25 less 30 min
        $this->assertSame(0.5, $seller[5]);    // break hours
        $this->assertSame(8.0, $seller[6]);    // planned
        $this->assertSame(0, $seller[11]);     // not late: in at 08:25 for 08:30
        $this->assertSame(0, $seller[12]);     // not early: out at 16:25, within 5 minutes of 16:30

        $second = $rows[trim($this->second->first_name.' '.$this->second->last_name)];
        $this->assertSame(2, $second[16]);     // sick days
    }

    #[Test]
    public function the_csv_downloads_for_the_manager_only(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];

        $response = $this->actingAs($this->manager)->withServerVariables($host)
            ->get(route('seller.work.hours.site', ['site' => $this->site, 'from' => '2026-10-19', 'to' => '2026-10-25']));

        $response->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $this->assertStringContainsString('Person,Role,Sites', $response->getContent());
        $this->assertStringContainsString($this->seller->first_name, $response->getContent());

        $this->actingAs($this->manager)->withServerVariables($host)
            ->get(route('seller.work.hours.all', ['from' => '2026-10-19', 'to' => '2026-10-25', 'detail' => 1]))
            ->assertOk();

        $this->actingAs($this->seller)->withServerVariables($host)
            ->get(route('seller.work.hours.site', ['site' => $this->site, 'from' => '2026-10-19', 'to' => '2026-10-25']))
            ->assertForbidden();
    }
}
