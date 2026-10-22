<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\StaffRideRider;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\StaffRideService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** A fleet car taking staff home: asked for, claimed with a free car, driven, done. */
class StaffRideTest extends TestCase
{
    use RefreshDatabase;

    private StaffRideService $rides;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $second;

    private User $driver;

    private Vehicle $car;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-19 17:00:00'));

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->rides = app(StaffRideService::class);
        $store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $store->id);
        $this->seller = $this->user('seller', $store->id);
        $this->seller->update(['home_area' => 'Bole Bulbula']);
        $this->second = $this->user('seller', $store->id);
        $this->driver = $this->user('delivery', null, true);
        $this->car = Vehicle::factory()->create(['name' => 'Hiace', 'status' => Vehicle::STATUS_ACTIVE]);
    }

    private function user(string $role, ?int $storeId, bool $driver = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_driver' => $driver]);
        $user->assignRole($role);

        return $user;
    }

    private function ride(): StaffRide
    {
        return $this->rides->request($this->site, $this->manager, CarbonImmutable::parse('2026-10-19 19:15'), [$this->seller->id, $this->second->id], 'Rain');
    }

    #[Test]
    public function the_whole_ride_from_asking_to_done(): void
    {
        $ride = $this->ride();
        $this->assertSame('Bole Bulbula', $ride->riders()->where('user_id', $this->seller->id)->value('drop_off'));
        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->driver->fresh()))->firstWhere('id', 'rides-to-take'));
        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->seller->fresh()))->firstWhere('id', "ride-{$ride->id}"));

        $this->rides->claim($ride, $this->driver, $this->car);
        $this->assertSame(StaffRide::STATUS_CLAIMED, $ride->fresh()->status);

        try {
            $this->rides->finish($ride->fresh(), $this->driver);
            $this->fail('Finished before setting off.');
        } catch (WorkforceException) {
        }

        $this->rides->depart($ride->fresh(), $this->driver);
        $this->rides->drop($ride->fresh(), $this->driver, $this->seller->id);

        try {
            $this->rides->finish($ride->fresh(), $this->driver);
            $this->fail('Finished with someone still riding.');
        } catch (WorkforceException) {
        }

        $this->rides->drop($ride->fresh(), $this->driver, $this->second->id, false);
        $this->rides->finish($ride->fresh(), $this->driver);

        $this->assertSame(StaffRide::STATUS_DONE, $ride->fresh()->status);
        $this->assertSame(StaffRideRider::STATUS_NO_SHOW, $ride->riders()->where('user_id', $this->second->id)->value('status'));
    }

    #[Test]
    public function a_seller_asks_only_when_they_open_or_close_that_day(): void
    {
        try {
            $this->rides->request($this->site, $this->seller, CarbonImmutable::parse('2026-10-19 19:15'), [$this->seller->id]);
            $this->fail('A seller asked for a ride.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }

        app(SiteDayService::class)->plan($this->site, CarbonImmutable::today(), $this->manager, null, $this->seller->id);

        $ride = $this->rides->request($this->site, $this->seller, CarbonImmutable::parse('2026-10-19 19:15'), [$this->seller->id]);
        $this->assertSame(StaffRide::STATUS_REQUESTED, $ride->status);
    }

    #[Test]
    public function a_car_on_another_ride_at_that_time_cannot_be_taken_and_only_drivers_claim(): void
    {
        $first = $this->ride();
        $this->rides->claim($first, $this->driver, $this->car);

        $second = $this->rides->request($this->site, $this->manager, CarbonImmutable::parse('2026-10-19 20:00'), [$this->seller->id]);
        $other = $this->user('delivery', null, true);

        try {
            $this->rides->claim($second, $other, $this->car);
            $this->fail('Booked the same car twice.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('busy', $e->getMessage());
        }

        $courier = $this->user('delivery', null);
        $this->expectException(WorkforceException::class);
        $this->rides->claim($second, $courier, Vehicle::factory()->create());
    }

    #[Test]
    public function a_rider_opts_out_and_a_ride_with_nobody_left_cannot_be_claimed(): void
    {
        $ride = $this->rides->request($this->site, $this->manager, CarbonImmutable::parse('2026-10-19 19:15'), [$this->seller->id]);
        $this->rides->optOut($ride, $this->seller);

        $this->expectException(WorkforceException::class);
        $this->expectExceptionMessage('Nobody is riding');
        $this->rides->claim($ride, $this->driver, $this->car);
    }

    #[Test]
    public function rides_over_http_on_both_apps(): void
    {
        $seller = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $delivery = ['HTTP_HOST' => 'delivery.'.config('app.system_domain')];

        $this->actingAs($this->manager)->withServerVariables($seller)
            ->post(route('seller.work.rides.store', $this->site), ['departs_at' => '2026-10-19T19:15', 'rider_ids' => [$this->seller->id]])
            ->assertSessionHas('success');
        $ride = StaffRide::query()->sole();

        $this->actingAs($this->driver)->withServerVariables($delivery)->get(route('delivery.work.rides'))
            ->assertInertia(fn ($page) => $page->component('Work/Rides')->where('driver', true)->where('rides.0.can.claim', true)->has('vehicles', 1));

        $this->actingAs($this->driver)->withServerVariables($delivery)
            ->post(route('delivery.work.rides.claim', $ride), ['vehicle_id' => $this->car->id])
            ->assertSessionHas('success');

        $this->actingAs($this->seller)->withServerVariables($seller)->get(route('seller.work'))
            ->assertInertia(fn ($page) => $page->where('rides.0.driver.id', $this->driver->id));

        $this->actingAs($this->seller)->withServerVariables($seller)
            ->put(route('seller.work.home-area'), ['home_area' => 'Megenagna'])
            ->assertSessionHas('success');
        $this->assertSame('Megenagna', $this->seller->fresh()->home_area);
    }

    #[Test]
    public function a_ride_is_on_the_riders_the_managers_and_the_drivers_calendars(): void
    {
        $ride = $this->ride();
        $range = [CarbonImmutable::parse('2026-10-19'), CarbonImmutable::parse('2026-10-19 23:59:59'), ['staff_rides']];
        $feed = fn (string $app, User $user): array => app(CalendarFeed::class)->between(CalendarScope::for($app, $user), ...$range);

        $mine = $feed('seller', $this->seller);
        $this->assertSame(["staff-ride:{$ride->id}"], array_column($mine, 'id'));
        $this->assertSame("Staff ride from {$this->site->name}", $mine[0]['title']);
        $this->assertSame('No driver yet', $mine[0]['subtitle']);
        $this->assertCount(1, $feed('seller', $this->manager));
        $this->assertSame([], $feed('seller', $this->user('seller', Store::factory()->create()->id)));

        // Every driver sees a ride waiting to be taken; once taken, only its driver.
        $other = $this->user('delivery', null, true);
        $this->assertCount(1, $feed('delivery', $other));
        $this->rides->claim($ride, $this->driver, $this->car);
        $this->assertSame([], $feed('delivery', $other));
        $this->assertSame("{$this->driver->first_name} · {$this->car->plate}", $feed('delivery', $this->driver)[0]['subtitle']);

        $this->rides->cancel($ride->fresh(), $this->manager);
        $this->assertSame([], $feed('seller', $this->seller));
    }

    #[Test]
    public function the_driver_drives_the_ride_over_http(): void
    {
        $delivery = ['HTTP_HOST' => 'delivery.'.config('app.system_domain')];
        $as = fn (User $user) => $this->actingAs($user)->withServerVariables($delivery);
        $ride = $this->ride();
        $other = $this->user('delivery', null, true);

        $this->rides->claim($ride, $this->driver, $this->car);
        $as($other)->post(route('delivery.work.rides.release', $ride))->assertForbidden();
        $as($this->driver)->post(route('delivery.work.rides.release', $ride))->assertSessionHas('success', 'Ride given back.');
        $this->assertSame(StaffRide::STATUS_REQUESTED, $ride->fresh()->status);

        $this->rides->claim($ride->fresh(), $this->driver, $this->car);
        $as($this->driver)->post(route('delivery.work.rides.finish', $ride))->assertSessionHas('error');
        $as($other)->post(route('delivery.work.rides.depart', $ride))->assertForbidden();
        $as($this->driver)->post(route('delivery.work.rides.depart', $ride))->assertSessionHas('success', 'On the way.');

        $as($this->driver)->post(route('delivery.work.rides.drop', $ride), ['user_id' => $this->seller->id])->assertSessionHasErrors('showed_up');
        $as($this->driver)->post(route('delivery.work.rides.drop', $ride), ['user_id' => $this->seller->id, 'showed_up' => true])
            ->assertSessionHas('success', 'Dropped off.');
        $as($this->driver)->post(route('delivery.work.rides.drop', $ride), ['user_id' => $this->seller->id, 'showed_up' => true])
            ->assertSessionHas('error', 'That person is not riding.');
        $as($this->driver)->post(route('delivery.work.rides.finish', $ride))
            ->assertSessionHas('error', 'Drop everyone off (or mark who did not come) first.');
        $as($this->driver)->post(route('delivery.work.rides.drop', $ride), ['user_id' => $this->second->id, 'showed_up' => false])
            ->assertSessionHas('success', 'Marked as not there.');
        $as($this->driver)->post(route('delivery.work.rides.finish', $ride))->assertSessionHas('success', 'Ride done.');

        $this->assertSame(StaffRide::STATUS_DONE, $ride->fresh()->status);
        $this->assertSame(StaffRideRider::STATUS_NO_SHOW, $ride->riders()->where('user_id', $this->second->id)->value('status'));
    }

    #[Test]
    public function a_rider_opts_out_and_the_asker_cancels_over_http(): void
    {
        $seller = ['HTTP_HOST' => 'seller.'.config('app.system_domain')];
        $as = fn (User $user) => $this->actingAs($user)->withServerVariables($seller);
        $ride = $this->ride();
        $outsider = $this->user('seller', Store::factory()->create()->id);

        $as($this->seller)->post(route('seller.work.rides.opt-out', $ride))->assertSessionHas('success', 'Noted: you do not need this ride.');
        $as($outsider)->post(route('seller.work.rides.opt-out', $ride))->assertSessionHas('error', 'You are not on this ride.');

        $as($this->second)->post(route('seller.work.rides.cancel', $ride))->assertForbidden();
        $as($this->manager)->post(route('seller.work.rides.cancel', $ride))->assertSessionHas('success', 'Ride cancelled.');
        $this->assertSame(StaffRide::STATUS_CANCELLED, $ride->fresh()->status);
    }
}
