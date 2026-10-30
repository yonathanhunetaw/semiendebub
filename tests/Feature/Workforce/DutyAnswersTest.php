<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteDayAnswer;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The opener, closer and driver say whether they will do it: yes, or no with a
 * reason. The manager sees it on the Rota, the week ahead and the dashboard,
 * and a "no" in the bell. The bell also asks for tomorrow's answer and, from
 * the evening before, reminds an accepted opener where the key is.
 */
class DutyAnswersTest extends TestCase
{
    use RefreshDatabase;

    private SiteDayService $days;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    private User $driver;

    private string $today = '2026-10-19';

    private string $tomorrow = '2026-10-20';

    protected function setUp(): void
    {
        parent::setUp();

        // A Monday morning (the suite's shop clock is UTC).
        $this->travelTo(CarbonImmutable::parse('2026-10-19 06:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->days = app(SiteDayService::class);
        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->second = $this->user('seller', $store->id);
        $this->driver = $this->user('delivery', null, true);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => $d === 0, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());
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

    /** @return \Illuminate\Support\Collection<int, array<string, mixed>> */
    private function bell(User $user): \Illuminate\Support\Collection
    {
        return collect(app(TaskInbox::class)->for($user->fresh()));
    }

    #[Test]
    public function an_answer_counts_only_while_its_person_holds_the_duty(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id);

        $this->days->answer($day, $this->seller, 'opener', true);
        $this->days->answer($day, $this->driver, 'driver', true);

        $card = $this->days->present($this->site, $day->fresh(), $this->manager);
        $this->assertSame('yes', $card['answers']['opener']['answer']);
        $this->assertNull($card['answers']['closer']);
        $this->assertSame('yes', $card['answers']['driver']['answer']);

        // Someone else opens now: the old "yes" no longer counts, and theirs replaces it.
        $day = $this->plan($this->second->id, $this->second->id, $this->driver->id);
        $this->assertNull($this->days->answersOf($day->fresh())['opener']);
        $this->days->answer($day->fresh(), $this->second, 'opener', false, 'At the clinic until 10');
        $this->assertSame(1, SiteDayAnswer::query()->where('site_day_id', $day->id)->where('duty', 'opener')->count());
        $this->assertSame('At the clinic until 10', $this->days->answersOf($day->fresh())['opener']['note']);
    }

    #[Test]
    public function only_the_named_person_answers_a_no_needs_a_reason_and_a_done_job_has_nothing_to_answer(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, null);

        foreach ([
            fn () => $this->days->answer($day, $this->second, 'opener', true),
            fn () => $this->days->answer($day, $this->seller, 'opener', false, '  '),
            fn () => $this->days->answer($day, $this->seller, 'cashier', true),
        ] as $attempt) {
            try {
                $attempt();
                $this->fail('Expected a refusal.');
            } catch (WorkforceException) {
                $this->addToAssertionCount(1);
            }
        }

        // Opened: the opener's part is done, the closer can still answer.
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');
        $this->days->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));
        $this->days->answer($day->fresh(), $this->second, 'closer', true);
        $this->expectException(WorkforceException::class);
        $this->days->answer($day->fresh(), $this->seller, 'opener', true);
    }

    #[Test]
    public function the_answer_is_sent_from_my_work_and_shows_on_the_rota(): void
    {
        $day = $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);

        $this->actingAs($this->seller)->post(route('seller.work.site-days.answer', $day), ['duty' => 'opener', 'answer' => 'yes'])
            ->assertRedirect()->assertSessionHas('success');
        // Someone else's job: refused outright.
        $this->actingAs($this->second)->post(route('seller.work.site-days.answer', $day), ['duty' => 'opener', 'answer' => 'yes'])
            ->assertForbidden();
        $this->actingAs($this->second)->post(route('seller.work.site-days.answer', $day), ['duty' => 'closer', 'answer' => 'maybe'])
            ->assertSessionHasErrors('answer');

        $this->actingAs($this->manager)->get(route('seller.work.rota', ['site' => $this->site, 'week' => $this->today]))
            ->assertInertia(fn ($page) => $page->where('days.0.plan.answers.opener.answer', 'yes')->where('days.0.plan.answers.closer', null));

        $this->actingAs($this->manager)->get(route('seller.work'))
            ->assertInertia(fn ($page) => $page->where('weekPlan.0.days.0.answers', ['opener' => 'yes', 'closer' => null, 'driver' => null]));
    }

    #[Test]
    public function a_stock_keeper_and_a_driver_see_and_answer_their_jobs_from_their_own_apps(): void
    {
        // My work is one set of pages on every app: the duty shows, and the answer posts, on each host.
        $keeper = $this->user('stock_keeper', $this->site->store_id);
        $day = $this->plan($keeper->id, $this->second->id, $this->driver->id);
        $domain = config('app.system_domain');

        foreach ([['stockkeeper', 'stock_keeper', $keeper, 'opener', 'yes'], ['delivery', 'delivery', $this->driver, 'driver', 'no']] as [$host, $app, $user, $duty, $answer]) {
            $this->withServerVariables(['HTTP_HOST' => "{$host}.{$domain}"]);

            $this->actingAs($user)->get(route("{$app}.work"))->assertOk()->assertInertia(fn (Assert $page) => $page
                ->component('Work/Index')
                ->where('duties', fn ($duties) => collect($duties)->contains(fn ($row) => (int) $row['id'] === (int) $day->id && in_array($duty, $row['my_roles'], true))));

            $this->actingAs($user)->post(route("{$app}.work.site-days.answer", $day), ['duty' => $duty, 'answer' => $answer, 'note' => $answer === 'no' ? 'Car at the garage' : null])
                ->assertRedirect()->assertSessionHas('success');
        }

        $answers = $this->days->answersOf($day->fresh());
        $this->assertSame('yes', $answers['opener']['answer']);
        $this->assertSame('no', $answers['driver']['answer']);
        $this->assertSame('Car at the garage', $answers['driver']['note']);
    }

    #[Test]
    public function a_no_asks_the_manager_to_pick_someone_else_until_they_do(): void
    {
        $day = $this->plan(null, $this->second->id, null, $this->tomorrow);
        $this->days->answer($day, $this->second, 'closer', false, 'Family wedding');

        $task = $this->bell($this->manager)->first(fn (array $t): bool => str_starts_with($t['id'], 'cant-'));
        $this->assertNotNull($task);
        $this->assertTrue($task['urgent']);
        $this->assertStringContainsString('Family wedding', $task['detail']);
        $this->assertStringContainsString('/rota', (string) $task['href']);
        // Not to the person who said it.
        $this->assertNull($this->bell($this->second)->first(fn (array $t): bool => str_starts_with($t['id'], 'cant-')));

        // The Team page lists it too, with the day to plan.
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->manager)->get(route('seller.work.team'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('cantDo', 1)->where('cantDo.0.duty', 'closer')->where('cantDo.0.note', 'Family wedding')->where('cantDo.0.date', $this->tomorrow));

        $this->plan(null, $this->seller->id, null, $this->tomorrow);
        $this->assertNull($this->bell($this->manager)->first(fn (array $t): bool => str_starts_with($t['id'], 'cant-')));
    }

    #[Test]
    public function the_bell_asks_for_tomorrows_answer_and_in_the_evening_reminds_where_the_key_is(): void
    {
        $day = $this->plan($this->seller->id, null, null, $this->tomorrow);
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->second, 'First holder');

        $this->assertNotNull($this->bell($this->seller)->firstWhere('id', "answer-{$day->id}-opener"));

        $this->days->answer($day, $this->seller, 'opener', true);
        $this->assertNull($this->bell($this->seller)->firstWhere('id', "answer-{$day->id}-opener"));
        // Morning: no reminder yet.
        $this->assertNull($this->bell($this->seller)->firstWhere('id', "tomorrow-{$day->id}-opener"));

        $this->travelTo(CarbonImmutable::parse("{$this->today} 17:30:00"));
        $reminder = $this->bell($this->seller)->firstWhere('id', "tomorrow-{$day->id}-opener");
        $this->assertNotNull($reminder);
        $this->assertStringContainsString('tomorrow at 08:30', $reminder['detail']);
        $this->assertStringContainsString("The key is with {$this->second->first_name}", $reminder['detail']);
    }

    #[Test]
    public function the_dashboard_shows_the_week_ahead_for_the_sites_in_scope(): void
    {
        $this->plan($this->seller->id, $this->second->id, $this->driver->id);
        $admin = $this->user('admin', null);
        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost'])->actingAs($admin, 'web');

        $rows = [];
        $before = SiteDay::query()->where('stock_location_id', $this->site->id)->count();
        $this->get(route('admin.dashboard'))->assertOk()->assertInertia(function (Assert $page) use (&$rows): void {
            $page->loadDeferredProps(function (Assert $loaded) use (&$rows): void {
                $rows = $loaded->toArray()['props']['weekPlan'];
            });
        });

        $row = collect($rows)->firstWhere('site.id', $this->site->id);
        $this->assertNotNull($row);
        $this->assertCount(7, $row['days']);
        $this->assertSame(trim($this->seller->first_name.' '.$this->seller->last_name), $row['days'][0]['opener']);
        // Read-only: the week ahead made no day rows.
        $this->assertSame($before, SiteDay::query()->where('stock_location_id', $this->site->id)->count());
    }
}
