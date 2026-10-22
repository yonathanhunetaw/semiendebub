<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Inventory\LocationStaff;
use App\Models\Inventory\StockLocation;
use App\Models\Finance\PaymentAccount;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\PriceProvider;
use App\Services\Dev\SellablePicks;
use App\Services\Seller\SellerCatalog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
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
        // One extra stocked item carries the known prices for the pricing specs.
        [$store, $picked] = app(SellablePicks::class)->pick($wanted + 1);
        $priceItem = $picked === [] ? null : array_pop($picked);
        $items = $picked;

        if ($store === null) {
            $this->components->error("No store has {$wanted} priced single-variant items with free stock on its shelf or floor.");

            return self::FAILURE;
        }

        $noStockItem = $this->noStockItem($catalog, $store, $items);

        if ($noStockItem === null) {
            $this->components->error('No other priced item in the store to use as the out-of-stock item.');

            return self::FAILURE;
        }

        $seller = $this->user('seller', 'seller', 'E2E', 'Seller', '0999000001', $store);
        $manager = $this->user('store_manager', 'store-manager', 'E2E', 'Manager', '0999000002', $store);
        $courier = $this->user('delivery', 'delivery', 'E2E', 'Courier', '0999000003', $store);
        $keeper = $this->user('stock_keeper', 'stock-keeper', 'E2E', 'Keeper', '0999000004', $store);

        // Everyone else, so the role specs can walk every app.
        $people = [
            'seller2' => $this->user('seller', 'seller-2', 'E2E', 'Seller Two', '0999000005', $store),
            'admin' => $this->user('admin', 'admin', 'E2E', 'Admin', '0999000006', null),
            'storeAdmin' => $this->user('admin', 'store-admin', 'E2E', 'Store Admin', '0999000007', $store),
            'hubKeeper' => $this->user('stock_keeper', 'hub-keeper', 'E2E', 'Hub Keeper', '0999000008', null),
            'finance' => $this->user('finance', 'finance', 'E2E', 'Finance', '0999000009', $store),
            'procurement' => $this->user('procurement', 'procurement', 'E2E', 'Procurement', '0999000010', $store),
            'marketing' => $this->user('marketing', 'marketing', 'E2E', 'Marketing', '0999000011', $store),
            'vendor' => $this->user('vendor', 'vendor', 'E2E', 'Vendor', '0999000012', null),
            'dev' => $this->user('dev', 'dev', 'E2E', 'Dev', '0999000013', null),
            'shared' => $this->user('shared', 'shared', 'E2E', 'Shared', '0999000014', $store),
            'manager2' => $this->user('store_manager', 'store-manager-2', 'E2E', 'Manager Two', '0999000015', $store),
            // A second keeper on the same posts: a stocktake is approved by someone other than its counter.
            'keeper2' => $this->user('stock_keeper', 'stock-keeper-2', 'E2E', 'Keeper Two', '0999000016', $store),
            // A second buyer: a purchase order is approved by someone other than whoever raised it.
            'procurement2' => $this->user('procurement', 'procurement-2', 'E2E', 'Procurement Two', '0999000017', null),
        ];

        $hub = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('id')->first();
        $remoteHub = StockLocation::query()->where('kind', StockLocation::KIND_REMOTE_HUB)->where('store_id', $store->id)->first();

        // The hub keeper works the main hub's dock, the store keeper the store's.
        // Once a location has assigned people only they may hand stock in or out
        // (StockLocation::canBeOperatedBy), and the dev data already assigns some.
        if ($hub !== null) {
            LocationStaff::query()->firstOrCreate(['stock_location_id' => $hub->id, 'user_id' => $people['hubKeeper']->id]);
        }
        // The store keepers staff the whole store: its floor, its shelf and its Remote Hub.
        $storeNode = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_STORE)->first();
        foreach (array_filter([$storeNode, $remoteHub]) as $location) {
            foreach ([$keeper, $people['keeper2']] as $staff) {
                LocationStaff::query()->firstOrCreate(['stock_location_id' => $location->id, 'user_id' => $staff->id]);
            }
        }

        // Something the main hub can ship, as the admin's manifest picker lists it.
        $hubVariant = $hub === null ? null : ItemStock::query()
            ->where('stock_location_id', $hub->id)
            ->where('quantity', '>=', 5)
            ->orderBy('item_variant_id')
            ->first();
        $hubOption = $hubVariant === null ? null : app(\App\Services\StockKeeperService::class)
            ->variantOptions(atLocationId: $hub->id)
            ->firstWhere('id', (int) $hubVariant->item_variant_id);

        // Stock waiting in the Remote Hub, for the refill transfer to the store floor:
        // twenty of the second stocked item's first variant.
        $remoteVariant = null;
        if ($remoteHub !== null && isset($items[1])) {
            $variant = ItemVariant::query()->where('item_id', $items[1]['item_id'])->orderBy('id')->first();
            if ($variant !== null) {
                // Through the ledger, topped up to twenty so reruns do not pile up.
                $held = (int) ItemStock::query()->where('item_variant_id', $variant->id)->where('stock_location_id', $remoteHub->id)->sum('quantity');
                if ($held < 20) {
                    app(\App\Services\StockService::class)->receive((int) $variant->id, $remoteHub, 20 - $held, ['reason' => 'E2E fixture']);
                }
                $remoteVariant = ['id' => (int) $variant->id, 'sku' => (string) $variant->sku, 'item' => $items[1]['name'], 'quantity' => 20];
            }
        }

        // A planogram bin on the Store Shelf for the remote variant's item, so it may be
        // shelved; the first stocked item gets none, so shelving it is refused.
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->orderBy('id')->first();
        if ($shelf !== null && isset($items[1], $items[0])) {
            // Room for exactly 5 more pieces (the engine counts pieces: a carton is many), so a
            // refill is one 5-piece floor → shelf task.
            $ladder = app(\App\Services\Inventory\PackagingLadder::class);
            $onShelf = (int) ItemStock::query()
                ->where('stock_location_id', $shelf->id)
                ->whereIn('item_variant_id', ItemVariant::query()->where('item_id', $items[1]['item_id'])->pluck('id'))
                ->get(['item_variant_id', 'quantity'])
                ->sum(fn ($row): int => (int) $row->quantity * $ladder->piecesPerUnit((int) $row->item_variant_id));
            \App\Models\Inventory\ShelfItemBand::query()->updateOrCreate(
                ['stock_location_id' => $shelf->id, 'item_id' => $items[1]['item_id']],
                ['max_units' => $onShelf + 5, 'refill_units' => $onShelf + 2, 'critical_units' => 1, 'updated_by' => $manager->id],
            );
            \App\Models\Inventory\ShelfItemBand::query()
                ->where('stock_location_id', $shelf->id)
                ->where('item_id', $items[0]['item_id'])
                ->delete();
        }

        $customers = $this->customers($store, $seller);
        $discounts = $this->discounts($store, [...$items, $priceItem, $noStockItem]);
        $adminPriced = $discounts['plain'] ?? null;
        unset($discounts['plain']);
        $prices = $priceItem === null ? null : $this->setPrices($store, (int) $priceItem['item_id'], $seller, $customers['priced']);
        $refillItem = $this->refillItem($catalog, $store, $shelf, $remoteHub, [...$items, $priceItem, $noStockItem, ...array_values($discounts), $adminPriced], $manager);

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

        // Where sellers hand their cash over: a settlement account the manager owns.
        $settlement = PaymentAccount::query()->updateOrCreate(
            ['account_number' => 'E2E-SET-01'],
            [
                'store_id' => $store->id,
                'type' => 'bank',
                'provider' => 'cbe',
                'account_name' => 'E2E Settlement',
                'owner_user_id' => $manager->id,
                'purpose' => PaymentAccount::PURPOSE_SETTLEMENT,
                'is_active' => true,
            ],
        );
        $settlement->remitters()->syncWithoutDetaching([$seller->id, $people['seller2']->id]);

        // A car for the staff transport spec (work/rides), free of other runs.
        $van = \App\Models\Fulfillment\Vehicle::query()->updateOrCreate(
            ['plate' => 'E2E-VAN'],
            ['name' => 'E2E Van', 'max_cbm' => 6, 'payload_kg' => 1000, 'status' => \App\Models\Fulfillment\Vehicle::STATUS_ACTIVE],
        );

        // A shipment waiting to be loaded, for the Guide world's freight car (e2e/stock/play.spec.ts):
        // scheduled from the main hub to the store's Remote Hub on the E2E van, nothing picked.
        // Put back to that on every run, so a spec that loads it never leaves it loaded.
        $playLoad = null;
        if ($hub !== null && $remoteHub !== null && $hubVariant !== null) {
            $shipment = \App\Models\Fulfillment\Shipment::query()->updateOrCreate(['reference' => 'SHP-E2E-PLAY'], [
                'origin_store_id' => $hub->legacy_id ?? $hub->store_id,
                'destination_store_id' => $store->id,
                'origin_stock_location_id' => $hub->id,
                'destination_stock_location_id' => $remoteHub->id,
                'vehicle_id' => $van->id,
                'vehicle_name' => $van->name,
                'vehicle_plate' => $van->plate,
                'vehicle_max_cbm' => $van->max_cbm,
                // The courier on the run, for the hand-off steps after "prepared" (the world's courier and receiver specs).
                'courier_id' => $courier->id,
                'status' => 'scheduled',
                'picked_at' => null, 'prepared_at' => null, 'prepared_by' => null,
                'courier_started_at' => null, 'courier_checked_at' => null, 'courier_signed_at' => null, 'courier_signature' => null,
                'dispatched_at' => null, 'in_transit_at' => null, 'delivered_at' => null,
                'receiver_checked_at' => null, 'received_at' => null, 'received_by' => null, 'receiver_signature' => null,
            ]);
            $shipment->items()->delete();
            $quantity = min(4, (int) $hubVariant->quantity);
            $shipment->items()->create(['item_variant_id' => (int) $hubVariant->item_variant_id, 'quantity' => $quantity, 'picked_quantity' => 0]);
            $playLoad = ['id' => $shipment->id, 'reference' => $shipment->reference, 'variant' => (int) $hubVariant->item_variant_id, 'quantity' => $quantity];
        }

        $this->line((string) json_encode([
            'password' => self::PASSWORD,
            'playLoad' => $playLoad,
            'vehicle' => ['id' => $van->id, 'name' => $van->name, 'plate' => $van->plate],
            'store' => ['id' => $store->id, 'name' => $store->name],
            'seller' => ['id' => $seller->id, 'email' => $seller->email, 'name' => 'E2E Seller'],
            'manager' => ['id' => $manager->id, 'email' => $manager->email, 'name' => 'E2E Manager'],
            'courier' => ['id' => $courier->id, 'email' => $courier->email, 'name' => 'E2E Courier'],
            'keeper' => ['id' => $keeper->id, 'email' => $keeper->email, 'name' => 'E2E Keeper'],
            'account' => ['id' => $account->id, 'number' => $account->account_number],
            'settlement' => ['id' => $settlement->id, 'number' => $settlement->account_number],
            // Each item with the variant its add-to-cart sheet starts on (the lowest id).
            'items' => array_map(fn (array $item): array => $item + [
                'variant' => (int) ItemVariant::query()->where('item_id', $item['item_id'])->orderBy('id')->value('id'),
            ], $items),
            'noStockItem' => $noStockItem,
            // Where stock sits, for the specs that check the ledger (e2e:inspect).
            'locations' => [
                'shelf' => $shelf?->id,
                'floor' => StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->value('id'),
                'remoteHub' => $remoteHub?->id,
                'hub' => $hub?->id,
                'transit' => StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->value('id'),
            ],
            'people' => collect($people)->map(fn (User $user): array => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => trim($user->first_name.' '.$user->last_name),
            ])->all(),
            'hub' => $hub === null ? null : ['id' => $hub->id, 'name' => $hub->name],
            'hubVariant' => $hubVariant === null ? null : [
                'id' => (int) $hubVariant->item_variant_id,
                'quantity' => (int) $hubVariant->quantity,
                'label' => $hubOption['label'] ?? null,
                'sku' => $hubOption['sku'] ?? null,
            ],
            'remoteVariant' => $remoteVariant,
            'remoteHub' => $remoteHub === null ? null : ['id' => $remoteHub->id, 'name' => $remoteHub->name],
            'refillItem' => $refillItem,
            'customers' => collect($customers)->map(fn (Customer $customer): array => [
                'id' => $customer->id,
                'name' => trim($customer->first_name.' '.$customer->last_name),
                'phone' => $customer->phone_number,
                'tin' => $customer->tin_number,
            ])->all(),
            'discounts' => $discounts,
            'priceItem' => $priceItem === null ? null : [...$priceItem, 'prices' => $prices],
            // Only a store price of 30; Admin → Stores sets the rest in admin/pricing.
            'adminPriced' => $adminPriced === null ? null : [
                'item_id' => $adminPriced['item_id'],
                'name' => $adminPriced['name'],
                'price' => $adminPriced['price'],
                'variants' => ItemVariant::query()->where('item_id', $adminPriced['item_id'])->orderBy('id')->get(['id', 'sku'])
                    ->map(fn (ItemVariant $variant): array => ['id' => (int) $variant->id, 'sku' => (string) $variant->sku])->all(),
            ],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }

    /**
     * An item the store prices but cannot supply: another priced item whose stock
     * is zeroed on the shelf, floor and Remote Hub. Safe because this command only
     * ever runs against the throwaway *_e2e copy. Lets specs prove what happens when
     * a seller adds something nobody has.
     *
     * @param  array<int, array<string, mixed>>  $taken  items already picked as stocked
     * @return ?array<string, mixed>
     */
    private function noStockItem(SellerCatalog $catalog, Store $store, array $taken): ?array
    {
        $leaves = $catalog->storeLeaves((int) $store->id);
        $locations = array_values(array_filter([...$leaves['shelf'], ...$leaves['floor'], $leaves['remote']]));

        $item = Item::query()
            ->withCount('variants')
            ->having('variants_count', '>', 0)
            ->whereNotIn('id', array_column($taken, 'item_id'))
            ->orderBy('variants_count')
            ->orderBy('id')
            ->with('variants')
            ->get()
            ->first(function (Item $item) use ($store): bool {
                $storeVariants = StoreVariant::query()
                    ->where('store_id', $store->id)
                    ->where('active', true)
                    ->whereIn('item_variant_id', $item->variants->pluck('id'))
                    ->get();

                return $storeVariants->count() === $item->variants->count()
                    && $storeVariants->every(fn (StoreVariant $storeVariant): bool =>
                        PriceProvider::getPriceLadder((int) $storeVariant->id, (int) $store->id) !== []);
            });

        if ($item === null) {
            return null;
        }

        ItemStock::query()
            ->whereIn('item_variant_id', $item->variants->pluck('id'))
            ->whereIn('stock_location_id', $locations)
            ->update(['quantity' => 0]);

        return [
            'item_id' => (int) $item->id,
            'name' => (string) $item->product_name,
            'variants' => (int) $item->variants_count,
        ];
    }

    /**
     * Fixed customers for the pricing specs: an individual (a TIN), a business
     * with its own customer price, and a business with none.
     *
     * @return array{individual: Customer, priced: Customer, business: Customer}
     */
    private function customers(Store $store, User $seller): array
    {
        $make = fn (string $key, string $last, string $phone, ?string $tin): Customer => Customer::query()->updateOrCreate(
            ['email' => "e2e.customer-{$key}@duka.test"],
            [
                'first_name' => 'E2E',
                'last_name' => $last,
                'name' => "E2E {$last}",
                'phone_number' => $phone,
                'phone' => $phone,
                'tin_number' => $tin,
                'store_id' => $store->id,
                'created_by' => $seller->id,
            ],
        );

        return [
            'individual' => $make('individual', 'Price Individual', '0988000001', '0000000001'),
            'priced' => $make('priced', 'Price Contract', '0988000002', null),
            'business' => $make('business', 'Price Business', '0988000003', null),
        ];
    }

    /**
     * Known prices on every variant of the price item, one per level of the
     * ladder (PriceProvider): store 100, individual 90, the E2E seller's own
     * 85 (individual) / 95 (business), and 70 for the contract customer.
     * The ladder's last level wins, so each spec can predict its line price.
     *
     * @return array<string, float>
     */
    private function setPrices(Store $store, int $itemId, User $seller, Customer $contract): array
    {
        $prices = ['store' => 100.0, 'individual' => 90.0, 'sellerIndividual' => 85.0, 'sellerBusiness' => 95.0, 'customer' => 70.0];
        $matrix = fn (float $price): string => (string) json_encode(['price' => $price]);

        // store_variants.item_id is not filled in; go through the item's variants.
        $storeVariants = StoreVariant::query()
            ->where('store_id', $store->id)
            ->whereIn('item_variant_id', ItemVariant::query()->where('item_id', $itemId)->pluck('id'))
            ->pluck('id');

        foreach ($storeVariants as $id) {
            DB::table('store_variants')->where('id', $id)->update(['pricing_matrix' => $matrix($prices['store'])]);
            DB::table('store_variants_individual_prices')->updateOrInsert(
                ['store_variant_id' => $id],
                ['pricing_matrix' => $matrix($prices['individual']), 'active' => true, 'updated_at' => now(), 'created_at' => now()],
            );
            DB::table('store_variants_seller_prices')->updateOrInsert(
                ['store_variant_id' => $id, 'seller_id' => $seller->id],
                [
                    'pricing_matrix' => json_encode(['individual' => ['price' => $prices['sellerIndividual']], 'business' => ['price' => $prices['sellerBusiness']]]),
                    'active' => true, 'updated_at' => now(), 'created_at' => now(),
                ],
            );
            DB::table('store_variants_customer_prices')->updateOrInsert(
                ['store_variant_id' => $id, 'customer_id' => $contract->id],
                ['pricing_matrix' => $matrix($prices['customer']), 'active' => true, 'updated_at' => now(), 'created_at' => now()],
            );
            // Nobody else's seller price may leak into the second seller's ladder.
            DB::table('store_variants_seller_prices')->where('store_variant_id', $id)->where('seller_id', '!=', $seller->id)->delete();
            DB::table('store_variants_customer_prices')->where('store_variant_id', $id)->where('customer_id', '!=', $contract->id)->delete();
        }

        return $prices;
    }

    /**
     * Items with only a store price: one discount still running (50 → 40 until tomorrow),
     * one over (60 → 45, ended yesterday), and a plain 30 for the admin pricing spec. Every
     * other level of the ladder is cleared for them, so the cart shows exactly the store tier.
     *
     * @param  array<int, array<string, mixed>|null>  $taken
     * @return array<string, array<string, mixed>>
     */
    private function discounts(Store $store, array $taken): array
    {
        $plans = [
            'running' => ['price' => 50.0, 'discount_price' => 40.0, 'discount_ends_at' => now()->addDay()->toDateTimeString()],
            'expired' => ['price' => 60.0, 'discount_price' => 45.0, 'discount_ends_at' => now()->subDay()->toDateTimeString()],
            // No discount and no other level: the admin pricing spec sets them through the UI.
            'plain' => ['price' => 30.0, 'discount_price' => null, 'discount_ends_at' => null],
        ];
        $exclude = array_column(array_filter($taken), 'item_id');
        $out = [];

        foreach ($plans as $key => $matrix) {
            $item = Item::query()
                ->whereNotIn('id', $exclude)
                ->whereHas('variants')
                ->orderBy('id')
                ->with('variants')
                ->get()
                ->first(fn (Item $item): bool => StoreVariant::query()
                    ->where('store_id', $store->id)
                    ->where('active', true)
                    ->whereIn('item_variant_id', $item->variants->pluck('id'))
                    ->count() === $item->variants->count());

            if ($item === null) {
                continue;
            }

            $exclude[] = $item->id;
            $ids = StoreVariant::query()->where('store_id', $store->id)->whereIn('item_variant_id', $item->variants->pluck('id'))->pluck('id');
            StoreVariant::query()->whereIn('id', $ids)->update(['pricing_matrix' => json_encode($matrix)]);
            foreach (['store_variants_individual_prices', 'store_variants_seller_prices', 'store_variants_customer_prices'] as $table) {
                DB::table($table)->whereIn('store_variant_id', $ids)->delete();
            }

            $out[$key] = ['item_id' => (int) $item->id, 'name' => (string) $item->product_name] + $matrix;
        }

        return $out;
    }

    /**
     * An item for the Remote Hub refill: none on the shelf or floor, 5 in the Remote
     * Hub, and a bin on the Store Shelf of 2 (in the variant's own pack) with its
     * refill line at 1. The bin is empty, so the keeper sees it under "Needs a refill"
     * and the floor cannot cover it: the refill goes to the Remote Hub for 2.
     *
     * @param  array<int, array<string, mixed>|null>  $taken
     * @return ?array{item_id: int, name: string, variant: int, sku: string}
     */
    private function refillItem(SellerCatalog $catalog, Store $store, ?StockLocation $shelf, ?StockLocation $remoteHub, array $taken, User $manager): ?array
    {
        if ($shelf === null || $remoteHub === null) {
            return null;
        }

        $item = Item::query()
            ->whereNotIn('id', array_column(array_filter($taken), 'item_id'))
            ->whereHas('variants')
            ->orderBy('id')
            ->with(['variants' => fn ($q) => $q->orderBy('id')])
            ->get()
            ->first(fn (Item $item): bool => StoreVariant::query()
                ->where('store_id', $store->id)
                ->where('active', true)
                ->where('item_variant_id', $item->variants->first()->id)
                ->exists());

        if ($item === null) {
            return null;
        }

        $variant = $item->variants->first();
        $leaves = $catalog->storeLeaves((int) $store->id);

        // Nothing in the store but this variant in the Remote Hub; no refill left from an earlier run.
        ItemStock::query()->whereIn('item_variant_id', $item->variants->pluck('id'))->whereIn('stock_location_id', [...$leaves['shelf'], ...$leaves['floor'], $remoteHub->id])
            ->where(fn ($q) => $q->where('item_variant_id', '!=', $variant->id)->orWhere('stock_location_id', '!=', $remoteHub->id))
            ->update(['quantity' => 0]);
        $held = (int) ItemStock::query()->where('item_variant_id', $variant->id)->where('stock_location_id', $remoteHub->id)->sum('quantity');
        if ($held < 5) {
            app(\App\Services\StockService::class)->receive((int) $variant->id, $remoteHub, 5 - $held, ['reason' => 'E2E fixture']);
        }
        \App\Models\Inventory\RefillRequest::query()->where('item_id', $item->id)->where('store_id', $store->id)->open()
            ->update(['status' => \App\Models\Inventory\RefillRequest::STATUS_CANCELLED, 'cancel_reason' => 'E2E fixture', 'cancelled_at' => now()]);
        \App\Models\Inventory\ItemRefillRoute::query()->where('store_id', $store->id)->where('item_id', $item->id)->delete();
        \App\Models\Inventory\ShelfItemBand::query()->updateOrCreate(
            ['stock_location_id' => $shelf->id, 'item_id' => $item->id],
            ['item_packaging_type_id' => $variant->item_packaging_type_id, 'max_units' => 2, 'refill_units' => 1, 'critical_units' => 1, 'updated_by' => $manager->id],
        );

        return ['item_id' => (int) $item->id, 'name' => (string) $item->product_name, 'variant' => (int) $variant->id, 'sku' => (string) $variant->sku];
    }

    private function user(string $role, string $key, string $first, string $last, string $phone, ?Store $store): User
    {
        $user = User::query()->updateOrCreate(
            ['email' => "e2e.{$key}@duka.test"],
            [
                'first_name' => $first,
                'last_name' => $last,
                'phone_number' => $phone,
                'role' => $role,
                'store_id' => $store?->id,
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
