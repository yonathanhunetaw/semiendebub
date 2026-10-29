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
use App\Services\Admin\ActiveStore;
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

    public function index(Request $request, ActiveStore $activeStore): Response
    {
        // The sidebar dropdown and the chips on this page both go through
        // ActiveStore (`?store=` -> session), so they can never disagree.
        $store = $activeStore->store();

        $scopeIds = $activeStore->scopeIds();

        // Each figures method runs once, however many props read from it.
        $sessionFigures = null;
        $cartFigures = null;
        $sessions = function () use (&$sessionFigures, $scopeIds): array {
            return $sessionFigures ??= $this->sessionFigures($scopeIds);
        };
        $carts = function () use (&$cartFigures, $store): array {
            return $cartFigures ??= $this->cartFigures($store);
        };

        // The page and its outline show at once; the figures arrive in three
        // groups, the tiles first, then the panels, then figures no panel
        // shows yet (kept for the scope tests and for the next panel).
        return Inertia::render('Admin/Dashboard/index', [
            'stores' => $this->storeOptions($activeStore),
            // The id as a string, or 'all'. The switcher compares it
            // against each option's id to decide which chip is lit.
            'currentStore' => $store ? (string) $store->id : 'all',
            'currentStoreName' => $store?->name,
            // Every area of the app as a card: figure, facts, what needs
            // attention, and links into each list.
            'areas' => Inertia::defer(fn () => app(\App\Services\Admin\DashboardAreas::class)->all(), 'tiles'),
            // Orders at each stop of the road, for the journey strip:
            // open carts, the board's stages, and delivered in 7 days.
            'pipeline' => Inertia::defer(fn () => $this->pipeline($activeStore), 'tiles'),
            // Each store's business day: open or not, today's orders and takings, yesterday's, and what came outside open hours.
            'shopDays' => Inertia::defer(fn () => $this->shopDays($activeStore), 'tiles'),
            // The 7-day trend, open deliveries and a feed, all from real rows in scope.
            'trend' => Inertia::defer(fn () => $this->trend($activeStore), 'panels'),
            'activeDeliveries' => Inertia::defer(fn () => $this->activeDeliveries($activeStore), 'panels'),
            'activity' => Inertia::defer(fn () => $this->activity($activeStore), 'panels'),
            'lowStockItems' => Inertia::defer(fn () => $this->lowStockItems($store), 'panels'),
            'customersCount' => Inertia::defer(fn () => $this->customersCount($store), 'extras'),
            'productsCount' => Inertia::defer(fn () => $this->productsCount($store), 'extras'),
            'activeVariantsCount' => Inertia::defer(fn () => $this->activeVariantsCount($store), 'extras'),
            'groupedProducts' => Inertia::defer(fn () => $this->groupedProducts($store), 'extras'),
            'sessionsCount' => Inertia::defer(fn () => $sessions()['sessionsCount'], 'extras'),
            'rolesBreakdown' => Inertia::defer(fn () => $sessions()['rolesBreakdown'], 'extras'),
            'openCartsCount' => Inertia::defer(fn () => $carts()['openCartsCount'], 'extras'),
            'cartsBreakdown' => Inertia::defer(fn () => $carts()['cartsBreakdown'], 'extras'),
        ]);
    }

    /**
     * Who is signed in right now: everyone for a global admin on "All
     * stores", else the scoped stores' staff.
     *
     * @param  array<int, int>|null  $scopeIds
     * @return array<string, mixed>
     */
    private function sessionFigures(?array $scopeIds): array
    {
        $activeSessions = DB::table('sessions')
            ->where('last_activity', '>', now()->timestamp - (config('session.lifetime') * 60))
            ->when($scopeIds !== null, fn ($q) => $q->whereIn('user_id', User::query()->whereIn('store_id', $scopeIds ?: [0])->select('id')))
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
        // Scoped by the cart's own store: the active store's carts, or every
        // store's on "All stores" (a store admin always has a store).
        $carts = Cart::query()
            ->with('customer')
            ->when($store, fn (Builder $query) => $query->where('store_id', $store->id))
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
            // A store's stock is its shelf + floor (STOCK_PLAN.md phase 4):
            // two leaves, so they are summed before the join.
            ->leftJoinSub(
                DB::table('item_stocks as st')
                    ->join('stock_locations as sl', 'sl.id', '=', 'st.stock_location_id')
                    ->whereIn('sl.kind', [\App\Models\Inventory\StockLocation::KIND_SHELF, \App\Models\Inventory\StockLocation::KIND_BACKROOM])
                    ->groupBy('st.item_variant_id', 'sl.store_id')
                    ->selectRaw('st.item_variant_id, sl.store_id, SUM(st.quantity) as quantity'),
                's',
                function ($join): void {
                    $join->on('s.item_variant_id', '=', 'store_variants.item_variant_id')
                        ->whereColumn('s.store_id', 'store_variants.store_id');
                },
            )
            ->with(['item', 'store', 'itemVariant.itemPackagingType'])
            ->where('store_variants.active', true)
            ->when($store, fn (Builder $query) => $query->where('store_variants.store_id', $store->id))
            ->whereRaw('COALESCE(s.quantity, 0) <= ?', [self::LOW_STOCK_THRESHOLD])
            // Emptiest first: this list exists to be acted on.
            ->orderBy('ledger_quantity')
            ->orderBy('store_variants.id')
            ->paginate(5)
            ->withQueryString();

        /*
         * The figure is in the variant's own packaging unit, so it is named.
         * "11" against a carton variant is 11 cartons — 1,320 pieces — and an
         * unnamed 11 beside a threshold of 10 reads as a crisis that is not one.
         */
        $ladder = app(\App\Services\Inventory\PackagingLadder::class);

        return $paginator->through(function (StoreVariant $sv) use ($ladder): array {
            $quantity = (int) $sv->ledger_quantity;
            $unit = (string) ($sv->itemVariant?->itemPackagingType?->name ?? 'Piece');
            $piecesPerUnit = $sv->itemVariant !== null
                ? $ladder->piecesPerUnit((int) $sv->itemVariant->id)
                : 1;

            return [
                'item_id' => (int) $sv->id,
                'product_name' => $sv->item?->product_name ?? 'Unknown Product',
                'store_id' => $sv->store_id !== null ? (int) $sv->store_id : null,
                'store_name' => $sv->store?->name ?? 'Unknown Store',
                'total_stock' => $quantity,
                'low_stock_total' => $quantity,
                'unit' => $unit,
                'pieces' => $quantity * $piecesPerUnit,
                // "11 Cartons", ready to print.
                'display' => $ladder->label([[
                    'unit' => $unit,
                    'count' => $quantity,
                    'pieces' => $piecesPerUnit,
                ]]),
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
    private function storeOptions(ActiveStore $activeStore): array
    {
        // Shelf + floor per retail store; a warehouse-type facility's hub.
        $unitsByStore = DB::table('item_stocks as s')
            ->join('stock_locations as sl', 'sl.id', '=', 's.stock_location_id')
            ->where(fn ($q) => $q
                ->whereIn('sl.kind', [\App\Models\Inventory\StockLocation::KIND_SHELF, \App\Models\Inventory\StockLocation::KIND_BACKROOM])
                ->orWhere('s.location_type', Store::class))
            ->groupByRaw('COALESCE(sl.store_id, s.location_id)')
            ->selectRaw('COALESCE(sl.store_id, s.location_id) as store_id, SUM(s.quantity) as units')
            ->pluck('units', 'store_id');

        $variantsByStore = StoreVariant::query()
            ->where('active', true)
            ->groupBy('store_id')
            ->selectRaw('store_id, COUNT(DISTINCT item_variant_id) as variants')
            ->pluck('variants', 'store_id');

        return $activeStore->accessibleStores()
            ->map(fn (Store $store): array => [
                'id' => (int) $store->id,
                'name' => (string) $store->name,
                'units' => (int) ($unitsByStore[$store->id] ?? 0),
                'active_variants' => (int) ($variantsByStore[$store->id] ?? 0),
            ])
            ->values()
            ->all();
    }

    /**
     * Each retail store's business day side by side: today's (the day that is
     * open now, else today's if it already closed), yesterday's, and the orders
     * that came in while the store was closed over the last 7 days.
     *
     * @return array<int, array<string, mixed>>
     */
    private function shopDays(ActiveStore $activeStore): array
    {
        $shopDay = app(\App\Services\Workforce\ShopDay::class);
        $scopeIds = $activeStore->scopeIds();
        $paidAt = DB::raw('COALESCE(payments.paid_at, payments.created_at)');

        $figures = function (?\App\Models\Workforce\SiteDay $day, int $storeId) use ($shopDay, $paidAt): ?array {
            if ($day === null) {
                return null;
            }

            $sales = fn () => \App\Models\Finance\Sale::query()->where('sales.store_id', $storeId);
            $span = $shopDay->span($day);

            return [
                'date' => $day->date->toDateString(),
                'status' => (string) $day->status,
                'opened_at' => $span[0]->toIso8601String(),
                'closed_at' => $span[1]?->toIso8601String(),
                'orders' => $shopDay->within($sales(), 'sales.created_at', $day)->count(),
                'takings' => round((float) $shopDay->within(
                    \App\Models\Finance\Payment::query()->confirmed()
                        ->whereNotIn('payments.payment_method', self::NON_CASH_METHODS)
                        ->whereIn('payments.sale_id', $sales()->select('sales.id')),
                    $paidAt,
                    $day,
                )->sum('payments.amount'), 2),
                'late_close' => (bool) $day->closed_late,
                // The till against the day's cash, frozen at closing (null while open or when no cash moved).
                'till_difference' => $day->till_difference !== null ? (float) $day->till_difference : null,
                'cash_unconfirmed' => $day->cash_unconfirmed !== null ? (float) $day->cash_unconfirmed : null,
            ];
        };

        return \App\Models\Store\Store::query()
            ->where('type', \App\Models\Store\Store::TYPE_RETAIL)
            ->when($scopeIds !== null, fn ($q) => $q->whereIn('id', $scopeIds ?: [0]))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(function (\App\Models\Store\Store $store) use ($shopDay, $figures): ?array {
                $site = $shopDay->siteOf((int) $store->id);
                if ($site === null) {
                    return null;
                }

                $today = $shopDay->current($site) ?? \App\Models\Workforce\SiteDay::query()
                    ->where('stock_location_id', $site->id)->whereDate('date', \App\Services\Workforce\LocalTime::dateOf())->whereNotNull('opened_at')->first();
                $yesterday = \App\Models\Workforce\SiteDay::query()
                    ->where('stock_location_id', $site->id)->whereDate('date', \App\Services\Workforce\LocalTime::today()->subDay()->toDateString())
                    ->whereNotNull('opened_at')->where('status', '!=', \App\Models\Workforce\SiteDay::STATUS_OPEN)->first();

                $outside = $shopDay->outsideHours(
                    \App\Models\Finance\Sale::query()->where('sales.store_id', $store->id)
                        ->where('sales.created_at', '>=', \App\Services\Workforce\LocalTime::startOf(\App\Services\Workforce\LocalTime::today()->subDays(6))),
                    'sales.created_at',
                    'sales.store_id',
                )->count();

                return [
                    'store_id' => (int) $store->id,
                    'store' => (string) $store->name,
                    'open' => $today?->status === \App\Models\Workforce\SiteDay::STATUS_OPEN,
                    'today' => $figures($today, (int) $store->id),
                    'yesterday' => $figures($yesterday, (int) $store->id),
                    'outside_orders' => $outside,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /** Window for the KPI cards and the trend chart. */
    private const TREND_DAYS = 7;

    /** Payment methods that are not money in hand. */
    private const NON_CASH_METHODS = [\App\Models\Finance\Payment::METHOD_CREDIT];

    /** Payments in scope: by the order's store, or a repayment's customer's. */
    private function scopedPayments(ActiveStore $activeStore): \Illuminate\Database\Eloquent\Builder
    {
        $query = \App\Models\Finance\Payment::query();

        if ($activeStore->scopeIds() === null) {
            return $query;
        }

        return $query->where(fn ($q) => $q
            ->where(fn ($sale) => $activeStore->applyThrough($sale->whereNotNull('sale_id'), 'sale'))
            ->orWhere(fn ($repayment) => $activeStore->applyThrough($repayment->whereNull('sale_id'), 'customer')));
    }

    /**
     * Orders per day and confirmed takings per day for the last TREND_DAYS
     * days, plus the two tiles the same rows can answer.
     *
     * @return array<string, mixed>
     */
    private function trend(ActiveStore $activeStore): array
    {
        // The shops' days (Addis), not UTC's: a sale at 01:00 is that day's.
        $since = \App\Services\Workforce\LocalTime::today()->subDays(self::TREND_DAYS - 1)->utc();

        $orders = $activeStore->apply(\App\Models\Finance\Sale::query())
            ->where('created_at', '>=', $since)
            ->get(['created_at', 'total_amount']);

        $payments = $this->scopedPayments($activeStore)
            ->confirmed()
            ->where('paid_at', '>=', $since)
            ->whereNotIn('payment_method', self::NON_CASH_METHODS)
            ->get(['paid_at', 'amount']);

        $days = collect(range(self::TREND_DAYS - 1, 0))->map(function (int $back) use ($orders, $payments): array {
            $day = \App\Services\Workforce\LocalTime::today()->subDays($back)->toDateString();

            return [
                'date' => $day,
                'orders' => $orders->filter(fn ($sale) => $sale->created_at !== null && \App\Services\Workforce\LocalTime::dateOf($sale->created_at) === $day)->count(),
                'revenue' => round((float) $payments->filter(fn ($payment) => \App\Services\Workforce\LocalTime::dateOf(\Illuminate\Support\Carbon::parse($payment->paid_at)) === $day)->sum('amount'), 2),
            ];
        })->values();

        $peak = $days->sortByDesc('orders')->first();

        return [
            'days' => $days,
            'peak_day' => $peak !== null && $peak['orders'] > 0 ? $peak : null,
            'avg_order_value' => $orders->isEmpty() ? null : round((float) $orders->avg('total_amount'), 2),
        ];
    }

    /**
     * Open deliveries, most recently touched first.
     *
     * @return array<int, array<string, mixed>>
     */
    private function activeDeliveries(ActiveStore $activeStore): array
    {
        return $activeStore->applyThrough(\App\Models\Fulfillment\Delivery::query(), 'sale')
            ->open()
            ->with(['sale.store:id,name', 'courier:id,first_name,last_name'])
            ->latest('updated_at')
            ->limit(6)
            ->get()
            ->map(fn (\App\Models\Fulfillment\Delivery $delivery): array => [
                'id' => (int) $delivery->id,
                'tracking_number' => $delivery->tracking_number,
                'status' => (string) $delivery->status,
                'courier' => $delivery->courier ? trim($delivery->courier->first_name.' '.$delivery->courier->last_name) : null,
                'store' => $delivery->sale?->store?->name,
                'order' => $delivery->sale?->reference_number,
            ])
            ->values()
            ->all();
    }

    /**
     * Recent activity from records that exist: confirmed payments, delivery
     * status changes and stock journal entries, newest first.
     *
     * @return array<int, array<string, mixed>>
     */
    private function activity(ActiveStore $activeStore): array
    {
        $payments = $this->scopedPayments($activeStore)
            ->confirmed()
            ->with('sale:id,reference_number')
            ->latest('paid_at')
            ->limit(5)
            ->get()
            ->map(fn (\App\Models\Finance\Payment $payment): array => [
                'kind' => 'payment',
                'title' => 'Payment confirmed',
                'detail' => trim(ucfirst(str_replace('_', ' ', (string) $payment->payment_method)).' · '.($payment->sale?->reference_number ?? 'credit repayment')),
                'amount' => (float) $payment->amount,
                'at' => ($payment->paid_at ?? $payment->updated_at)?->toIso8601String(),
            ]);

        $deliveries = $activeStore->applyThrough(\App\Models\Fulfillment\Delivery::query(), 'sale')
            ->with('sale:id,reference_number')
            ->latest('updated_at')
            ->limit(5)
            ->get()
            ->map(fn (\App\Models\Fulfillment\Delivery $delivery): array => [
                'kind' => 'delivery',
                'title' => 'Delivery '.str_replace('_', ' ', (string) $delivery->status),
                'detail' => trim(($delivery->tracking_number ?? '').($delivery->sale ? ' · '.$delivery->sale->reference_number : '')),
                'amount' => null,
                'at' => $delivery->updated_at?->toIso8601String(),
            ]);

        $scopeIds = $activeStore->scopeIds();
        $movements = \App\Models\Inventory\InventoryMovement::query()
            ->with(['itemVariant.item:id,product_name', 'stockLocation:id,name,store_id'])
            ->when($scopeIds !== null, fn ($q) => $q->whereHas('stockLocation', fn ($location) => $location->whereIn('store_id', $scopeIds ?: [0])))
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(fn (\App\Models\Inventory\InventoryMovement $movement): array => [
                'kind' => 'stock',
                'title' => 'Stock '.str_replace('_', ' ', (string) $movement->type),
                'detail' => trim(($movement->itemVariant?->item?->product_name ?? 'Item').' · '.sprintf('%+d', (int) $movement->quantity).($movement->stockLocation ? ' at '.$movement->stockLocation->name : '')),
                'amount' => null,
                'at' => $movement->created_at?->toIso8601String(),
            ]);

        return $payments->concat($deliveries)->concat($movements)
            ->filter(fn (array $row): bool => $row['at'] !== null)
            ->sortByDesc('at')
            ->take(10)
            ->values()
            ->all();
    }

    /**
     * @return array<string, int>
     */
    private function pipeline(ActiveStore $activeStore): array
    {
        $board = app(\App\Services\Fulfillment\SellerOrderBoard::class)->counts($activeStore->id());

        return [
            'cart' => $activeStore->apply(Cart::query())->where('status', 'open')->count(),
            'to_pay' => (int) ($board['to_pay'] ?? 0),
            'paid' => (int) ($board['paid'] ?? 0),
            'packing' => (int) ($board['packing'] ?? 0),
            'to_deliver' => (int) ($board['to_deliver'] ?? 0),
            'delivered' => $activeStore->apply(\App\Models\Finance\Sale::query())
                ->where('fulfillment_stage', \App\Models\Finance\Sale::STAGE_DELIVERED)
                ->where('updated_at', '>=', \App\Services\Workforce\LocalTime::today()->subDays(self::TREND_DAYS - 1)->utc())
                ->count(),
        ];
    }
}
