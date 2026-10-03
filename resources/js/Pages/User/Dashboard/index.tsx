import { Head, router } from "@inertiajs/react";
import { Alert, Snackbar } from "@mui/material";
import React from "react";

import CartDrawer from "@/Components/Storefront/CartDrawer";
import UserBottomNav from "@/Components/Navigation/User/UserBottomNav";
import CategoryFilterStrip from "@/Components/Storefront/CategoryFilterStrip";
import ItemCard from "@/Components/Storefront/ItemCard";
import StorefrontHeader from "@/Components/Storefront/StorefrontHeader";
import StorefrontMenuDrawer from "@/Components/Storefront/StorefrontMenuDrawer";
import {
    STOREFRONT_BG,
    STOREFRONT_BRAND,
    STOREFRONT_GRID,
    STOREFRONT_SHELL,
} from "@/Components/Storefront/storefrontConstants";
import { useStorefrontCart } from "@/Components/Storefront/useStorefrontCart";
import type { StorefrontPageProps, StorefrontSort } from "@/types/storefront";

/** Debounce for the search box before a server round trip. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Public storefront homepage.
 *
 * Reachable at `/shop` without authentication and at `/dashboard` once signed
 * in; both are served by Storefront\StorefrontController::index. Guests browse
 * and fill a cart freely — only checkout requires an account.
 *
 * The grid is item-level, exactly like the seller workspace: a card opens the
 * product's Show page, where a variant is chosen and added to the cart.
 */
export default function StorefrontDashboard({
    store,
    items,
    categories,
    cart,
    filters,
    sorts,
    pagination,
    auth,
    flash,
    error,
}: StorefrontPageProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const [isFiltering, setIsFiltering] = React.useState<boolean>(false);
    // Desktop stand-in for the phone bottom bar; see StorefrontMenuDrawer.
    const [menuOpen, setMenuOpen] = React.useState<boolean>(false);

    const {
        cartOpen,
        openCart,
        closeCart,
        isMutating,
        updateQuantity,
        removeLine,
        checkout,
        notice,
        dismissNotice,
    } = useStorefrontCart(flash);

    // Keep the input in step with server-side filter state (e.g. back button).
    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    /** Units per product already in the cart, summed across its variants. */
    const cartQuantities = React.useMemo<Record<number, number>>(() => {
        return cart.lines.reduce<Record<number, number>>((accumulator, line) => {
            accumulator[line.item_id] =
                (accumulator[line.item_id] ?? 0) + line.quantity;
            return accumulator;
        }, {});
    }, [cart.lines]);

    /* ------------------------------------------------------------------
     | Catalogue filtering
     |------------------------------------------------------------------*/

    /**
     * One place that builds the catalogue query string.
     *
     * Every dimension is carried through, so changing the sort does not silently
     * drop the category the shopper had picked. Defaults are left out of the URL
     * entirely, which keeps a shared link readable.
     */
    const applyFilters = React.useCallback(
        (next: {
            search?: string;
            category_id?: number | null;
            sort?: StorefrontSort;
            in_stock?: boolean;
            on_sale?: boolean;
        }): void => {
            const query: Record<string, string | number> = {};
            const nextSearch = next.search ?? filters.search;
            const nextCategory =
                next.category_id !== undefined ? next.category_id : filters.category_id;
            const nextSort = next.sort ?? filters.sort;
            const nextInStock = next.in_stock ?? filters.in_stock;
            const nextOnSale = next.on_sale ?? filters.on_sale;

            if (nextSearch) {
                query.search = nextSearch;
            }
            if (nextCategory !== null && nextCategory !== undefined) {
                query.category_id = nextCategory;
            }
            if (nextSort !== "name") {
                query.sort = nextSort;
            }
            if (nextInStock) {
                query.in_stock = 1;
            }
            if (nextOnSale) {
                query.on_sale = 1;
            }

            router.get(route("storefront.index"), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => setIsFiltering(true),
                onFinish: () => setIsFiltering(false),
            });
        },
        [
            filters.search,
            filters.category_id,
            filters.sort,
            filters.in_stock,
            filters.on_sale,
        ],
    );

    // Debounced search so typing does not fire a request per keystroke.
    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => {
            applyFilters({ search });
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    const handleSelectCategory = (categoryId: number | null): void => {
        applyFilters({ category_id: categoryId });
    };

    const handleResetFilters = (): void => {
        setSearch("");
        router.get(route("storefront.index"), {}, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onStart: () => setIsFiltering(true),
            onFinish: () => setIsFiltering(false),
        });
    };

    /* ------------------------------------------------------------------
     | Pagination
     |------------------------------------------------------------------*/

    const goToPage = (page: number): void => {
        const query: Record<string, string | number> = { page };
        if (filters.search) {
            query.search = filters.search;
        }
        if (filters.category_id !== null) {
            query.category_id = filters.category_id;
        }
        // Page two of a price-sorted, in-stock-only listing has to stay price
        // sorted and in-stock only.
        if (filters.sort !== "name") {
            query.sort = filters.sort;
        }
        if (filters.in_stock) {
            query.in_stock = 1;
        }
        if (filters.on_sale) {
            query.on_sale = 1;
        }

        router.get(route("storefront.index"), query, { preserveState: false });
    };

    const hasItems = items.length > 0;
    const activeCategoryName =
        categories.find((category) => category.id === filters.category_id)?.name ??
        "Selected Category";

    return (
        <>
            <Head title={store ? `${store.name} — Stationery` : "Stationery Shop"} />

            <div className="min-h-screen" style={{ backgroundColor: STOREFRONT_BG }}>
                <StorefrontHeader
                    store={store}
                    categories={categories}
                    activeCategoryId={filters.category_id}
                    onSelectCategory={handleSelectCategory}
                    cartCount={cart.item_count}
                    onOpenCart={openCart}
                    user={auth?.user ?? null}
                    search={search}
                    onSearchChange={setSearch}
                    onSearchSubmit={() => applyFilters({ search })}
                    onSearchClear={() => {
                        setSearch("");
                        applyFilters({ search: "" });
                    }}
                    isSearching={isFiltering}
                    onOpenMenu={() => setMenuOpen(true)}
                />

                <CategoryFilterStrip
                    categories={categories}
                    activeCategoryId={filters.category_id}
                    onSelectCategory={handleSelectCategory}
                    search={search}
                    onSearchChange={setSearch}
                    onSearchSubmit={() => applyFilters({ search })}
                    onSearchClear={() => {
                        setSearch("");
                        applyFilters({ search: "" });
                    }}
                    totalCount={pagination.total}
                    isSearching={isFiltering}
                    sorts={sorts}
                    activeSort={filters.sort}
                    onSelectSort={(sort) => applyFilters({ sort })}
                    inStockOnly={filters.in_stock}
                    onToggleInStock={(next) => applyFilters({ in_stock: next })}
                    onSaleOnly={filters.on_sale}
                    onToggleOnSale={(next) => applyFilters({ on_sale: next })}
                    onResetFilters={handleResetFilters}
                />

                <main className={`${STOREFRONT_SHELL} py-5 pb-28 md:pb-10`}>
                    {error ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                            <span className="material-symbols-outlined text-[32px] text-amber-400">
                                storefront
                            </span>
                            <p className="mt-1 text-[13px] font-bold text-amber-800">
                                {error}
                            </p>
                        </div>
                    ) : null}

                    {!error && hasItems ? (
                        <>
                            <div className="mb-3 flex items-baseline justify-between">
                                <h1 className="text-[15px] font-bold tracking-tight text-gray-900">
                                    {filters.category_id === null
                                        ? "All Stationery"
                                        : activeCategoryName}
                                    {filters.on_sale ? " · On sale" : ""}
                                    {filters.in_stock ? " · In stock" : ""}
                                </h1>
                                <span className="text-[11px] font-semibold text-slate-400">
                                    {pagination.total} product
                                    {pagination.total === 1 ? "" : "s"}
                                </span>
                            </div>

                            <div className={STOREFRONT_GRID}>
                                {items.map((item) => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        quantityInCart={cartQuantities[item.id] ?? 0}
                                    />
                                ))}
                            </div>

                            {pagination.last_page > 1 ? (
                                <nav
                                    className="mt-6 flex items-center justify-center gap-2"
                                    aria-label="Pagination"
                                >
                                    <button
                                        type="button"
                                        onClick={() => goToPage(pagination.current_page - 1)}
                                        disabled={pagination.current_page <= 1}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-[12px] font-semibold text-slate-500">
                                        Page {pagination.current_page} of{" "}
                                        {pagination.last_page}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => goToPage(pagination.current_page + 1)}
                                        disabled={
                                            pagination.current_page >= pagination.last_page
                                        }
                                        className="rounded-xl px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-transform active:scale-95 disabled:bg-slate-300 disabled:shadow-none"
                                        style={
                                            pagination.current_page >= pagination.last_page
                                                ? undefined
                                                : { backgroundColor: STOREFRONT_BRAND }
                                        }
                                    >
                                        Next
                                    </button>
                                </nav>
                            ) : null}
                        </>
                    ) : null}

                    {!error && !hasItems ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center">
                            <span className="material-symbols-outlined text-[36px] text-slate-300">
                                search_off
                            </span>
                            <p className="mt-2 text-[13px] font-bold text-gray-900">
                                No products found
                            </p>
                            {/* Name the switch that emptied the grid. "Try a
                                different search term" is unhelpful advice when it
                                was the in-stock filter that hid everything. */}
                            <p className="mt-1 text-[11px] text-slate-400">
                                {filters.in_stock || filters.on_sale
                                    ? `Nothing matches ${
                                          filters.in_stock && filters.on_sale
                                              ? "in stock and on sale"
                                              : filters.in_stock
                                                ? "in stock"
                                                : "on sale"
                                      } here right now.`
                                    : "Try a different search term or category."}
                            </p>
                            {filters.in_stock || filters.on_sale || filters.search ? (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="mt-3 rounded-xl px-4 py-2 text-[12px] font-bold text-white shadow-sm transition-transform active:scale-95"
                                    style={{ backgroundColor: STOREFRONT_BRAND }}
                                >
                                    Clear filters
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </main>
            </div>

            <UserBottomNav
                cartCount={cart.item_count}
                onOpenCart={openCart}
                isAuthenticated={Boolean(auth?.user)}
            />

            <StorefrontMenuDrawer
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                categories={categories}
                activeCategoryId={filters.category_id}
                onSelectCategory={handleSelectCategory}
                cartCount={cart.item_count}
                onOpenCart={openCart}
                user={auth?.user ?? null}
            />

            <CartDrawer
                open={cartOpen}
                onClose={closeCart}
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeLine}
                onCheckout={checkout}
                isBusy={isMutating}
                isAuthenticated={Boolean(auth?.user)}
            />

            <Snackbar
                open={notice !== null}
                autoHideDuration={3000}
                onClose={dismissNotice}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={flash?.error ? "error" : "success"}
                    variant="filled"
                    onClose={dismissNotice}
                    sx={{ fontSize: 13, fontWeight: 600 }}
                >
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}
