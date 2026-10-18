<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffingRule;
use App\Models\Workforce\TimeEntry;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The app runs in UTC; the shops' clock is Addis Ababa (UTC+3). Hours and
 * shift times are typed on the shops' clock, kept as UTC instants, compared
 * with now() correctly and shown back as typed. (The other Workforce tests run
 * the shops' clock in UTC.)
 */
class ShopClockTest extends TestCase
{
    use RefreshDatabase;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);

        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    /** A moment on the shops' clock. */
    private function travelToLocal(string $wallClock): void
    {
        // As a UTC instant, like the server's clock (a zoned test-now would leak its zone).
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    #[Test]
    public function an_opening_is_late_by_the_shops_clock_not_utc(): void
    {
        $this->travelToLocal('2026-10-19 08:40');
        $this->assertSame(0, app(SiteDayService::class)->sweep(), '08:40 is within the 15 minutes.');

        $this->travelToLocal('2026-10-19 08:46');
        $this->assertSame(1, app(SiteDayService::class)->sweep());
        $this->assertSame(SiteDay::STATUS_MISSED, app(SiteDayService::class)->day($this->site, now())->status);
    }

    #[Test]
    public function after_midnight_in_addis_it_is_already_the_next_day(): void
    {
        // 01:00 on the 20th in Addis is still the 19th in UTC.
        $this->travelToLocal('2026-10-20 01:00');

        $this->assertSame('2026-10-19', now()->toDateString());
        $this->assertSame('2026-10-20', LocalTime::dateOf());
        $this->assertSame('2026-10-20', app(SiteDayService::class)->day($this->site, now())->date->toDateString());
    }

    #[Test]
    public function a_typed_shift_is_stored_as_utc_shown_as_typed_and_matched_by_clock_in(): void
    {
        $this->travelToLocal('2026-10-19 07:00');
        $rota = app(RotaService::class);

        $shift = $rota->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19T08:30', 'ends_at' => '2026-10-19T16:30']);
        $rota->publish($this->site, $this->manager, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19'));

        $this->assertSame('2026-10-19 05:30:00', $shift->fresh()->getRawOriginal('starts_at'));
        $this->assertSame('2026-10-19T08:30', $rota->present($shift->fresh())['starts_at']);

        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');

        $this->travelToLocal('2026-10-19 08:25');
        app(SiteDayService::class)->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site));

        $entry = TimeEntry::query()->sole();
        $this->assertSame($shift->id, $entry->shift_id);
        $this->assertSame([], $entry->flags, 'On time, on their shift.');
    }

    #[Test]
    public function staffing_rules_and_rides_use_the_shops_clock(): void
    {
        $this->travelToLocal('2026-10-19 07:00');
        StaffingRule::query()->create(['stock_location_id' => $this->site->id, 'weekdays' => [1], 'starts_at' => '10:00', 'ends_at' => '14:00', 'role' => 'any', 'min_people' => 1]);

        app(RotaService::class)->save($this->site, $this->manager, ['user_id' => $this->seller->id, 'starts_at' => '2026-10-19T10:00', 'ends_at' => '2026-10-19T14:00']);
        $this->assertSame([], app(RotaService::class)->coverage($this->site, CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19')));

        $rides = app(StaffRideService::class);
        $ride = $rides->request($this->site, $this->manager, LocalTime::parse('2026-10-19T19:15'), [$this->seller->id]);
        $this->assertSame('2026-10-19T19:15', $rides->present($ride->fresh(), $this->manager)['departs_at']);
        $this->assertSame('2026-10-19 16:15:00', $ride->fresh()->getRawOriginal('departs_at'));
    }
}
