<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use App\Models\Inventory\LocationStaff;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Dev\SellablePicks;
use App\Services\StockKeeperService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Demo staff for watching the real sale flow on the dev database (make walkthrough):
 * a seller, a store manager, two stock keepers and a courier in a store that has sellable
 * items, a hub keeper and a global admin, plus a demo bank account (DEMO-0001) and a
 * settlement account (DEMO-SET-01) the manager owns. Unlike e2e:prepare it changes no stock
 * or prices; the walkthroughs move stock the way staff would.
 *
 * Writes e2e/.fixture/demo.json (git-ignored) with the people, the store, two items
 * and a fresh password, in the shape the Playwright flows read.
 *
 * Dev only: it refuses production and the throwaway *_e2e copy.
 */
final class DemoStaffCommand extends Command
{
    /** @var string */
    protected $signature = 'dev:demo-staff {--items=2 : How many sellable items to pick}';

    /** @var string */
    protected $description = 'Create the demo seller, manager and stock keeper on the dev database (for make walkthrough)';

    public const FIXTURE = 'e2e/.fixture/demo.json';

    public function handle(SellablePicks $picks): int
    {
        $database = (string) config('database.connections.'.config('database.default').'.database');

        if (app()->environment('production') || str_ends_with($database, '_e2e')) {
            $this->components->error("Refusing to run against '{$database}': dev only (not production, not the e2e copy).");

            return self::FAILURE;
        }

        [$store, $items] = $picks->pick(max(1, (int) $this->option('items')));

        if ($store === null) {
            $this->components->error('No store has enough priced items with free stock on its shelf or floor.');

            return self::FAILURE;
        }

        // Kept between runs, so sellers hired by an earlier admin walkthrough can still sign in.
        $previous = is_file(base_path(self::FIXTURE)) ? json_decode((string) file_get_contents(base_path(self::FIXTURE)), true) : null;
        $password = is_array($previous) && is_string($previous['password'] ?? null) && $previous['password'] !== ''
            ? $previous['password']
            : Str::password(16, symbols: false);
        $seller = $this->user('seller', 'seller', 'Seller', '0977000001', $store, $password);
        $manager = $this->user('store_manager', 'manager', 'Manager', '0977000002', $store, $password);
        $keeper = $this->user('stock_keeper', 'keeper', 'Keeper', '0977000003', $store, $password);
        $courier = $this->user('delivery', 'courier', 'Courier', '0977000004', $store, $password);
        // A second keeper: a count or a shortfall is settled by someone other than who counted it.
        $keeper2 = $this->user('stock_keeper', 'keeper-2', 'Keeper Two', '0977000005', $store, $password);
        // No store: works the main hub's dock (a keeper with no store covers every dock).
        $hubKeeper = $this->user('stock_keeper', 'hub-keeper', 'Hub Keeper', '0977000006', null, $password);
        // A global admin (no store): opens shipments, gives credit, adds stores and staff.
        $admin = $this->user('admin', 'admin', 'Admin', '0977000007', null, $password);
        // Buying: whoever raises a purchase order never approves it, so two buyers; finance confirms payments.
        $buyer = $this->user('procurement', 'buyer', 'Buyer', '0977000008', $store, $password);
        $buyer2 = $this->user('procurement', 'buyer-2', 'Buyer Two', '0977000009', null, $password);
        $finance = $this->user('finance', 'finance', 'Finance', '0977000010', $store, $password);

        // Where a customer pays by bank transfer; the manager, who owns it, confirms what arrives.
        $account = PaymentAccount::query()->updateOrCreate(
            ['account_number' => 'DEMO-0001'],
            [
                'store_id' => $store->id,
                'type' => 'bank',
                'provider' => 'cbe',
                'account_name' => 'Demo Bank Account',
                'owner_user_id' => $manager->id,
                'purpose' => 'collection',
                'is_active' => true,
            ],
        );

        // Where sellers hand their day's cash over; the manager owns it and confirms each handover.
        $settlement = PaymentAccount::query()->updateOrCreate(
            ['account_number' => 'DEMO-SET-01'],
            [
                'store_id' => $store->id,
                'type' => 'bank',
                'provider' => 'cbe',
                'account_name' => 'Demo Settlement Account',
                'owner_user_id' => $manager->id,
                'purpose' => PaymentAccount::PURPOSE_SETTLEMENT,
                'is_active' => true,
            ],
        );
        $settlement->remitters()->syncWithoutDetaching([$seller->id]);

        // Once a location has assigned people only they may hand stock out; the keepers staff the store.
        // The hubs are left as they are, so dev's own keepers keep working them.
        $storeNode = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->first();
        if ($storeNode !== null) {
            foreach ([$keeper, $keeper2] as $staff) {
                LocationStaff::query()->firstOrCreate(['stock_location_id' => $storeNode->id, 'user_id' => $staff->id]);
            }
        }

        $hub = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('id')->first();
        $remoteHub = StockLocation::query()->where('kind', StockLocation::KIND_REMOTE_HUB)->where('store_id', $store->id)->first();
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->orderBy('id')->first();
        $floor = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->orderBy('id')->first();

        // What the stock walkthroughs move: a variant the main hub holds plenty of, preferably of
        // an item with a bin on the store's shelf, so the same goods can go hub → Remote Hub →
        // floor → shelf.
        $binned = $shelf === null ? [] : ShelfItemBand::query()->where('stock_location_id', $shelf->id)->pluck('item_id')->all();
        // The same goods every run while the hub still holds them, so a walkthrough run on its own
        // (ARGS=transfer) finds what an earlier shipment run brought to the Remote Hub.
        $kept = (int) (is_array($previous) ? ($previous['hubVariant']['id'] ?? 0) : 0);
        $hubStock = $hub === null ? null : ItemStock::query()
            ->where('stock_location_id', $hub->id)
            ->where('quantity', '>=', 20)
            ->join('item_variants', 'item_variants.id', '=', 'item_stocks.item_variant_id')
            ->orderByRaw('item_stocks.item_variant_id = ? DESC', [$kept])
            ->orderByRaw('item_variants.item_id IN ('.($binned === [] ? '0' : implode(',', array_map('intval', $binned))).') DESC')
            ->orderByDesc('item_stocks.quantity')
            ->select('item_stocks.*', 'item_variants.item_id', 'item_variants.sku')
            ->first();
        $hubOption = $hubStock === null ? null : app(StockKeeperService::class)
            ->variantOptions(atLocationId: $hub->id)
            ->firstWhere('id', (int) $hubStock->item_variant_id);

        $person = fn (User $user): array => ['id' => $user->id, 'email' => $user->email, 'name' => trim($user->first_name.' '.$user->last_name)];

        $fixture = [
            'password' => $password,
            'store' => ['id' => $store->id, 'name' => $store->name],
            'seller' => $person($seller),
            'manager' => $person($manager),
            'keeper' => $person($keeper),
            'courier' => $person($courier),
            'account' => ['id' => $account->id, 'number' => $account->account_number],
            'settlement' => ['id' => $settlement->id, 'number' => $settlement->account_number],
            'people' => [
                'admin' => $person($admin), 'hubKeeper' => $person($hubKeeper), 'keeper2' => $person($keeper2),
                'procurement' => $person($buyer), 'procurement2' => $person($buyer2), 'finance' => $person($finance),
            ],
            'hub' => $hub === null ? null : ['id' => $hub->id, 'name' => $hub->name],
            'remoteHub' => $remoteHub === null ? null : ['id' => $remoteHub->id, 'name' => $remoteHub->name],
            'locations' => ['hub' => $hub?->id, 'remoteHub' => $remoteHub?->id, 'shelf' => $shelf?->id, 'floor' => $floor?->id,
                'transit' => StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->value('id')],
            // The transfer helpers (e2e/lib/transfers.ts) raise transfers of the "remote" variant:
            // here the same goods the shipment walkthrough brings to the Remote Hub.
            'remoteVariant' => $hubStock === null ? null : [
                'id' => (int) $hubStock->item_variant_id,
                'sku' => (string) $hubStock->sku,
                'item' => (string) \App\Models\Item\Item::query()->whereKey($hubStock->item_id)->value('product_name'),
            ],
            'hubVariant' => $hubStock === null ? null : [
                'id' => (int) $hubStock->item_variant_id,
                'item_id' => (int) $hubStock->item_id,
                'item' => (string) \App\Models\Item\Item::query()->whereKey($hubStock->item_id)->value('product_name'),
                'sku' => (string) $hubStock->sku,
                'quantity' => (int) $hubStock->quantity,
                'label' => $hubOption['label'] ?? null,
                'binned' => in_array((int) $hubStock->item_id, array_map('intval', $binned), true),
            ],
            'items' => array_map(fn (array $item): array => $item + [
                'variant' => (int) ItemVariant::query()->where('item_id', $item['item_id'])->orderBy('id')->value('id'),
            ], $items),
        ];

        $path = base_path(self::FIXTURE);
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }
        file_put_contents($path, json_encode($fixture, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        chmod($path, 0600);

        $this->components->info("Demo staff ready in {$store->name}; the password is in ".self::FIXTURE);
        $this->components->bulletList([
            "Demo Seller   {$seller->email}   (seller app)",
            "Demo Manager  {$manager->email}  (seller app: confirms payments)",
            "Demo Keeper   {$keeper->email}   (stock keeper app)",
            "Demo Courier  {$courier->email}  (delivery app)",
            "Demo Keeper Two {$keeper2->email} (stock keeper app: approves counts, settles shortfalls)",
            "Demo Hub Keeper {$hubKeeper->email} (stock keeper app: the main hub's dock)",
            "Demo Admin    {$admin->email}    (admin app, all stores)",
            "Demo Buyer / Buyer Two  {$buyer->email}, {$buyer2->email}  (procurement app)",
            "Demo Finance  {$finance->email}  (finance app)",
            "Bank account  {$account->account_number} (Demo Bank Account) and {$settlement->account_number} (settlement), owned by Demo Manager",
            'Stock walkthroughs move: '.($hubStock === null ? 'nothing (no main hub stock)' : "{$hubStock->sku} from {$hub->name}"),
            'Items: '.implode(', ', array_column($items, 'name')),
        ]);

        return self::SUCCESS;
    }

    private function user(string $role, string $key, string $last, string $phone, ?Store $store, string $password): User
    {
        $user = User::query()->updateOrCreate(
            ['email' => "demo.{$key}@duka.test"],
            [
                'first_name' => 'Demo',
                'last_name' => $last,
                'phone_number' => $phone,
                'role' => $role,
                'store_id' => $store?->id,
                'is_driver' => $role === 'delivery',
                'password' => Hash::make($password),
                'email_verified_at' => now(),
            ],
        );

        Role::findOrCreate($role, 'web');
        $user->syncRoles([$role]);

        return $user;
    }
}
