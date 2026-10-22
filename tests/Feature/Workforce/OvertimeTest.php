<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\PublicHoliday;
use App\Models\Workforce\TimeEntry;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\HoursReport;
use App\Services\Workforce\OvertimeService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Overtime: past the normal day, split by day and night; every minute on the
 * rest day or a holiday; approved by a manager who is someone else.
 */
class OvertimeTest extends TestCase
{
    use RefreshDatabase;

    private OvertimeService $overtime;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-24 09:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->overtime = app(OvertimeService::class);
        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->admin = $this->user('admin', null);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    /** A closed clock row (times on the shops' clock, UTC in tests), with optional breaks. */
    private function worked(User $who, string $in, string $out, array $breaks = []): TimeEntry
    {
        $entry = TimeEntry::query()->create([
            'user_id' => $who->id,
            'stock_location_id' => $this->site->id,
            'clock_in_at' => $in,
            'clock_out_at' => $out,
            'in_method' => TimeEntry::METHOD_QR,
            'out_method' => TimeEntry::METHOD_QR,
            'flags' => [],
        ]);

        foreach ($breaks as [$from, $to]) {
            $entry->breaks()->create(['started_at' => $from, 'ended_at' => $to]);
        }

        return $entry;
    }

    #[Test]
    public function the_hours_past_eight_are_overtime_split_by_day_and_night(): void
    {
        // Monday 14:00 → 23:30 with a 30 min break: 9 h worked, 1 h over: 22:30–23:30, all night.
        $this->worked($this->seller, '2026-10-19 14:00', '2026-10-19 23:30', [['2026-10-19 18:00', '2026-10-19 18:30']]);

        $day = $this->overtime->day($this->seller->id, '2026-10-19');

        $this->assertSame(540, $day['worked']);
        $this->assertSame(60, $day['overtime']);
        $this->assertSame(['day' => 0, 'night' => 60, 'rest_day' => 0, 'holiday' => 0], $day['minutes']);
        $this->assertSame(1.75, $day['weighted_hours']);
        $this->assertSame('pending', $day['status']);
        $this->assertSame(0, $day['paid_minutes']);
    }

    #[Test]
    public function every_minute_on_the_rest_day_or_a_holiday_is_overtime(): void
    {
        $this->worked($this->seller, '2026-10-18 09:00', '2026-10-18 13:00'); // Sunday
        $this->assertSame(['day' => 0, 'night' => 0, 'rest_day' => 240, 'holiday' => 0], $this->overtime->day($this->seller->id, '2026-10-18')['minutes']);

        PublicHoliday::query()->create(['date' => '2026-10-20', 'name' => 'Test holiday']);
        $this->worked($this->seller, '2026-10-20 09:00', '2026-10-20 11:00');
        $day = $this->overtime->day($this->seller->id, '2026-10-20');
        $this->assertSame(120, $day['minutes']['holiday']);
        $this->assertSame(5.0, $day['weighted_hours']);
    }

    #[Test]
    public function a_manager_approves_and_a_change_in_the_clock_asks_again(): void
    {
        $entry = $this->worked($this->seller, '2026-10-19 08:00', '2026-10-19 18:00'); // 2 h over, by day

        $this->assertSame(1, collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'overtime-to-approve')['count']);

        $this->overtime->approve($this->manager, $this->seller, '2026-10-19', 'Stock count');
        $day = $this->overtime->day($this->seller->id, '2026-10-19');
        $this->assertSame('approved', $day['status']);
        $this->assertSame(120, $day['paid_minutes']);
        $this->assertSame(3.0, $day['paid_weighted_hours']);

        $entry->update(['clock_out_at' => '2026-10-19 19:00']);
        $this->assertSame('pending', $this->overtime->day($this->seller->id, '2026-10-19')['status']);
    }

    #[Test]
    public function nobody_approves_their_own_overtime_and_turning_it_down_needs_a_reason(): void
    {
        $this->worked($this->manager, '2026-10-19 08:00', '2026-10-19 18:00');

        try {
            $this->overtime->approve($this->manager, $this->manager, '2026-10-19');
            $this->fail('Approved own overtime.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }

        try {
            $this->overtime->reject($this->admin, $this->manager, '2026-10-19', '');
            $this->fail('Turned down without a reason.');
        } catch (WorkforceException) {
        }

        $this->overtime->reject($this->admin, $this->manager, '2026-10-19', 'Not asked for');
        $this->assertSame('rejected', $this->overtime->day($this->manager->id, '2026-10-19')['status']);
    }

    #[Test]
    public function only_a_global_admin_changes_the_rules_and_without_approval_it_is_paid(): void
    {
        $rules = ['daily_hours' => 8, 'rate_day' => 1.5, 'rate_night' => 1.75, 'rate_rest_day' => 2, 'rate_holiday' => 2.5,
            'night_from' => '22:00', 'night_to' => '06:00', 'rest_weekday' => 0, 'needs_approval' => false];

        try {
            $this->overtime->saveSettings($this->manager, $rules);
            $this->fail('A store manager changed the rules.');
        } catch (WorkforceException) {
        }

        $this->overtime->saveSettings($this->admin, $rules);
        $this->worked($this->seller, '2026-10-19 08:00', '2026-10-19 17:00');

        $day = $this->overtime->day($this->seller->id, '2026-10-19');
        $this->assertSame('not_needed', $day['status']);
        $this->assertSame(60, $day['paid_minutes']);
    }

    #[Test]
    public function the_hours_csv_carries_overtime_and_the_attendance_page_lets_the_manager_decide(): void
    {
        $this->worked($this->seller, '2026-10-19 08:00', '2026-10-19 18:00');
        $this->overtime->approve($this->manager, $this->seller, '2026-10-19');

        $row = collect(app(HoursReport::class)->summary(collect([$this->site]), CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25')))
            ->firstWhere(0, trim($this->seller->first_name.' '.$this->seller->last_name));
        $this->assertSame(2.0, $row[7]);   // overtime hours
        $this->assertSame(2.0, $row[8]);   // paid
        $this->assertSame(3.0, $row[9]);   // pay hours (2 × 1.5)
        $this->assertSame(0.0, $row[10]);  // waiting

        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $this->actingAs($this->manager)->withServerVariables($host)
            ->get(route('seller.work.attendance', ['site' => $this->site, 'week' => '2026-10-19']))
            ->assertInertia(fn ($page) => $page->where('overtime.0.status', 'approved')->where('overtime.0.can_decide', true));

        $this->actingAs($this->seller)->withServerVariables($host)
            ->post(route('seller.work.overtime.approve'), ['user_id' => $this->seller->id, 'date' => '2026-10-19'])
            ->assertForbidden();

        $this->actingAs($this->manager)->withServerVariables($host)->get(route('seller.work.overtime'))
            ->assertInertia(fn ($page) => $page->component('Work/Overtime')->where('canEdit', false)->where('rules.daily_hours', 8));
    }

    #[Test]
    public function the_global_admin_sets_rules_and_holidays_over_http(): void
    {
        $admin = ['HTTP_HOST' => 'admin.'.config('app.system_domain')];
        $seller = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $rules = ['daily_hours' => 7.5, 'rate_day' => 1.5, 'rate_night' => 1.75, 'rate_rest_day' => 2, 'rate_holiday' => 2.5,
            'night_from' => '22:00', 'night_to' => '06:00', 'rest_weekday' => 0, 'needs_approval' => true];

        $this->actingAs($this->admin)->withServerVariables($admin)
            ->put(route('admin.work.overtime.save'), ['night_to' => '22:00'] + $rules)
            ->assertSessionHasErrors('night_to');
        $this->actingAs($this->admin)->withServerVariables($admin)
            ->put(route('admin.work.overtime.save'), $rules)
            ->assertSessionHas('success', 'Overtime rules saved.');
        $this->assertSame(450, (int) $this->overtime->settings()->daily_minutes);
        $this->actingAs($this->manager)->withServerVariables($seller)
            ->put(route('seller.work.overtime.save'), $rules)
            ->assertForbidden();

        $this->actingAs($this->admin)->withServerVariables($admin)
            ->post(route('admin.work.holidays.store'), ['date' => '2026-11-01', 'name' => '  Test day '])
            ->assertSessionHas('success', 'Holiday saved.');
        $holiday = PublicHoliday::query()->sole();
        $this->assertSame('Test day', $holiday->name);
        $this->actingAs($this->manager)->withServerVariables($seller)
            ->post(route('seller.work.holidays.store'), ['date' => '2026-11-02', 'name' => 'Mine'])
            ->assertForbidden();

        $this->actingAs($this->manager)->withServerVariables($seller)
            ->delete(route('seller.work.holidays.destroy', $holiday))
            ->assertForbidden();
        $this->actingAs($this->admin)->withServerVariables($admin)
            ->delete(route('admin.work.holidays.destroy', $holiday))
            ->assertSessionHas('success', 'Holiday removed.');
        $this->assertSame(0, PublicHoliday::query()->count());
    }

    #[Test]
    public function the_manager_turns_overtime_down_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $this->worked($this->seller, '2026-10-19 08:00', '2026-10-19 18:00');

        $this->actingAs($this->manager)->withServerVariables($host)
            ->post(route('seller.work.overtime.reject'), ['user_id' => $this->seller->id, 'date' => '2026-10-19'])
            ->assertSessionHas('error');
        $this->actingAs($this->seller)->withServerVariables($host)
            ->post(route('seller.work.overtime.reject'), ['user_id' => $this->seller->id, 'date' => '2026-10-19', 'note' => 'No'])
            ->assertForbidden();
        $this->actingAs($this->manager)->withServerVariables($host)
            ->post(route('seller.work.overtime.reject'), ['user_id' => $this->seller->id, 'date' => '2026-10-19', 'note' => 'Not asked for'])
            ->assertSessionHas('success', 'Overtime not paid.');

        $this->assertSame('rejected', $this->overtime->day($this->seller->id, '2026-10-19')['status']);
    }
}
