<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\PriceProvider;
use App\Services\Seller\SellerCatalog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

/**
 * Readies the throwaway duka_e2e copy for Playwright (./deploy/dev.sh e2e): a test
 * seller, store manager, courier and stock keeper in one store, a bank account the
 * manager owns, and items with a price and free stock on the shelf or floor.
 * Prints the fixture as JSON for the specs.
 *
 * It refuses any database not named *_e2e, so it can never touch dev or prod.
 */
final class PrepareE2eCommand extends Command
{
    /** @var string */
    protected $signature = 'e2e:prepare {--items=2 : How many stocked items to pick}';

    /** @var string */
    protected $description = 'Create the Playwright test users, account and item picks in the *_e2e database';

    public const PASSWORD = 'e2e-password';

    public function handle(SellerCatalog $catalog): int
    {
        $database = (string) config('database.connections.'.config('database.default').'.database');

        if (! str_ends_with($database, '_e2e') || app()->environment('production')) {
            $this->components->error("Refusing to run against '{$database}': only a *_e2e database outside production.");

            return self::FAILURE;
        }

        $wanted = max(1, (int) $this->option('items'));
        [$store, $items] = $this->pickStore($catalog, $wanted);

        if ($store === null) {
            $this->components->error("No store has {$wanted} priced single-variant items with free stock on its shelf or floor.");

            return self::FAILURE;
        }

        $seller = $this->user('seller', 'E2E', 'Seller', '0999000001', $store);
        $manager = $this->user('store_manager', 'E2E', 'Manager', '0999000002', $store);
        $courier = $this->user('delivery', 'E2E', 'Courier', '0999000003', $store);
        $keeper = $this->user('stock_keeper', 'E2E', 'Keeper', '0999000004', $store);

        $account = PaymentAccount::query()->updateOrCreate(
            ['account_number' => 'E2E-0001'],
            [
                'store_id' => $store->id,
                'type' => 'bank',
                'provider' => 'cbe',
                'account_name' => 'E2E Manager',
                'owner_user_id' => $manager->id,
                'purpose' => 'collection',
                'is_active' => true,
            ],
        );

        $this->line((string) json_encode([
            'password' => self::PASSWORD,
            'store' => ['id' => $store->id, 'name' => $store->name],
            'seller' => ['id' => $seller->id, 'email' => $seller->email, 'name' => 'E2E Seller'],
            'manager' => ['id' => $manager->id, 'email' => $manager->email, 'name' => 'E2E Manager'],
            'courier' => ['id' => $courier->id, 'email' => $courier->email, 'name' => 'E2E Courier'],
            'keeper' => ['id' => $keeper->id, 'email' => $keeper->email, 'name' => 'E2E Keeper'],
            'account' => ['id' => $account->id, 'number' => $account->account_number],
            'items' => $items,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }

    /**
     * The first store that can sell $wanted items whose every variant is
     * priced and has free stock on its shelf or floor, so whichever variant
     * the add-to-cart sheet starts on can be sold and picked. Items with the
     * fewest variants come first.
     *
     * @return array{0: ?Store, 1: array<int, array<string, mixed>>}
     */
    private function pickStore(SellerCatalog $catalog, int $wanted): array
    {
        foreach (Store::query()->orderBy('id')->get() as $store) {
            $leaves = $catalog->storeLeaves((int) $store->id);
            $locations = [...$leaves['shelf'], ...$leaves['floor']];

            if ($locations === []) {
                continue;
            }

            $held = StockReservation::query()
                ->where('store_id', $store->id)
                ->where('status', StockReservation::STATUS_OPEN)
                ->whereIn('stock_location_id', $locations)
                ->groupBy('item_variant_id')
                ->selectRaw('item_variant_id, SUM(quantity) AS quantity')
                ->pluck('quantity', 'item_variant_id');

            $picks = Item::query()
                ->withCount('variants')
                ->having('variants_count', '>', 0)
                ->orderBy('variants_count')
                ->orderBy('id')
                ->with('variants')
                ->get()
                // Lazy, so the per-item checks stop once enough items pass.
                ->lazy()
                ->filter(function (Item $item) use ($store, $locations, $held): bool {
                    $storeVariants = StoreVariant::query()
                        ->where('store_id', $store->id)
                        ->where('active', true)
                        ->whereIn('item_variant_id', $item->variants->pluck('id'))
                        ->with(['stocks' => fn ($stock) => $stock->whereIn('stock_location_id', $locations)])
                        ->get();

                    if ($storeVariants->count() !== $item->variants->count()) {
                        return false;
                    }

                    return $storeVariants->every(fn (StoreVariant $storeVariant): bool =>
                        (int) $storeVariant->stocks->sum('quantity') - (int) ($held[$storeVariant->item_variant_id] ?? 0) >= 10
                        && PriceProvider::getPriceLadder((int) $storeVariant->id, (int) $store->id) !== []);
                })
                ->take($wanted)
                ->map(fn (Item $item): array => [
                    'item_id' => (int) $item->id,
                    'name' => (string) $item->product_name,
                    'variants' => (int) $item->variants_count,
                ])
                ->values();

            if ($picks->count() === $wanted) {
                return [$store, $picks->all()];
            }
        }

        return [null, []];
    }

    private function user(string $role, string $first, string $last, string $phone, Store $store): User
    {
        $user = User::query()->updateOrCreate(
            ['email' => 'e2e.'.str_replace('_', '-', $role).'@duka.test'],
            [
                'first_name' => $first,
                'last_name' => $last,
                'phone_number' => $phone,
                'role' => $role,
                'store_id' => $store->id,
                'is_driver' => $role === 'delivery',
                'password' => Hash::make(self::PASSWORD),
                'email_verified_at' => now(),
            ],
        );

        // Older dev data may predate a role (store_manager came later).
        Role::findOrCreate($role, 'web');
        $user->syncRoles([$role]);

        return $user;
    }
}
