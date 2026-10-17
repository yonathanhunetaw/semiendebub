<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\SiteHour;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** The work pages on each app: my keys, site setup for managers only. */
class WorkPagesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $keeper;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->manager = $this->user('store_manager', $this->store->id);
        $this->seller = $this->user('seller', $this->store->id);
        $this->keeper = $this->user('stock_keeper', $this->store->id);
    }

    private function user(string $role, ?int $storeId, bool $driver = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_driver' => $driver]);
        $user->assignRole($role);

        return $user;
    }

    private function on(string $app, User $user): static
    {
        $host = ['seller' => 'seller', 'stock_keeper' => 'stockkeeper', 'delivery' => 'delivery', 'admin' => 'admin'][$app];

        return $this->actingAs($user)->withServerVariables(['HTTP_HOST' => $host.'.'.config('app.system_domain')]);
    }

    #[Test]
    public function a_seller_sees_their_work_page_with_their_store(): void
    {
        $this->on('seller', $this->seller)->get(route('seller.work'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Work/Index')
                ->where('app', 'seller')
                ->where('days.0.site.id', $this->site->id)
                ->where('managesSites', false));
    }

    #[Test]
    public function a_key_goes_from_seller_to_stock_keeper_over_http(): void
    {
        $key = app(KeyCustodyService::class)->keyFor($this->site);
        app(KeyCustodyService::class)->force($key, $this->manager, $this->seller, 'First holder');

        $this->on('seller', $this->seller)
            ->post(route('seller.work.keys.hand-over', $key), ['to_id' => $this->keeper->id, 'reason' => 'closing'])
            ->assertSessionHas('success');

        $handover = KeyHandover::query()->where('status', KeyHandover::STATUS_CLAIMED)->sole();

        $this->on('stock_keeper', $this->keeper)->get(route('stock_keeper.work'))
            ->assertInertia(fn ($page) => $page->where('waiting.0.id', $handover->id));

        $this->on('stock_keeper', $this->keeper)
            ->post(route('stock_keeper.work.key-handovers.accept', $handover))
            ->assertSessionHas('success');

        $this->assertSame($this->keeper->id, $key->fresh()->holder_id);
    }

    #[Test]
    public function someone_else_accepting_is_forbidden(): void
    {
        $key = app(KeyCustodyService::class)->keyFor($this->site);
        app(KeyCustodyService::class)->force($key, $this->manager, $this->seller, 'First holder');
        $handover = app(KeyCustodyService::class)->handOver($key->fresh(), $this->seller, $this->keeper);

        $this->on('seller', $this->manager)
            ->post(route('seller.work.key-handovers.accept', $handover))
            ->assertForbidden();
    }

    #[Test]
    public function the_store_manager_sets_opening_hours_and_a_closed_day(): void
    {
        $days = collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d,
            'closed' => $d === 0,
            'opens_at' => $d === 0 ? null : '08:30',
            'closes_at' => $d === 0 ? null : '19:00',
        ])->all();

        $this->on('seller', $this->manager)->put(route('seller.work.sites.hours', $this->site), ['days' => $days])
            ->assertSessionHas('success');

        $this->assertSame(7, SiteHour::query()->where('stock_location_id', $this->site->id)->count());

        $monday = CarbonImmutable::parse('next monday');
        $this->on('seller', $this->manager)->post(route('seller.work.sites.exceptions.store', $this->site), [
            'date' => $monday->toDateString(),
            'closed' => true,
            'note' => 'Holiday',
        ])->assertSessionHas('success');

        $sites = app(Sites::class);
        $this->assertTrue($sites->hoursOn($this->site, $monday)['closed']);
        $this->assertSame('08:30', $sites->hoursOn($this->site, $monday->addDay())['opens_at']);
        $this->assertTrue($sites->hoursOn($this->site, $monday->next(CarbonImmutable::SUNDAY))['closed']);
    }

    #[Test]
    public function closing_before_opening_is_refused(): void
    {
        $days = collect(range(0, 6))->map(fn (int $d): array => ['weekday' => $d, 'closed' => false, 'opens_at' => '18:00', 'closes_at' => '08:00'])->all();

        $this->on('seller', $this->manager)->put(route('seller.work.sites.hours', $this->site), ['days' => $days])
            ->assertSessionHasErrors('days.0.closes_at');
    }

    #[Test]
    public function a_seller_cannot_open_site_setup(): void
    {
        $this->on('seller', $this->seller)->get(route('seller.work.sites.show', $this->site))->assertForbidden();
        $this->on('seller', $this->seller)->put(route('seller.work.sites.hours', $this->site), ['days' => []])->assertStatus(302);
        $this->assertSame(0, SiteHour::query()->count());
    }

    #[Test]
    public function a_store_admin_sees_only_their_stores_sites(): void
    {
        $other = Store::factory()->create(['name' => 'Piassa Store']);
        $storeAdmin = $this->user('admin', $this->store->id);

        $this->on('admin', $storeAdmin)->get(route('admin.work.sites.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Work/Sites/Index')->has('sites', 1)->where('sites.0.id', $this->site->id));

        $otherSite = StockLocation::query()->where('store_id', $other->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $this->on('admin', $storeAdmin)->get(route('admin.work.sites.show', $otherSite))->assertForbidden();
    }

    #[Test]
    public function the_fleet_page_shows_each_cars_key_and_a_driver_sees_theirs(): void
    {
        $admin = $this->user('admin', null);
        $driver = $this->user('delivery', null, true);
        $car = Vehicle::factory()->create(['name' => 'Hilux']);

        $this->on('admin', $admin)->get(route('admin.inventory.fleet.index'))
            ->assertInertia(fn ($page) => $page->where('vehicles.0.key.holder', null)->where('vehicles.0.key.can.force', true));

        $key = CustodyKey::query()->where('keyable_type', Vehicle::class)->sole();
        $this->on('admin', $admin)->post(route('admin.work.keys.force', $key), ['to_id' => $driver->id, 'note' => 'Morning run'])
            ->assertSessionHas('success');

        $this->on('delivery', $driver)->get(route('delivery.work'))
            ->assertInertia(fn ($page) => $page->where('keys.0.label', 'Hilux ('.$car->plate.') key'));
    }
}
