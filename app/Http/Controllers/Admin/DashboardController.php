<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin dashboard.
 *
 * The store switcher at the top of this page is the whole reason it has one.
 * It used to reach exactly one figure — the low-stock list — while the product,
 * variant, customer and cart tiles beside it kept reporting company-wide
 * totals, so picking "Second Store" changed one card out of six and left the
 * rest looking like Second Store's numbers. Every figure below is now either
 * scoped or explicitly company-wide, and says which.
 *
 * Three things were wrong beyond the missing scope:
 *
 *   - The switcher passed a store *name* as `?store=`, matched with
 *     `whereHas('store', fn ($q) => $q->where('name', $name))`. Two stores may
 *     share a name and any store may be renamed. It passes an id now.
 *   - The low-stock list read `store_variants.stock`, a denormalised column
 *     nothing in this application maintains — every row of it is 0, so the
 *     list reported the entire catalogue as out of stock. Stock comes from
 *     item_stocks, the positional ledger every service reads.
 *   - `activeVariantsCount` filtered `ItemVariant` by `store_id`, a column
 *     item_variants does not have. It never threw only because the admin
 *     running it has a null `store_id`, so the `when()` never fired; it would
 *     have failed for any admin attached to a store.
 */
class DashboardController extends Controller
{
    /** Pieces at or below this are "low". */
    private const LOW_STOCK_THRESHOLD = 5;

    public function index(Request $request): Response
    {
        $store = $this->selectedStore($request);

        return Inertia::render('Admin/Dashboard/index', array_merge(
            $this->sessionFigures(),
            $this->cartFigures($store),
            [
                'customersCount' => $this->customersCount($store),
                'productsCount' => $this->productsCount($store),
                'activeVariantsCount' => $this->activeVariantsCount($store),
                'lowStockItems' => $this->lowStockItems($store),
                'groupedProducts' => $this->groupedProducts($store),
                'stores' => $this->storeOptions(),
                // The id as a string, or 'all'. The switcher compares it
                // against each option's id to decide which chip is lit.
                'currentStore' => $store ? (string) $store->id : 'all',
                'currentStoreName' => $store?->name,
            ],
        ));
    }

    /**
     * The store the switcher is pointing at, or null for "all stores".
     *
     * An id that does not resolve falls back to all stores rather than
     * aborting: the switcher is a view preference, and a stale bookmark
     * pointing at a deleted store should show the dashboard, not a 404.
     */
    private function selectedStore(Request $request): ?Store
    {
        $selected = $request->query('store', 'all');

        if (! is_string($selected) || $selected === '' || $selected === 'all') {
            return null;
        }

        return Store::query()
            ->when(
                ctype_digit($selected),
                fn (Builder $query) => $query->whereKey((int) $selected),
                // Names are still accepted so links and bookmarks written
                // while the switcher sent names keep working.
                fn (Builder $query) => $query->where('name', $selected),
            )
            ->first();
    }

    /**
     * Who is signed in right now. Company-wide: a session is not a store.
     *
     * @return array<string, mixed>
     */
    private function sessionFigures(): array
    {
        $activeSessions = DB::table('sessions')
            ->where('last_activity', '>', now()->timestamp - (config('session.lifetime') * 60))
            ->get();

        $userIds = $activeSessions->whereNotNull('user_id')->pluck('user_id')->unique();

        $sessionRoles = User::query()
            ->with('roles')
            ->whereIn('id', $userIds)
            ->get()
            ->map(fn (User $user): string => $user->roles->pluck('name')->first() ?? 'Unknown')
            ->countBy();

        return [
            'sessionsCount' => $activeSessions->count(),
            // Defaults so a role with nobody signed in still gets a tile.
            'rolesBreakdown' => collect(['admin' => 0, 'delivery' => 0, 'stockkeeper' => 0, 'seller' => 0])
                ->merge($sessionRoles),
        ];
    }

    /**
     * Open carts, scoped to the carts belonging to the store's own sellers.
     *
     * The individual/business split was inverted here: this method called a
     * customer holding a TIN "business", while Admin\Store\StoreController,
     * Admin\Customers\Index and both seller catalogues treat a TIN as
     * "individual" and price it with VAT. The dashboard disagreed with every
     * other screen about which customers were which.
     *
     * @return array<string, mixed>
     */
    private function cartFigures(?Store $store): array
    {
        $carts = Cart::query()
            ->with('customer')
            ->visibleTo(Auth::user())
            ->when($store, fn (Builder $query) => $query->whereHas(
                'seller',
                fn (Builder $seller) => $seller->where('store_id', $store->id),
            ))
            ->get();

        $breakdown = $carts
            ->map(fn (Cart $cart): string => $cart->customer?->tin_number ? 'individual' : 'business')
            ->countBy();

        return [
            'openCartsCount' => $carts->count(),
            'cartsBreakdown' => collect(['individual' => 0, 'business' => 0])->merge($breakdown),
        ];
    }

    /** Customers registered against the store, or all of them. */
    private function customersCount(?Store $store): int
    {
        return Customer::query()
            ->when($store, fn (Builder $query) => $query->where('store_id', $store->id))
            ->count();
    }

    /**
     * Active items the store actually carries.
     *
     * Scoped through store_variants rather than the item_store pivot: the
     * pivot attaches the whole catalogue to every store, so counting it would
     * report the same number for each.
     */
    private function productsCount(?Store $store): int
    {
        return Item::query()
            ->where('status', 'active')
            ->when($store, fn (Builder $query) => $query->whereHas(
                'variants.storeVariants',
                fn (Builder $sv) => $sv->where('store_id', $store->id)->where('active', true),
            ))
            ->count();
    }

    /**
     * Active variants the store carries.
     *
     * Counted on store_variants, which is where a variant's presence in a
     * store is actually recorded.
     */
    private function activeVariantsCount(?Store $store): int
    {
        return StoreVariant::query()
            ->where('active', true)
            ->when($store, fn (Builder $query) => $query->where('store_id', $store->id))
            ->distinct()
            ->count('item_variant_id');
    }

    /**
     * Variants running low, with the stock figure read from the ledger.
     *
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator<int, array<string, mixed>>
     */
    private function lowStockItems(?Store $store)
    {
        /*
         * item_stocks is keyed by (item_variant_id, location_type, location_id)
         * and store_variants by (item_variant_id, store_id), so the join has to
         * match the variant *and* tie the ledger's location to the store
         * variant's own store. Joining on the variant alone would pull in the
         * same variant's stock at every other store.
         */
        $paginator = StoreVariant::query()
            ->select('store_variants.*')
            ->selectRaw('COALESCE(s.quantity, 0) as ledger_quantity')
            ->leftJoin('item_stocks as s', function ($join): void {
                $join->on('s.item_variant_id', '=', 'store_variants.item_variant_id')
                    ->where('s.location_type', '=', Store::class)
                    ->whereColumn('s.location_id', 'store_variants.store_id');
            })
            ->with(['item', 'store'])
            ->where('store_variants.active', true)
            ->when($store, fn (Builder $query) => $query->where('store_variants.store_id', $store->id))
            ->whereRaw('COALESCE(s.quantity, 0) <= ?', [self::LOW_STOCK_THRESHOLD])
            // Emptiest first: this list exists to be acted on.
            ->orderBy('ledger_quantity')
            ->orderBy('store_variants.id')
            ->paginate(5)
            ->withQueryString();

        return $paginator->through(function (StoreVariant $sv): array {
            $quantity = (int) $sv->ledger_quantity;

            return [
                'item_id' => (int) $sv->id,
                'product_name' => $sv->item?->product_name ?? 'Unknown Product',
                'store_name' => $sv->store?->name ?? 'Unknown Store',
                'total_stock' => $quantity,
                'low_stock_total' => $quantity,
                'is_low' => true,
            ];
        });
    }

    /**
     * Active variants grouped by product, for the catalogue breakdown.
     *
     * Scoped to the store's own variants so the colour/size/packaging spread
     * describes what that shop carries.
     *
     * @return \Illuminate\Support\Collection<string, array<string, mixed>>
     */
    private function groupedProducts(?Store $store)
    {
        $variants = \App\Models\Item\ItemVariant::query()
            ->with(['item', 'itemPackagingType', 'itemColor', 'itemSize'])
            ->where('status', 'active')
            ->when($store, fn (Builder $query) => $query->whereHas(
                'storeVariants',
                fn (Builder $sv) => $sv->where('store_id', $store->id)->where('active', true),
            ))
            ->get();

        return $variants
            ->groupBy('item.product_name')
            ->map(fn ($group): array => [
                'variants' => $group,
                'colors_count' => $group->pluck('itemColor.name')->filter()->unique()->count(),
                'sizes_count' => $group->pluck('itemSize.name')->filter()->unique()->count(),
                'packaging_count' => $group->pluck('itemPackagingType.name')->filter()->unique()->count(),
            ]);
    }

    /**
     * The switcher's options, each carrying the figure the menu wanted.
     *
     * The per-store menu rendered "{name}: -- (Data)" because no figure was
     * ever sent for it.
     *
     * @return array<int, array<string, mixed>>
     */
    private function storeOptions(): array
    {
        $unitsByStore = ItemStock::query()
            ->where('location_type', Store::class)
            ->groupBy('location_id')
            ->selectRaw('location_id, SUM(quantity) as units')
            ->pluck('units', 'location_id');

        $variantsByStore = StoreVariant::query()
            ->where('active', true)
            ->groupBy('store_id')
            ->selectRaw('store_id, COUNT(DISTINCT item_variant_id) as variants')
            ->pluck('variants', 'store_id');

        return Store::query()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (Store $store): array => [
                'id' => (int) $store->id,
                'name' => (string) $store->name,
                'units' => (int) ($unitsByStore[$store->id] ?? 0),
                'active_variants' => (int) ($variantsByStore[$store->id] ?? 0),
            ])
            ->values()
            ->all();
    }
}
