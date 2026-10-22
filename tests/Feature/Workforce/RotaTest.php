<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\Shift;
use App\Models\Workforce\StaffingRule;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** The manager assigns shifts; each person accepts or asks for a change. */
class RotaTest extends TestCase
{
    use RefreshDatabase;

    private RotaService $rota;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    private User $keeper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-17 09:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->rota = app(RotaService::class);
        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->second = $this->user('seller', $store->id);
        $this->keeper = $this->user('stock_keeper', $store->id);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => $d === 0, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function shift(User $who, string $from, string $to, string $duty = 'none', ?StockLocation $site = null): Shift
    {
        return $this->rota->save($site ?? $this->site, $this->manager, [
            'user_id' => $who->id,
            'starts_at' => "2026-10-19 {$from}",
            'ends_at' => "2026-10-19 {$to}",
            'duty' => $duty,
        ]);
    }

    #[Test]
    public function a_draft_is_hidden_until_published_then_accepted(): void
    {
        $shift = $this->shift($this->seller, '08:30', '14:00');

        $this->assertCount(0, $this->rota->upcomingFor($this->seller));

        $this->assertSame(1, $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25')));
        $this->assertCount(1, $this->rota->upcomingFor($this->seller));
        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->seller->fresh()))->firstWhere('id', 'accept-shifts'));
        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'unaccepted-shifts'));

        $this->rota->accept($shift->fresh(), $this->seller);
        $this->assertSame(Shift::STATUS_ACCEPTED, $shift->fresh()->status);
        $this->assertNull(collect(app(TaskInbox::class)->for($this->seller->fresh()))->firstWhere('id', 'accept-shifts'));
    }

    #[Test]
    public function one_person_cannot_have_two_shifts_at_once_even_at_another_site(): void
    {
        $this->shift($this->seller, '08:30', '14:00');

        $hub = StockLocation::factory()->remoteHubFor(Store::query()->findOrFail($this->site->store_id))->create();

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('already works');
        $this->shift($this->seller, '13:00', '18:00', 'none', $hub);
    }

    #[Test]
    public function editing_an_accepted_shift_sends_it_back_to_accept(): void
    {
        $shift = $this->shift($this->seller, '08:30', '14:00');
        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));
        $this->rota->accept($shift->fresh(), $this->seller);

        $this->rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19 09:00', 'ends_at' => '2026-10-19 15:00'], $shift->fresh());

        $this->assertSame(Shift::STATUS_PUBLISHED, $shift->fresh()->status);
        $this->assertNull($shift->fresh()->accepted_at);
    }

    #[Test]
    public function a_change_request_reaches_the_manager(): void
    {
        $shift = $this->shift($this->seller, '08:30', '14:00');
        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));

        $this->rota->requestChange($shift->fresh(), $this->seller, 'Doctor in the morning');

        $this->assertSame(Shift::STATUS_CHANGE_REQUESTED, $shift->fresh()->status);
        $task = collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'shift-changes');
        $this->assertTrue($task['urgent']);

        $this->expectException(WorkforceException::class);
        $this->rota->accept($shift->fresh(), $this->second);
    }

    #[Test]
    public function the_opening_duty_names_the_opener_once_published_and_cancel_clears_it(): void
    {
        $shift = $this->shift($this->seller, '08:30', '14:00', Shift::DUTY_OPENER);
        $days = app(SiteDayService::class);

        $this->assertNull($days->day($this->site, CarbonImmutable::parse('2026-10-19'))->opener_id, 'A draft names nobody yet.');

        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));
        $this->assertSame($this->seller->id, $days->day($this->site, CarbonImmutable::parse('2026-10-19'))->opener_id);

        $this->rota->cancel($shift->fresh(), $this->manager);
        $this->assertNull($days->day($this->site, CarbonImmutable::parse('2026-10-19'))->opener_id);
    }

    #[Test]
    public function a_seller_cannot_make_the_rota_and_a_main_hub_has_none(): void
    {
        try {
            $this->rota->save($this->site, $this->seller, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19 08:30', 'ends_at' => '2026-10-19 14:00']);
            $this->fail('A seller made a shift.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }

        $admin = $this->user('admin', null);
        $hub = StockLocation::factory()->mainHub()->create();

        $this->expectException(WorkforceException::class);
        $this->rota->save($hub, $admin, ['user_id' => $admin->id, 'starts_at' => '2026-10-19 08:30', 'ends_at' => '2026-10-19 14:00']);
    }

    #[Test]
    public function coverage_shows_where_fewer_people_overlap_than_the_rule_needs(): void
    {
        StaffingRule::query()->create([
            'stock_location_id' => $this->site->id,
            'weekdays' => [1],
            'starts_at' => '10:00',
            'ends_at' => '14:00',
            'role' => StaffingRule::ROLE_SELLER,
            'min_people' => 2,
        ]);

        $this->shift($this->seller, '08:30', '13:00');
        $this->shift($this->second, '11:00', '19:00');
        // A stock keeper is not a seller.
        $this->shift($this->keeper, '08:30', '19:00');

        $gaps = $this->rota->coverage($this->site, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));

        $this->assertSame([
            ['date' => '2026-10-19', 'from' => '10:00', 'to' => '11:00', 'role' => 'seller', 'have' => 1, 'need' => 2],
            ['date' => '2026-10-19', 'from' => '13:00', 'to' => '14:00', 'role' => 'seller', 'have' => 1, 'need' => 2],
        ], $gaps);

        $this->assertSame(2, collect(app(TaskInbox::class)->for($this->manager->fresh()))->firstWhere('id', 'coverage-gaps')['count']);
    }

    #[Test]
    public function copying_last_week_makes_drafts_a_week_on(): void
    {
        $this->shift($this->seller, '08:30', '14:00');

        $copied = $this->rota->copyWeek($this->site, $this->manager, CarbonImmutable::parse('2026-10-26'));

        $this->assertSame(1, $copied);
        $this->assertSame('2026-10-26 08:30', Shift::query()->latest('id')->first()->starts_at->format('Y-m-d H:i'));
    }

    #[Test]
    public function the_calendar_shows_my_sent_shift_and_the_manager_sees_the_draft_too(): void
    {
        $sent = $this->shift($this->seller, '08:30', '14:00');
        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));
        $this->rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-20 08:30', 'ends_at' => '2026-10-20 14:00']);

        $range = [CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-25 23:59:59')];

        $mine = app(CalendarFeed::class)->between(CalendarScope::for('seller', $this->seller), ...[...$range, ['shifts']]);
        $this->assertSame(["shift:{$sent->id}"], array_column($mine, 'id'));
        $this->assertSame('My shift 08:30–14:00', $mine[0]['title']);

        $managers = app(CalendarFeed::class)->between(CalendarScope::for('seller', $this->manager), ...[...$range, ['shifts']]);
        $this->assertCount(2, $managers);
    }

    #[Test]
    public function the_rota_page_is_for_managers(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $this->shift($this->seller, '08:30', '14:00');

        $this->actingAs($this->manager)->withServerVariables($host)
            ->get(route('seller.work.rota', ['site' => $this->site, 'week' => '2026-10-21']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Work/Rota')->where('week', '2026-10-19')->has('shifts', 1)->has('days', 7));

        $this->actingAs($this->seller)->withServerVariables($host)
            ->get(route('seller.work.rota', ['site' => $this->site]))
            ->assertForbidden();

        $this->actingAs($this->manager)->withServerVariables($host)
            ->post(route('seller.work.rota.publish', $this->site), ['week' => '2026-10-19'])
            ->assertSessionHas('success', '1 shift(s) sent. Each person accepts theirs in My work.');
    }

    #[Test]
    public function the_rota_is_made_and_answered_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $as = fn (User $user) => $this->actingAs($user)->withServerVariables($host);

        $as($this->manager)->post(route('seller.work.shifts.store', $this->site), ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19T08:30', 'ends_at' => '2026-10-19T14:00'])
            ->assertSessionHas('success', 'Shift added (a draft until you publish).');
        $shift = Shift::query()->sole();

        $as($this->manager)->put(route('seller.work.shifts.update', $shift), ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19T08:30', 'ends_at' => '2026-10-19T15:00'])
            ->assertSessionHas('success', 'Shift saved.');
        $this->assertSame('15:00', $shift->fresh()->ends_at->format('H:i'));

        $as($this->manager)->post(route('seller.work.shifts.store', $this->site), ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19T15:00', 'ends_at' => '2026-10-19T14:00'])
            ->assertSessionHasErrors('ends_at');
        $as($this->seller)->post(route('seller.work.shifts.store', $this->site), ['user_id' => $this->second->id, 'starts_at' => '2026-10-20T08:30', 'ends_at' => '2026-10-20T14:00'])
            ->assertForbidden();

        $second = $this->shift($this->second, '10:00', '19:00');
        $this->rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));

        $as($this->seller)->post(route('seller.work.shifts.accept', $shift))->assertSessionHas('success', 'Shift accepted.');
        $this->assertSame(Shift::STATUS_ACCEPTED, $shift->fresh()->status);
        $as($this->seller)->post(route('seller.work.shifts.accept', $second))->assertForbidden();

        $as($this->second)->post(route('seller.work.shifts.change', $second), ['note' => ''])->assertSessionHasErrors('note');
        $as($this->second)->post(route('seller.work.shifts.change', $second), ['note' => 'Clinic in the morning'])
            ->assertSessionHas('success', 'Sent to your manager.');
        $this->assertSame(Shift::STATUS_CHANGE_REQUESTED, $second->fresh()->status);

        $as($this->manager)->post(route('seller.work.shifts.cancel', $second))->assertSessionHas('success', 'Shift cancelled.');
        $this->assertSame(Shift::STATUS_CANCELLED, $second->fresh()->status);

        $as($this->manager)->post(route('seller.work.rota.copy', $this->site), ['week' => '2026-10-26'])
            ->assertSessionHas('success', '1 shift(s) copied from last week as drafts.');
        $as($this->seller)->post(route('seller.work.rota.copy', $this->site), ['week' => '2026-10-26'])->assertForbidden();
    }

    #[Test]
    public function the_manager_saves_staffing_rules_over_http(): void
    {
        $host = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $rule = ['weekdays' => [1, 2, 2], 'starts_at' => '08:30', 'ends_at' => '12:00', 'role' => StaffingRule::ROLES[0], 'min_people' => 2];

        $this->actingAs($this->manager)->withServerVariables($host)
            ->put(route('seller.work.staffing-rules', $this->site), ['rules' => [$rule]])
            ->assertSessionHas('success', 'Staffing rules saved.');
        $saved = StaffingRule::query()->sole();
        $this->assertSame([1, 2], $saved->weekdays);
        $this->assertSame(2, (int) $saved->min_people);

        $this->actingAs($this->manager)->withServerVariables($host)
            ->put(route('seller.work.staffing-rules', $this->site), ['rules' => [['ends_at' => '08:00'] + $rule]])
            ->assertSessionHasErrors('rules.0.ends_at');

        $this->actingAs($this->seller)->withServerVariables($host)
            ->put(route('seller.work.staffing-rules', $this->site), ['rules' => []])
            ->assertForbidden();

        // Saving none clears them.
        $this->actingAs($this->manager)->withServerVariables($host)
            ->put(route('seller.work.staffing-rules', $this->site), ['rules' => []])
            ->assertSessionHas('success');
        $this->assertSame(0, StaffingRule::query()->count());
    }
}
