<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\SwapService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Leave (asked, approved by someone else, cancels shifts) and swaps (offer → take → approve). */
class LeaveAndSwapTest extends TestCase
{
    use RefreshDatabase;

    private LeaveService $leave;

    private SwapService $swaps;

    private RotaService $rota;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-17 09:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->leave = app(LeaveService::class);
        $this->swaps = app(SwapService::class);
        $this->rota = app(RotaService::class);

        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->second = $this->user('seller', $store->id);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function sentShift(User $who, string $day = '2026-10-20', string $duty = 'none'): Shift
    {
        $shift = $this->rota->save($this->site, $this->manager, ['user_id' => $who->id, 'starts_at' => "{$day} 08:30", 'ends_at' => "{$day} 14:00", 'duty' => $duty]);
        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse($day), CarbonImmutable::parse($day));

        return $shift->fresh();
    }

    #[Test]
    public function approved_leave_cancels_the_shifts_and_blocks_new_ones(): void
    {
        $shift = $this->sentShift($this->seller);
        $request = $this->leave->request($this->seller, 'annual', CarbonImmutable::parse('2026-10-20'), CarbonImmutable::parse('2026-10-22'), 'Family');

        $this->assertSame(1, collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'leave-requests')['count']);

        $this->assertSame(1, $this->leave->approve($request, $this->manager));
        $this->assertSame(Shift::STATUS_CANCELLED, $shift->fresh()->status);
        $this->assertTrue($this->leave->onLeave($this->seller->id, CarbonImmutable::parse('2026-10-21')));

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('on leave');
        $this->rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-21 08:30', 'ends_at' => '2026-10-21 14:00']);
    }

    #[Test]
    public function nobody_approves_their_own_leave_and_a_seller_approves_nobodys(): void
    {
        $admin = $this->user('admin', null);
        $own = $this->leave->request($this->manager, 'annual', CarbonImmutable::parse('2026-10-25'), CarbonImmutable::parse('2026-10-26'));

        try {
            $this->leave->approve($own, $this->manager);
            $this->fail('Approved own leave.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }

        // The store manager's own leave goes to a global admin.
        $this->leave->approve($own, $admin);
        $this->assertSame(LeaveRequest::STATUS_APPROVED, $own->fresh()->status);

        $theirs = $this->leave->request($this->second, 'annual', CarbonImmutable::parse('2026-10-25'), CarbonImmutable::parse('2026-10-26'));

        $this->expectException(WorkforceException::class);
        $this->leave->approve($theirs, $this->seller);
    }

    #[Test]
    public function overlapping_leave_and_turning_down_without_a_reason_are_refused(): void
    {
        $request = $this->leave->request($this->seller, 'annual', CarbonImmutable::parse('2026-10-20'), CarbonImmutable::parse('2026-10-22'));

        try {
            $this->leave->request($this->seller, 'unpaid', CarbonImmutable::parse('2026-10-22'), CarbonImmutable::parse('2026-10-23'));
            $this->fail('Overlapping leave was accepted.');
        } catch (WorkforceException) {
        }

        try {
            $this->leave->reject($request, $this->manager, '');
            $this->fail('Turned down without a reason.');
        } catch (WorkforceException) {
        }

        $this->leave->reject($request, $this->manager, 'Inventory week');
        $this->assertSame(LeaveRequest::STATUS_REJECTED, $request->fresh()->status);
    }

    #[Test]
    public function a_manager_records_sick_leave_and_the_opening_duty_is_freed(): void
    {
        $this->sentShift($this->seller, '2026-10-17', Shift::DUTY_OPENER);
        $this->assertSame($this->seller->id, app(SiteDayService::class)->day($this->site, now())->opener_id);

        $result = $this->leave->record($this->manager, $this->seller, 'sick', CarbonImmutable::today(), CarbonImmutable::today(), 'Called in');

        $this->assertSame(LeaveRequest::STATUS_APPROVED, $result['leave']->status);
        $this->assertSame(1, $result['cancelled']);
        $this->assertNull(app(SiteDayService::class)->day($this->site, now())->opener_id);
    }

    #[Test]
    public function a_swap_needs_the_colleague_then_a_manager_and_moves_the_duty(): void
    {
        $shift = $this->sentShift($this->seller, '2026-10-20', Shift::DUTY_OPENER);
        $swap = $this->swaps->offer($shift, $this->seller, $this->second, 'Wedding');

        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->second->fresh()))->firstWhere('id', 'swap-offers'));

        try {
            $this->swaps->approve($swap, $this->manager);
            $this->fail('Approved before the colleague took it.');
        } catch (WorkforceException) {
        }

        $this->swaps->take($swap, $this->second);
        $this->assertSame(1, collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'swap-approvals')['count']);
        $this->assertSame($this->seller->id, $shift->fresh()->user_id, 'Still theirs until a manager approves.');

        $this->swaps->approve($swap, $this->manager);

        $shift->refresh();
        $this->assertSame($this->second->id, $shift->user_id);
        $this->assertSame(Shift::STATUS_ACCEPTED, $shift->status);
        $this->assertSame($this->second->id, app(SiteDayService::class)->day($this->site, CarbonImmutable::parse('2026-10-20'))->opener_id);
        $this->assertSame(ShiftSwap::STATUS_APPROVED, $swap->fresh()->status);
    }

    #[Test]
    public function a_swap_to_someone_already_working_then_is_refused(): void
    {
        $shift = $this->sentShift($this->seller);
        $this->rota->save($this->site, $this->manager, ['user_id' => $this->second->id, 'starts_at' => '2026-10-20 12:00', 'ends_at' => '2026-10-20 18:00']);

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('already works');
        $this->swaps->offer($shift, $this->seller, $this->second);
    }

    #[Test]
    public function editing_the_shift_drops_its_open_swap(): void
    {
        $shift = $this->sentShift($this->seller);
        $swap = $this->swaps->offer($shift, $this->seller, $this->second);

        $this->rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 14:00'], $shift);

        $this->assertSame(ShiftSwap::STATUS_CANCELLED, $swap->fresh()->status);
    }

    #[Test]
    public function leave_shows_on_the_calendar_and_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];

        $this->actingAs($this->seller)->withServerVariables($host)
            ->post(route('seller.work.leave.store'), ['type' => 'annual', 'starts_on' => '2026-10-20', 'ends_on' => '2026-10-21'])
            ->assertSessionHas('success');

        $leave = LeaveRequest::query()->sole();

        $this->actingAs($this->manager)->withServerVariables($host)->get(route('seller.work.team'))
            ->assertInertia(fn ($page) => $page->component('Work/Team')->where('leave.0.id', $leave->id));

        $this->actingAs($this->manager)->withServerVariables($host)->post(route('seller.work.leave.approve', $leave), [])->assertSessionHas('success', 'Approved.');

        $events = app(CalendarFeed::class)->between(CalendarScope::for('seller', $this->manager), CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25'), ['shifts']);
        $this->assertSame($this->seller->first_name.' on leave', collect($events)->firstWhere('id', "leave:{$leave->id}")['title']);

        $this->actingAs($this->seller)->withServerVariables($host)->get(route('seller.work.team'))->assertForbidden();
    }
}
