import { Link, router } from "@inertiajs/react";
import { Badge, IconButton, Tooltip } from "@mui/material";
import React from "react";

import type {
    StorefrontAuthUser,
    StorefrontCategory,
    StorefrontStore,
} from "@/types/storefront";
import {
    STOREFRONT_BRAND,
    STOREFRONT_BRAND_HOVER,
    STOREFRONT_BRAND_SOFT,
    STOREFRONT_SHELL,
} from "./storefrontConstants";

export interface StorefrontHeaderProps {
    store: StorefrontStore | null;
    categories: StorefrontCategory[];
    /** Currently selected category, or null for "All". */
    activeCategoryId: number | null;
    /**
     * Narrow a category. Omit on pages that cannot filter in place (the item
     * Show page) — the nav then links back to the grid instead.
     */
    onSelectCategory?: (categoryId: number | null) => void;
    /** Badge count shown on the cart button. */
    cartCount: number;
    onOpenCart: () => void;
    user: StorefrontAuthUser | null;

    /* ── Search (desktop only; phones use CategoryFilterStrip) ── */
    /**
     * Controlled search value. Omit on pages that cannot filter in place — the
     * search row is then left out rather than rendered inert.
     */
    search?: string;
    onSearchChange?: (value: string) => void;
    onSearchSubmit?: () => void;
    onSearchClear?: () => void;
    isSearching?: boolean;
    searchPlaceholder?: string;

    /** Opens the "All Categories" drawer — the desktop stand-in for the bottom bar. */
    onOpenMenu?: () => void;
}

/**
 * Sticky storefront masthead.
 *
 * Two rows on desktop, after the shape a shopper expects from a large
 * marketplace: brand, a search field wide enough to read, account state and the
 * cart on the first; an "All Categories" hamburger and the category rail on the
 * second. On a phone the first row compresses to brand / account / cart and the
 * second row is dropped entirely — search and categories live in
 * CategoryFilterStrip there, which scrolls with the page instead of eating a
 * third of a small viewport.
 */
export default function StorefrontHeader({
    store,
    categories,
    activeCategoryId,
    onSelectCategory,
    cartCount,
    onOpenCart,
    user,
    search,
    onSearchChange,
    onSearchSubmit,
    onSearchClear,
    isSearching = false,
    searchPlaceholder = "Search notebooks, pens, art supplies…",
    onOpenMenu,
}: StorefrontHeaderProps): React.ReactElement {
    const isAuthenticated = user !== null;
    const canSearchInPlace = search !== undefined && onSearchChange !== undefined;

    // On pages that cannot filter in place, a category navigates back to the
    // grid with that filter already applied.
    const selectCategory = (categoryId: number | null): void => {
        if (onSelectCategory) {
            onSelectCategory(categoryId);
            return;
        }

        router.get(
            route("storefront.index"),
            categoryId === null ? {} : { category_id: categoryId },
        );
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        onSearchSubmit?.();
    };

    return (
        <header className="sticky top-0 z-30 border-b border-outline-variant/80 bg-surface-container-lowest shadow-sm">
            {/* ══ Row 1: brand · search · account · cart ══ */}
            <div className={STOREFRONT_SHELL}>
                <div className="flex h-16 items-center justify-between gap-3 md:gap-6">
                    {/* ── Brand ── */}
                    <Link
                        href={route("storefront.index")}
                        className="flex min-w-0 items-center gap-2.5 md:shrink-0"
                        aria-label="Storefront home"
                    >
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-primary shadow-sm"
                            style={{ backgroundColor: STOREFRONT_BRAND }}
                        >
                            <span
                                className="material-symbols-outlined text-[20px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                edit_note
                            </span>
                        </span>
                        {/* The store name and location are free text of unknown
                            length. The brand block used to be `shrink-0`, so a long
                            name widened the masthead and took the whole page with
                            it — the mark stays fixed, the words give way. */}
                        <span className="flex min-w-0 flex-col leading-none">
                            <span className="truncate text-[15px] font-bold tracking-tight text-on-surface md:max-w-[12rem]">
                                {store?.name ?? "Stationery Shop"}
                            </span>
                            {store?.location ? (
                                <span className="mt-0.5 truncate text-[11px] font-medium text-outline md:max-w-[12rem]">
                                    {store.location}
                                </span>
                            ) : null}
                        </span>
                    </Link>

                    {/* ── Search (desktop) ── */}
                    {canSearchInPlace ? (
                        <form
                            onSubmit={handleSubmit}
                            role="search"
                            className="hidden min-w-0 flex-1 md:block"
                        >
                            <div className="flex items-center gap-2 rounded-full border-2 border-outline-variant bg-surface-container-lowest py-1 pl-4 pr-1 transition-colors focus-within:border-primary">
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) =>
                                        onSearchChange?.(event.target.value)
                                    }
                                    placeholder={searchPlaceholder}
                                    aria-label="Search products"
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] font-medium text-on-surface placeholder:text-outline focus:outline-none focus:ring-0"
                                />

                                {search && search.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={onSearchClear}
                                        aria-label="Clear search"
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container hover:text-on-surface-variant"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">
                                            close
                                        </span>
                                    </button>
                                ) : null}

                                {isSearching ? (
                                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-transparent" />
                                ) : null}

                                <button
                                    type="submit"
                                    aria-label="Search"
                                    className="flex h-9 shrink-0 items-center justify-center rounded-full px-6 text-on-primary transition-colors"
                                    style={{ backgroundColor: STOREFRONT_BRAND }}
                                    onMouseEnter={(event) => {
                                        event.currentTarget.style.backgroundColor =
                                            STOREFRONT_BRAND_HOVER;
                                    }}
                                    onMouseLeave={(event) => {
                                        event.currentTarget.style.backgroundColor =
                                            STOREFRONT_BRAND;
                                    }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        search
                                    </span>
                                </button>
                            </div>
                        </form>
                    ) : null}

                    {/* ── Account + cart ── */}
                    <div className="flex shrink-0 items-center gap-2">
                        {/* Two-line account block, as on the reference masthead:
                            the greeting above, the action below. */}
                        {isAuthenticated ? (
                            <Link
                                href={route("profile.edit")}
                                className="hidden items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-container sm:flex"
                            >
                                <span className="material-symbols-outlined text-[24px] text-on-surface-variant">
                                    account_circle
                                </span>
                                <span className="flex flex-col leading-tight">
                                    <span className="text-[11px] text-on-surface-variant">
                                        Welcome
                                    </span>
                                    <span className="max-w-[9rem] truncate text-[13px] font-bold text-on-surface">
                                        {user?.first_name ?? "My Account"}
                                    </span>
                                </span>
                            </Link>
                        ) : (
                            <Link
                                href={route("login")}
                                className="hidden items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-container sm:flex"
                            >
                                <span className="material-symbols-outlined text-[24px] text-on-surface-variant">
                                    account_circle
                                </span>
                                <span className="flex flex-col leading-tight">
                                    <span className="text-[11px] text-on-surface-variant">
                                        Welcome
                                    </span>
                                    <span className="text-[13px] font-bold text-on-surface">
                                        Sign in / Register
                                    </span>
                                </span>
                            </Link>
                        )}

                        {/* Compact auth entry point for narrow screens */}
                        <Link
                            href={
                                isAuthenticated ? route("profile.edit") : route("login")
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant active:scale-95 sm:hidden"
                            aria-label={isAuthenticated ? "My account" : "Sign in"}
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                account_circle
                            </span>
                        </Link>

                        <Tooltip title="Your cart">
                            <IconButton
                                onClick={onOpenCart}
                                aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                                sx={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 2,
                                    color: STOREFRONT_BRAND,
                                    backgroundColor: STOREFRONT_BRAND_SOFT,
                                    border: "1px solid",
                                    borderColor: "rgb(var(--primary) / 0.18)",
                                    "&:hover": {
                                        backgroundColor: "rgb(var(--primary) / 0.12)",
                                    },
                                }}
                            >
                                <Badge
                                    badgeContent={cartCount}
                                    max={99}
                                    sx={{
                                        "& .MuiBadge-badge": {
                                            backgroundColor: STOREFRONT_BRAND,
                                            color: "rgb(var(--on-primary))",
                                            fontSize: 10,
                                            fontWeight: 700,
                                            minWidth: 16,
                                            height: 16,
                                        },
                                    }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        shopping_cart
                                    </span>
                                </Badge>
                            </IconButton>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {/* ══ Row 2 (desktop): All Categories + the category rail ══ */}
            <div className="hidden border-t border-outline-variant/70 md:block">
                <div className={STOREFRONT_SHELL}>
                    <div className="flex h-12 items-center gap-1">
                        {onOpenMenu ? (
                            <button
                                type="button"
                                onClick={onOpenMenu}
                                className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container"
                                aria-label="Open all categories and menu"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    menu
                                </span>
                                All Categories
                            </button>
                        ) : null}

                        <nav
                            className="no-scrollbar scroll-smooth flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
                            aria-label="Product categories"
                        >
                            <CategoryNavButton
                                label="All"
                                active={activeCategoryId === null}
                                onClick={() => selectCategory(null)}
                            />
                            {categories.map((category) => (
                                <CategoryNavButton
                                    key={category.id}
                                    label={category.name}
                                    active={activeCategoryId === category.id}
                                    onClick={() => selectCategory(category.id)}
                                />
                            ))}
                        </nav>
                    </div>
                </div>
            </div>
        </header>
    );
}

interface CategoryNavButtonProps {
    label: string;
    active: boolean;
    onClick: () => void;
}

function CategoryNavButton({
    label,
    active,
    onClick,
}: CategoryNavButtonProps): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? "true" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                active ? "text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
            }`}
            style={active ? { backgroundColor: STOREFRONT_BRAND } : undefined}
        >
            {label}
        </button>
    );
}
