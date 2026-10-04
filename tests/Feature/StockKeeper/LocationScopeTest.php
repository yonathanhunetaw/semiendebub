<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A stock keeper's ledger and receive/recount follow the locations they
 * manage: a hub manager sees and books only that hub; a keeper with no
 * managed location sees their own store; one with neither sees everything.
 */
class LocationScopeTest extends TestCase
{
    use RefreshDatabase;

    private StockLocation $hubA;

    private StockLocation $hubB;

    private StockLocation $shelf;

    private StockLocation $floor;

    private ItemVariant $variant;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'stock_keeper'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $this->floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $this->hubA = $this->hub('Main Distribution Hub A', 'WH-A');
        $this->hubB = $this->hub('Main Distribution Hub B', 'WH-B');

        $this->variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);

        $stock = app(StockService::class);
        $stock->receive($this->variant->id, $this->hubA, 10);
        $stock->receive($this->variant->id, $this->hubB, 20);
        $stock->receive($this->variant->id, $this->floor, 30);
    }

    #[Test]
    public function a_hub_manager_sees_only_that_hub_in_the_ledger(): void
    {
        $bogale = $this->keeper();
        $this->hubA->syncManagers([$bogale->id]);

        $this->asKeeper($bogale)
            ->get(route('stock_keeper.inventory.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('locations', fn ($locations) => collect($locations)->pluck('id')->all() === [$this->hubA->id])
                ->where('stock', fn ($rows) => collect($rows)->pluck('quantity')->all() === [10])
                ->where('metrics.units_on_hand', 10));
    }

    #[Test]
    public function a_hub_manager_can_receive_into_their_hub_but_not_elsewhere(): void
    {
        $bogale = $this->keeper();
        $this->hubA->syncManagers([$bogale->id]);
        $this->hubB->syncManagers([$this->keeper()->id]);

        $this->asKeeper($bogale)
            ->post(route('stock_keeper.inventory.receive'), $this->receive($this->hubA, 5))
            ->assertSessionHas('success');
        $this->assertSame(15, $this->quantityAt($this->hubA));

        // Hub B has its own manager; the shop floor has none, and Bogale does not manage it either.
        $this->asKeeper($bogale)
            ->post(route('stock_keeper.inventory.receive'), $this->receive($this->hubB, 5))
            ->assertSessionHas('error');
        $this->assertSame(20, $this->quantityAt($this->hubB));
    }

    #[Test]
    public function a_location_nobody_manages_stays_open(): void
    {
        $bogale = $this->keeper();
        $this->hubA->syncManagers([$bogale->id]);

        // The floor has no managers yet, so booking onto it is not refused.
        $this->asKeeper($bogale)
            ->post(route('stock_keeper.inventory.receive'), $this->receive($this->floor, 5))
            ->assertSessionHas('success');
        $this->assertSame(35, $this->quantityAt($this->floor));
    }

    #[Test]
    public function a_recount_is_refused_at_a_location_the_keeper_does_not_manage(): void
    {
        $bogale = $this->keeper();
        $this->hubA->syncManagers([$bogale->id]);
        $this->hubB->syncManagers([$this->keeper()->id]);

        $hubBRow = ItemStock::query()->where('stock_location_id', $this->hubB->id)->sole();

        $this->asKeeper($bogale)
            ->patch(route('stock_keeper.inventory.adjust', $hubBRow), ['counted_quantity' => 1])
            ->assertSessionHas('error');
        $this->assertSame(20, $this->quantityAt($this->hubB));

        $hubARow = ItemStock::query()->where('stock_location_id', $this->hubA->id)->sole();
        $this->asKeeper($bogale)
            ->patch(route('stock_keeper.inventory.adjust', $hubARow), ['counted_quantity' => 8])
            ->assertSessionHas('success');
        $this->assertSame(8, $this->quantityAt($this->hubA));
    }

    #[Test]
    public function a_keeper_who_manages_nothing_sees_their_own_stores_locations(): void
    {
        $sultan = $this->keeper(['store_id' => $this->store->id]);

        $this->asKeeper($sultan)
            ->get(route('stock_keeper.inventory.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('locations', fn ($locations) => collect($locations)->pluck('id')->sort()->values()->all()
                    === StockLocation::query()->where('store_id', $this->store->id)->pluck('id')->sort()->values()->all())
                ->where('stock', fn ($rows) => collect($rows)->pluck('quantity')->all() === [30]));
    }

    #[Test]
    public function a_keeper_with_no_managed_location_and_no_store_sees_everything(): void
    {
        $this->asKeeper($this->keeper())
            ->get(route('stock_keeper.inventory.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('stock', fn ($rows) => collect($rows)->pluck('quantity')->sort()->values()->all() === [10, 20, 30]));
    }

    #[Test]
    public function the_dashboard_and_alerts_follow_the_same_view(): void
    {
        $bogale = $this->keeper();
        $this->hubA->syncManagers([$bogale->id]);

        $this->asKeeper($bogale)
            ->get(route('stock_keeper.dashboard'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('locations', fn ($locations) => collect($locations)->pluck('id')->all() === [$this->hubA->id])
                ->where('recent_movements', fn ($rows) => collect($rows)->pluck('quantity')->all() === [10]));

        $this->asKeeper($bogale)->get(route('stock_keeper.alerts.index'))->assertOk();
    }

    /** @param  array<string, mixed>  $attributes */
    private function keeper(array $attributes = []): User
    {
        $user = User::factory()->create(['role' => 'stock_keeper'] + $attributes);
        $user->assignRole('stock_keeper');

        return $user;
    }

    private function hub(string $name, string $code): StockLocation
    {
        $warehouse = Warehouse::create(['name' => $name, 'code' => $code]);

        return StockLocation::query()->legacy(Warehouse::class, $warehouse->id)->sole();
    }

    /** @return array<string, mixed> */
    private function receive(StockLocation $location, int $quantity): array
    {
        return [
            'item_variant_id' => $this->variant->id,
            'location_type' => StockLocation::class,
            'location_id' => $location->id,
            'quantity' => $quantity,
        ];
    }

    private function quantityAt(StockLocation $location): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('stock_location_id', $location->id)
            ->sum('quantity');
    }

    private function asKeeper(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
