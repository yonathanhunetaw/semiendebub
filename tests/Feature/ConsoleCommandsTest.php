<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Auth\User;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\LocationCapacityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The artisan commands: role repair, the replenishment sweep, the shipment
 * board audit, the architecture map, and the e2e helpers' safety guard.
 */
class ConsoleCommandsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attributes = []): User
    {
        $user = User::factory()->create($attributes + ['role' => $role]);
        $user->assignRole($role);

        return $user->refresh();
    }

    // ---- users:reconcile-roles ---------------------------------------------

    #[Test]
    public function reconcile_roles_has_nothing_to_do_when_every_user_agrees(): void
    {
        $this->user('seller');

        $this->artisan('users:reconcile-roles')
            ->expectsOutputToContain('Nothing to do')
            ->assertSuccessful();
    }

    #[Test]
    public function reconcile_roles_refuses_to_run_without_roles(): void
    {
        Role::query()->delete();

        $this->artisan('users:reconcile-roles')
            ->expectsOutputToContain('No roles are defined')
            ->assertFailed();
    }

    #[Test]
    public function reconcile_roles_copies_the_assigned_role_onto_an_empty_column(): void
    {
        $user = $this->user('stock_keeper');
        DB::table('users')->where('id', $user->id)->update(['role' => null]);

        $this->artisan('users:reconcile-roles', ['--dry-run' => true])
            ->expectsOutputToContain('Would reconcile 1 user(s).')
            ->assertSuccessful();
        $this->assertNull(DB::table('users')->where('id', $user->id)->value('role'), 'a dry run writes nothing');

        $this->artisan('users:reconcile-roles')
            ->expectsOutputToContain('Reconciled 1 user(s).')
            ->assertSuccessful();
        $this->assertSame('stock_keeper', DB::table('users')->where('id', $user->id)->value('role'));
    }

    #[Test]
    public function reconcile_roles_assigns_the_column_role_to_a_user_with_no_assignment(): void
    {
        $user = $this->user('delivery');
        DB::table('model_has_roles')->where('model_id', $user->id)->delete();

        $this->artisan('users:reconcile-roles')->assertSuccessful();

        $this->assertSame(['delivery'], $user->fresh()->roles->pluck('name')->all());
    }

    #[Test]
    public function reconcile_roles_lets_the_assignment_win_when_the_two_disagree(): void
    {
        $user = $this->user('seller');
        DB::table('users')->where('id', $user->id)->update(['role' => 'admin']);

        $this->artisan('users:reconcile-roles')->assertSuccessful();

        $this->assertSame('seller', DB::table('users')->where('id', $user->id)->value('role'), 'never grants access the user did not have');
    }

    #[Test]
    public function reconcile_roles_skips_a_user_whose_only_role_is_unknown(): void
    {
        $user = $this->user('seller');
        DB::table('model_has_roles')->where('model_id', $user->id)->delete();
        DB::table('users')->where('id', $user->id)->update(['role' => 'wizard']);

        $this->artisan('users:reconcile-roles')
            ->expectsOutputToContain('SKIPPED (unknown role)')
            ->expectsOutputToContain('Reconciled 0 user(s).')
            ->assertSuccessful();

        $this->assertSame('wizard', DB::table('users')->where('id', $user->id)->value('role'));
    }

    // ---- inventory:propose-replenishment -----------------------------------

    /** A store whose shelf is monitored and empty while the store holds 100. */
    private function breachedShelf(): array
    {
        $store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $sv = StoreVariant::factory()->create(['store_id' => $store->id, 'item_variant_id' => $variant->id]);

        ShelfItemBand::query()->create([
            'stock_location_id' => StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->sole()->id,
            'item_id' => $item->id, 'max_units' => 100, 'refill_units' => 10, 'critical_units' => 5,
        ]);
        ItemStock::query()->updateOrCreate(
            ['item_variant_id' => $variant->id, 'location_type' => Store::class, 'location_id' => $store->id],
            ['quantity' => 100, 'min_stock_level' => 0],
        );
        $shelf = $store->inventoryLocations()->shelves()->firstOrFail();
        app(LocationCapacityService::class)->setBand($sv, ItemInventoryLocation::class, (int) $shelf->id, 5, 20);

        return [$store, $variant];
    }

    #[Test]
    public function the_replenishment_sweep_raises_a_proposal_for_a_breached_shelf(): void
    {
        [$store] = $this->breachedShelf();
        Transfer::query()->delete(); // the stock write above may already have triggered the observer

        $this->artisan('inventory:propose-replenishment')
            ->expectsOutputToContain('1 proposal(s) raised')
            ->assertSuccessful();

        $proposal = Transfer::query()->sole();
        $this->assertSame(Transfer::APPROVAL_PENDING, $proposal->approval_state);
        $this->assertSame($store->id, (int) $proposal->to_store_id);
    }

    #[Test]
    public function the_replenishment_dry_run_reports_without_writing(): void
    {
        [, $variant] = $this->breachedShelf();
        Transfer::query()->delete();

        $this->assertSame(0, Artisan::call('inventory:propose-replenishment', ['--dry-run' => true]));
        $output = Artisan::output();
        $this->assertStringContainsString('Would propose', $output);
        $this->assertStringContainsString((string) $variant->fresh()->sku, $output);
        $this->assertStringContainsString('Proposed top-up to 20', $output);

        $this->assertSame(0, Transfer::query()->count());
    }

    #[Test]
    public function the_replenishment_dry_run_says_so_when_nothing_is_short(): void
    {
        $this->artisan('inventory:propose-replenishment', ['--dry-run' => true])
            ->expectsOutputToContain('Every monitored location is above its minimum.')
            ->assertSuccessful();
    }

    #[Test]
    public function the_replenishment_sweep_can_be_limited_to_one_store(): void
    {
        [$store] = $this->breachedShelf();
        Transfer::query()->delete();
        $other = Store::factory()->create(['name' => 'Quiet Store']);

        $this->artisan('inventory:propose-replenishment', ['--store' => $other->id])
            ->expectsOutputToContain("Store #{$other->id} has no variants.")
            ->assertSuccessful();
        $this->assertSame(0, Transfer::query()->count());

        $this->artisan('inventory:propose-replenishment', ['--store' => $store->id])->assertSuccessful();
        $this->assertSame(1, Transfer::query()->count());
    }

    #[Test]
    public function the_replenishment_sweep_lists_warehouse_shortfalls_as_shipments(): void
    {
        $hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $remote = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);
        $sv = StoreVariant::factory()->create(['store_id' => $remote->id, 'item_variant_id' => $variant->id]);
        ItemStock::query()->create(['item_variant_id' => $variant->id, 'location_type' => Store::class, 'location_id' => $hub->id, 'quantity' => 500, 'min_stock_level' => 0]);
        app(LocationCapacityService::class)->setBand($sv, Store::class, (int) $remote->id, 50, 200);

        $this->artisan('inventory:propose-replenishment')
            ->expectsOutputToContain('need a Shipment, not a Transfer')
            ->assertSuccessful();

        $this->artisan('inventory:propose-replenishment', ['--dry-run' => true])
            ->expectsOutputToContain('Needs shipment')
            ->assertSuccessful();

        $this->assertSame(0, Transfer::query()->count());
    }

    // ---- shipments:board-audit ---------------------------------------------

    #[Test]
    public function the_board_audit_warns_when_no_one_has_a_board(): void
    {
        $this->artisan('shipments:board-audit')
            ->expectsOutputToContain('No users hold a role with a shipment board.')
            ->assertSuccessful();
    }

    #[Test]
    public function the_board_audit_explains_each_users_scope(): void
    {
        $store = Store::factory()->create();
        $this->user('admin', ['email' => 'boss@duka.test']);
        $this->user('seller', ['email' => 'seller@duka.test', 'store_id' => $store->id]);
        $this->user('seller', ['email' => 'lost@duka.test', 'store_id' => null]);
        $this->user('stock_keeper', ['email' => 'keeper@duka.test', 'store_id' => null]);
        $this->user('delivery', ['email' => 'courier@duka.test']);

        $this->artisan('shipments:board-audit')
            ->expectsOutputToContain('Shipments in the database: 0')
            ->expectsOutputToContain('unrestricted')
            ->expectsOutputToContain('runs touching store '.$store->id)
            ->expectsOutputToContain('NO STORE')
            ->expectsOutputToContain('every dock')
            ->expectsOutputToContain('own runs + the unclaimed pool')
            ->assertSuccessful();
    }

    #[Test]
    public function the_board_audit_can_be_limited_to_one_role_and_names_roleless_accounts(): void
    {
        $this->user('delivery', ['email' => 'courier@duka.test']);
        $this->user('admin', ['email' => 'boss@duka.test']);
        $roleless = User::factory()->create(['email' => 'nobody@duka.test']);
        DB::table('model_has_roles')->where('model_id', $roleless->id)->delete();
        DB::table('users')->where('id', $roleless->id)->update(['role' => null]);

        $this->artisan('shipments:board-audit', ['--role' => 'delivery'])
            ->expectsOutputToContain('courier@duka.test')
            ->doesntExpectOutputToContain('boss@duka.test')
            ->expectsOutputToContain('nobody@duka.test')
            ->expectsOutputToContain('users:reconcile-roles')
            ->assertSuccessful();
    }

    // ---- dev:generate-domain-map -------------------------------------------

    #[Test]
    public function the_domain_map_is_written_where_asked_with_a_summary(): void
    {
        $path = sys_get_temp_dir().'/duka-domain-map-'.uniqid().'.json';

        try {
            $this->artisan('dev:generate-domain-map', ['--output' => $path])
                ->expectsOutputToContain('Map written to '.$path)
                ->assertSuccessful();

            $map = json_decode((string) file_get_contents($path), true);
            $this->assertIsArray($map);
            $this->assertGreaterThan(100, $map['stats']['routes']);
            $this->assertNotEmpty($map['domains']);

            $this->artisan('dev:generate-domain-map', ['--output' => $path, '--quiet-summary' => true])
                ->doesntExpectOutputToContain('Controllers')
                ->assertSuccessful();
        } finally {
            @unlink($path);
        }
    }

    // ---- e2e helpers ---------------------------------------------------------

    #[Test]
    public function the_e2e_helpers_refuse_any_database_not_named_e2e(): void
    {
        // The suite runs on sqlite ':memory:', which is not a *_e2e database.
        $this->artisan('e2e:prepare')
            ->expectsOutputToContain('Refusing to run')
            ->assertFailed();

        $this->artisan('e2e:inspect', ['what' => 'stock', 'key' => '1'])
            ->expectsOutputToContain('Refusing to run')
            ->assertFailed();

        $this->assertSame(0, User::query()->where('email', 'like', 'e2e.%')->count());
    }

    #[Test]
    public function the_demo_staff_refuse_production_and_the_e2e_copy_and_need_a_sellable_store(): void
    {
        $fixture = base_path(\App\Console\Commands\Dev\DemoStaffCommand::FIXTURE);
        $before = is_file($fixture) ? md5_file($fixture) : null;

        // An empty database: no store can sell anything, so nobody is made.
        $this->artisan('dev:demo-staff')->expectsOutputToContain('No store has enough priced items')->assertFailed();

        // The default connection's name, so the guard is tested on MySQL runs too.
        $key = 'database.connections.'.config('database.default').'.database';
        $database = config($key);
        config([$key => 'duka_e2e']);
        $this->artisan('dev:demo-staff')->expectsOutputToContain('dev only')->assertFailed();
        config([$key => $database]);

        $this->app['env'] = 'production';
        try {
            $this->artisan('dev:demo-staff')->expectsOutputToContain('dev only')->assertFailed();
        } finally {
            $this->app['env'] = 'testing';
        }

        $this->assertSame(0, User::query()->count());
        $this->assertSame($before, is_file($fixture) ? md5_file($fixture) : null, 'The dev fixture file was not touched.');
    }

    // ---- catalogue:export ----------------------------------------------------

    #[Test]
    public function the_catalogue_export_writes_the_sheets_and_the_interview(): void
    {
        $store = Store::factory()->create(['name' => 'Bole Store']);
        Store::factory()->create(['name' => 'Demo Store']);
        $item = Item::factory()->create(['product_name' => 'Thermos flask']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->firstOrFail();
        ItemStock::query()->create(['item_variant_id' => $variant->id, 'location_type' => StockLocation::class, 'location_id' => $shelf->id, 'stock_location_id' => $shelf->id, 'quantity' => 7, 'min_stock_level' => 0]);

        $dir = sys_get_temp_dir().'/duka-catalogue-'.uniqid();

        try {
            $this->artisan('catalogue:export', ['--dir' => $dir])->expectsOutputToContain('Written to')->assertSuccessful();

            foreach (['INTERVIEW.md', 'catalogue-for-ai.md', 'items.csv', 'categories.csv', 'locations.csv'] as $file) {
                $this->assertFileExists("{$dir}/{$file}");
            }

            $items = array_map('str_getcsv', file("{$dir}/items.csv", FILE_IGNORE_NEW_LINES));
            $header = array_shift($items);
            $row = collect($items)->firstWhere(1, 'Thermos flask');
            $this->assertNotNull($row);
            $this->assertSame('7', $row[array_search('pieces: Bole Store · Store Shelf', $header, true)]);
            $this->assertStringNotContainsString('Demo Store', (string) file_get_contents("{$dir}/locations.csv"));
            $this->assertStringContainsString("#{$item->id} Thermos flask", (string) file_get_contents("{$dir}/catalogue-for-ai.md"));
        } finally {
            array_map('unlink', glob("{$dir}/*") ?: []);
            @rmdir($dir);
        }
    }

    #[Test]
    public function the_e2e_helpers_refuse_production_even_on_an_e2e_database(): void
    {
        config(['database.connections.sqlite.database' => 'duka_e2e']);
        $this->app['env'] = 'production';

        try {
            $this->artisan('e2e:prepare')->expectsOutputToContain('Refusing to run')->assertFailed();
            $this->artisan('e2e:inspect', ['what' => 'stock', 'key' => '1'])->expectsOutputToContain('Refusing to run')->assertFailed();
        } finally {
            $this->app['env'] = 'testing';
        }
    }
}
