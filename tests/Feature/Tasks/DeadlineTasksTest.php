<?php

declare(strict_types=1);

namespace Tests\Feature\Tasks;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Inventory\StockLocation;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\PriceCheck;
use App\Models\Store\Store;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The bell's deadline alerts: dates that passed with nothing done.
 */
class DeadlineTasksTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);
        foreach (['admin', 'seller', 'store_manager', 'procurement', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }
        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->at('2026-10-20 12:00');
    }

    private function at(string $wallClock): void
    {
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    /** @return array<string, array<string, mixed>> */
    private function tasks(User $user): array
    {
        return collect(app(TaskInbox::class)->for($user->fresh()))->keyBy('id')->all();
    }

    #[Test]
    public function late_deliveries_and_stalled_picking_reach_the_store(): void
    {
        $late = Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => 100, 'reference_number' => 'LATE-1', 'fulfillment_stage' => Sale::STAGE_TO_DELIVER]);
        Delivery::query()->create([
            'sale_id' => $late->id, 'source_store_id' => $this->store->id, 'tracking_number' => 'TRK-LATE', 'status' => 'dispatched',
            'recipient_name' => 'Abebe', 'delivery_address' => 'Bole', 'scheduled_for' => now()->subHour(),
        ]);
        Sale::query()->create([
            'store_id' => $this->store->id, 'total_amount' => 100, 'reference_number' => 'PICK-1',
            'fulfillment_stage' => Sale::STAGE_PICK_PACK, 'picking_started_at' => now()->subHours(3),
        ]);

        $manager = $this->tasks($this->user('store_manager', $this->store->id));
        $this->assertSame(1, $manager['late-deliveries']['count']);
        $this->assertSame(1, $manager['picking-stalled']['count']);

        $admin = $this->tasks($this->user('admin', null));
        $this->assertSame(1, $admin['late-deliveries']['count']);
    }

    #[Test]
    public function procurement_hears_about_consignments_past_eta_and_admins_about_overdue_price_checks(): void
    {
        Consignment::query()->create(['reference' => 'CN-1', 'stage' => 'at_sea', 'eta' => '2026-10-18']);
        Consignment::query()->create(['reference' => 'CN-2', 'stage' => 'at_sea', 'eta' => '2026-10-25']);
        $admin = $this->user('admin', null);
        PriceCheck::query()->create(['store_id' => $this->store->id, 'due_on' => '2026-10-19', 'status' => PriceCheck::OPEN, 'created_by' => $admin->id, 'shops_wanted' => 3]);

        $procurement = $this->tasks($this->user('procurement', null));
        $this->assertSame(1, $procurement['consignments-late']['count']);

        $admins = $this->tasks($admin);
        $this->assertSame(1, $admins['price-checks-overdue']['count']);
        $this->assertSame(1, $admins['consignments-late']['count']);

        $this->assertArrayNotHasKey('consignments-late', $this->tasks($this->user('seller', $this->store->id)));
    }

    #[Test]
    public function a_day_nobody_closed_reaches_the_manager_and_the_closer_still_sees_it_after_midnight(): void
    {
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        app(Sites::class)->saveWeek($site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());
        $manager = $this->user('store_manager', $this->store->id);
        $seller = $this->user('seller', $this->store->id);
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($site), $manager, $seller, 'First holder');

        $this->at('2026-10-19 07:00');
        app(SiteDayService::class)->plan($site, CarbonImmutable::parse('2026-10-19'), $manager, $seller->id, $seller->id);
        $this->at('2026-10-19 08:30');
        app(SiteDayService::class)->open($site, $seller, app(CounterQr::class)->printedToken($site));

        // 00:30 on the 20th: still the 19th's day, and its closer still has to close it.
        $this->at('2026-10-20 00:30');
        $this->assertArrayHasKey("close-site-{$site->id}", $this->tasks($seller));
        $this->assertArrayHasKey('sites-not-closed', $this->tasks($manager));
    }

    #[Test]
    public function carts_left_open_reach_their_seller_and_the_manager_but_close_nothing(): void
    {
        $seller = $this->user('seller', $this->store->id);
        $other = $this->user('seller', $this->store->id);

        $this->at('2026-10-15 10:00');
        $old = \App\Models\Seller\Cart::query()->create(['store_id' => $this->store->id, 'seller_id' => $seller->id, 'status' => 'open', 'session_id' => '111111']);
        $this->at('2026-10-19 10:00');
        \App\Models\Seller\Cart::query()->create(['store_id' => $this->store->id, 'seller_id' => $seller->id, 'status' => 'open', 'session_id' => '222222']);
        $this->at('2026-10-20 12:00');

        $this->assertSame(1, $this->tasks($seller)['carts-idle']['count']);
        $this->assertArrayNotHasKey('carts-idle', $this->tasks($other), 'Not their cart.');
        $this->assertSame(1, $this->tasks($this->user('store_manager', $this->store->id))['carts-idle']['count']);
        $this->assertSame('open', $old->fresh()->status);
    }
}
