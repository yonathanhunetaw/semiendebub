import { Head, router } from "@inertiajs/react";
import { Alert, Snackbar } from "@mui/material";
import React from "react";

import CartDrawer from "@/Components/Storefront/CartDrawer";
import CategoryFilterStrip from "@/Components/Storefront/CategoryFilterStrip";
import ItemCard from "@/Components/Storefront/ItemCard";
import StorefrontHeader from "@/Components/Storefront/StorefrontHeader";
import {
    STOREFRONT_BG,
    STOREFRONT_BRAND,
} from "@/Components/Storefront/storefrontConstants";
import { useStorefrontCart } from "@/Components/Storefront/useStorefrontCart";
import type { StorefrontPageProps } from "@/types/storefront";

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
    pagination,
    auth,
    flash,
    error,
}: StorefrontPageProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const [isFiltering, setIsFiltering] = React.useState<boolean>(false);

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

    const applyFilters = React.useCallback(
        (next: { search?: string; category_id?: number | null }): void => {
            const query: Record<string, string | number> = {};
            const nextSearch = next.search ?? filters.search;
            const nextCategory =
                next.category_id !== undefined ? next.category_id : filters.category_id;

            if (nextSearch) {
                query.search = nextSearch;
            }
            if (nextCategory !== null && nextCategory !== undefined) {
                query.category_id = nextCategory;
            }

            router.get(route("storefront.index"), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => setIsFiltering(true),
                onFinish: () => setIsFiltering(false),
            });
        },
        [filters.search, filters.category_id],
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

        router.get(route("storefront.index"), query, { preserveState: false });
    };

    const hasItems = items.length > 0;
    const activeCategoryName =
        categories.find((category) => category.id === filters.category_id)?.name ??
        "Selected Category";

    return (
        <>
            <Head title={store ? `${store.name} — Stationery` : "Stationery Shop"}>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen" style={{ backgroundColor: STOREFRONT_BG }}>
                <StorefrontHeader
                    store={store}
                    categories={categories}
                    activeCategoryId={filters.category_id}
                    onSelectCategory={handleSelectCategory}
                    cartCount={cart.item_count}
                    onOpenCart={openCart}
                    user={auth?.user ?? null}
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
                />

                <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
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
                                </h1>
                                <span className="text-[11px] font-semibold text-slate-400">
                                    {pagination.total} product
                                    {pagination.total === 1 ? "" : "s"}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
                            <p className="mt-1 text-[11px] text-slate-400">
                                Try a different search term or category.
                            </p>
                        </div>
                    ) : null}
                </main>
            </div>

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
