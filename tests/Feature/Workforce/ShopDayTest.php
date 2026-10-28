<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\ShopDay;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A store's business day runs from opening to closing, not midnight to
 * midnight. What happens while the shop is closed belongs to no day.
 * (The shops' clock is Addis, UTC+3.)
 */
class ShopDayTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private int $reference = 0;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);

        foreach (['seller', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        [$this->store, $this->site] = $this->storeWithSite('Bole Store');
        $this->manager = $this->user('store_manager', $this->store->id);
        $this->seller = $this->user('seller', $this->store->id);

        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');
    }

    /** @return array{0: Store, 1: StockLocation} */
    private function storeWithSite(string $name): array
    {
        $store = Store::factory()->create(['name' => $name]);
        $site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();

        app(Sites::class)->saveWeek($site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        return [$store, $site];
    }

    private function user(string $role, int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function at(string $wallClock): void
    {
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    private function open(string $wallClock): SiteDay
    {
        $this->at($wallClock);

        return app(SiteDayService::class)->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));
    }

    private function close(string $wallClock, float $till = 500.0): SiteDay
    {
        $this->at($wallClock);

        return app(SiteDayService::class)->close($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site), [], $till);
    }

    /** A sale at a wall-clock moment, in the given store. */
    private function sale(string $wallClock, ?Store $store = null): Sale
    {
        $this->at($wallClock);

        return Sale::query()->create([
            'store_id' => ($store ?? $this->store)->id,
            'total_amount' => 100,
            'reference_number' => 'DAY-'.(++$this->reference),
        ]);
    }

    #[Test]
    public function a_sale_is_the_days_while_the_shop_is_open_and_belongs_to_no_day_otherwise(): void
    {
        $day = $this->open('2026-10-19 08:30');
        $this->close('2026-10-19 19:00');

        $shopDay = app(ShopDay::class);
        $this->assertSame($day->id, $shopDay->forInstant($this->site, CarbonImmutable::parse('2026-10-19 12:00', 'Africa/Addis_Ababa'))?->id);
        $this->assertNull($shopDay->forInstant($this->site, CarbonImmutable::parse('2026-10-19 07:00', 'Africa/Addis_Ababa')), 'Before opening.');
        $this->assertNull($shopDay->forInstant($this->site, CarbonImmutable::parse('2026-10-19 19:30', 'Africa/Addis_Ababa')), 'After closing.');
        $this->assertNull($shopDay->forInstant($this->site, CarbonImmutable::parse('2026-10-18 12:00', 'Africa/Addis_Ababa')), 'A day the shop never opened.');
    }

    #[Test]
    public function the_day_ends_when_the_shop_closes_even_after_midnight(): void
    {
        $day = $this->open('2026-10-19 08:30');
        $this->assertSame($day->id, app(SiteDayService::class)->current($this->site)->id);

        // 01:00 on the 20th: the shop is still open, so it is still the 19th's day.
        $this->at('2026-10-20 01:00');
        $this->assertSame($day->id, app(SiteDayService::class)->current($this->site)->id);
        $this->assertSame($day->id, app(ShopDay::class)->forInstant($this->site, now())?->id);

        $closed = $this->close('2026-10-20 01:30');
        $this->assertSame($day->id, $closed->id);
        $this->assertSame(SiteDay::STATUS_CLOSED, $closed->fresh()->status);
        $this->assertSame('2026-10-19', $closed->fresh()->date->toDateString(), 'Dated by its opening date.');

        // After closing, 02:00 belongs to no day.
        $this->assertNull(app(ShopDay::class)->forInstant($this->site, CarbonImmutable::parse('2026-10-20 02:00', 'Africa/Addis_Ababa')));
    }

    #[Test]
    public function within_and_outside_hours_split_sales_and_never_touch_a_closed_day(): void
    {
        $this->open('2026-10-19 08:30');
        $open = $this->sale('2026-10-19 10:00');
        $late = $this->sale('2026-10-20 00:30', null); // still open past midnight
        $this->close('2026-10-20 01:00');
        $after = $this->sale('2026-10-20 03:00'); // an online order at night
        $day = SiteDay::query()->sole();

        $shopDay = app(ShopDay::class);

        $inside = $shopDay->within(Sale::query(), 'sales.created_at', $day)->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$open->id, $late->id], $inside);

        $outside = $shopDay->outsideHours(Sale::query(), 'sales.created_at', 'sales.store_id')->pluck('id')->all();
        $this->assertSame([$after->id], $outside);

        // A sale made later does not change the closed day's total.
        $this->sale('2026-10-21 03:00');
        $this->assertCount(2, $shopDay->within(Sale::query(), 'sales.created_at', $day)->get());
    }

    #[Test]
    public function a_day_still_open_has_no_end_and_a_shop_that_never_opened_is_all_outside_hours(): void
    {
        [$other, $otherSite] = $this->storeWithSite('Piassa Store');
        $this->open('2026-10-19 08:30');

        $mine = $this->sale('2026-10-19 12:00');
        $theirs = $this->sale('2026-10-19 12:00', $other);

        $shopDay = app(ShopDay::class);
        $this->assertNull($shopDay->span(SiteDay::query()->sole())[1], 'Open: no end yet.');
        $this->assertNull($shopDay->current($otherSite));

        // Each sale is judged against its own store's days.
        $outside = $shopDay->outsideHours(Sale::query(), 'sales.created_at', 'sales.store_id')->pluck('id')->all();
        $this->assertSame([$theirs->id], $outside);
        $this->assertNotContains($mine->id, $outside);
    }

    #[Test]
    public function a_new_day_cannot_open_while_yesterdays_is_still_open(): void
    {
        $this->open('2026-10-19 08:30');
        $this->at('2026-10-20 08:30');

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('still open from Monday, Oct 19');

        app(SiteDayService::class)->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));
    }

    #[Test]
    public function a_day_nobody_closed_is_listed_so_someone_can_be_asked(): void
    {
        $this->open('2026-10-19 08:30');

        $this->at('2026-10-19 23:00');
        $this->assertCount(0, app(ShopDay::class)->forgottenToClose(), 'Still the same shop date.');

        $this->at('2026-10-20 09:00');
        $this->assertSame([$this->site->id], app(ShopDay::class)->forgottenToClose()->pluck('stock_location_id')->all());
        $this->assertSame($this->site->id, app(ShopDay::class)->siteOf($this->store->id)?->id);
        $this->assertSame('2026-10-20', LocalTime::dateOf());
    }

    #[Test]
    public function a_manager_closes_a_forgotten_day_afterwards_and_the_next_day_can_open(): void
    {
        $day = $this->open('2026-10-19 08:30');
        $sale = $this->sale('2026-10-19 21:00'); // after the real closing time
        $this->at('2026-10-20 09:00');

        $svc = app(SiteDayService::class);
        $this->assertTrue($svc->present($this->site, $svc->current($this->site), $this->manager)['overdue_close']);

        // Only a manager does it, and has to say why.
        try {
            $svc->closeLate($this->site, $this->seller, LocalTime::parse('2026-10-19T19:00'), 400.0, 'Forgot');
            $this->fail('A seller cannot close a day afterwards.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }
        $this->expectNoteRequired($svc);

        // Not before it opened, not in the future.
        try {
            $svc->closeLate($this->site, $this->manager, LocalTime::parse('2026-10-19T07:00'), 400.0, 'Forgot');
            $this->fail('Before opening.');
        } catch (WorkforceException) {
            $this->assertSame(SiteDay::STATUS_OPEN, $day->fresh()->status);
        }

        $closed = $svc->closeLate($this->site, $this->manager, LocalTime::parse('2026-10-19T19:00'), 400.0, 'Closed in a hurry, forgot the QR');

        $this->assertSame(SiteDay::STATUS_CLOSED, $closed->status);
        $this->assertTrue($closed->closed_late);
        $this->assertSame('2026-10-19 16:00:00', $closed->fresh()->getRawOriginal('closed_at'));
        $this->assertSame(400.0, (float) $closed->till_count);

        // The 21:00 sale is now outside open hours, and the new day can open.
        $outside = app(ShopDay::class)->outsideHours(Sale::query(), 'sales.created_at', 'sales.store_id')->pluck('id')->all();
        $this->assertSame([$sale->id], $outside);
        $this->assertSame(SiteDay::STATUS_OPEN, $this->open('2026-10-20 09:05')->status);
        $this->assertCount(0, app(ShopDay::class)->forgottenToClose());
    }

    private function expectNoteRequired(SiteDayService $svc): void
    {
        try {
            $svc->closeLate($this->site, $this->manager, LocalTime::parse('2026-10-19T19:00'), 400.0, '  ');
            $this->fail('A reason is required.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('why', $e->getMessage());
        }
    }
}
