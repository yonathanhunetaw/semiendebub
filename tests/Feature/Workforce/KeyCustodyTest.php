<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\KeyHandover;
use App\Services\Workforce\KeyCustodyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * One key per site and per vehicle. The holder changes only when the receiver
 * accepts; a manager may force it, and that is logged.
 */
class KeyCustodyTest extends TestCase
{
    use RefreshDatabase;

    private KeyCustodyService $keys;

    private Store $store;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private User $keeper;

    private User $stranger;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'store_manager', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->keys = app(KeyCustodyService::class);
        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();

        $this->manager = $this->user('store_manager', $this->store->id);
        $this->seller = $this->user('seller', $this->store->id);
        $this->keeper = $this->user('stock_keeper', $this->store->id);
        $this->stranger = $this->user('seller', Store::factory()->create()->id);
    }

    private function user(string $role, ?int $storeId, bool $driver = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_driver' => $driver]);
        $user->assignRole($role);

        return $user;
    }

    #[Test]
    public function the_holder_changes_only_when_the_receiver_accepts(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');

        $handover = $this->keys->handOver($key->fresh(), $this->seller, $this->keeper, 'closing');

        $this->assertSame($this->seller->id, $key->fresh()->holder_id);
        $this->assertSame(KeyHandover::STATUS_CLAIMED, $handover->status);

        $this->keys->accept($handover, $this->keeper);

        $this->assertSame($this->keeper->id, $key->fresh()->holder_id);
        $this->assertSame(KeyHandover::STATUS_ACCEPTED, $handover->fresh()->status);
    }

    #[Test]
    public function a_rejected_hand_over_leaves_the_key_with_the_giver(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');
        $handover = $this->keys->handOver($key->fresh(), $this->seller, $this->keeper);

        $this->keys->reject($handover, $this->keeper, 'not here yet');

        $this->assertSame($this->seller->id, $key->fresh()->holder_id);
        $this->assertSame(KeyHandover::STATUS_REJECTED, $handover->fresh()->status);
        $this->assertStringContainsString('not here yet', (string) $handover->fresh()->note);
    }

    #[Test]
    public function only_the_holder_hands_over_and_only_the_receiver_accepts(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');

        try {
            $this->keys->handOver($key->fresh(), $this->keeper, $this->manager);
            $this->fail('A non-holder handed the key over.');
        } catch (WorkforceException $e) {
            $this->assertSame(403, $e->getCode());
        }

        $handover = $this->keys->handOver($key->fresh(), $this->seller, $this->keeper);

        $this->expectException(WorkforceException::class);
        $this->keys->accept($handover, $this->manager);
    }

    #[Test]
    public function someone_from_another_store_cannot_hold_the_key(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');

        $this->expectException(WorkforceException::class);
        $this->keys->handOver($key->fresh(), $this->seller, $this->stranger);
    }

    #[Test]
    public function only_one_hand_over_waits_at_a_time(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');
        $this->keys->handOver($key->fresh(), $this->seller, $this->keeper);

        $this->expectException(WorkforceException::class);
        $this->keys->handOver($key->fresh(), $this->seller, $this->manager);
    }

    #[Test]
    public function a_forced_key_is_logged_and_cancels_the_pending_hand_over(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');
        $pending = $this->keys->handOver($key->fresh(), $this->seller, $this->keeper);

        $forced = $this->keys->force($key->fresh(), $this->manager, $this->manager, 'Seller is sick');

        $this->assertSame($this->manager->id, $key->fresh()->holder_id);
        $this->assertSame(KeyHandover::STATUS_FORCED, $forced->status);
        $this->assertSame($this->seller->id, $forced->from_id);
        $this->assertSame(KeyHandover::STATUS_CANCELLED, $pending->fresh()->status);
    }

    #[Test]
    public function a_seller_cannot_force_a_key(): void
    {
        $key = $this->keys->keyFor($this->site);

        $this->expectException(WorkforceException::class);
        $this->keys->force($key, $this->seller, $this->seller, 'mine now');
    }

    #[Test]
    public function a_vehicle_key_goes_to_drivers(): void
    {
        $admin = $this->user('admin', null);
        $driver = $this->user('delivery', null, true);
        $courier = $this->user('delivery', null);
        $key = $this->keys->keyFor(Vehicle::factory()->create());

        $this->keys->force($key, $admin, $driver, 'Morning run');
        $this->assertSame($driver->id, $key->fresh()->holder_id);

        $this->expectException(WorkforceException::class);
        $this->keys->handOver($key->fresh(), $driver, $courier);
    }

    #[Test]
    public function the_bell_shows_a_key_waiting_for_you(): void
    {
        $key = $this->keys->keyFor($this->site);
        $this->keys->force($key, $this->manager, $this->seller, 'First holder');
        $this->keys->handOver($key->fresh(), $this->seller, $this->keeper);

        $tasks = collect(app(\App\Services\Tasks\TaskInbox::class)->for($this->keeper->fresh()));

        $this->assertNotNull($tasks->firstWhere('id', 'accept-keys'));
    }
}
