import { Link, router } from "@inertiajs/react";
import { Badge, IconButton, Tooltip } from "@mui/material";
import React from "react";

import type {
    StorefrontAuthUser,
    StorefrontCategory,
    StorefrontStore,
} from "@/types/storefront";
import { STOREFRONT_BRAND, STOREFRONT_BRAND_SOFT } from "./storefrontConstants";

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
    /** Categories shown inline on desktop before the rest collapse into the pill strip. */
    maxVisibleCategories?: number;
}

/**
 * Sticky storefront masthead: brand, desktop category navigation, auth status
 * and the single-cart indicator.
 */
export default function StorefrontHeader({
    store,
    categories,
    activeCategoryId,
    onSelectCategory,
    cartCount,
    onOpenCart,
    user,
    maxVisibleCategories = 5,
}: StorefrontHeaderProps): React.ReactElement {
    const visibleCategories = categories.slice(0, maxVisibleCategories);
    const isAuthenticated = user !== null;

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

    return (
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-sm">
            {/* ── Brand row ── */}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-3">
                    {/* Brand */}
                    <Link
                        href={route("storefront.index")}
                        className="flex items-center gap-2.5 shrink-0"
                        aria-label="Storefront home"
                    >
                        <span
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm"
                            style={{ backgroundColor: STOREFRONT_BRAND }}
                        >
                            <span
                                className="material-symbols-outlined text-[20px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                edit_note
                            </span>
                        </span>
                        <span className="flex flex-col leading-none">
                            <span className="text-[15px] font-bold tracking-tight text-gray-900">
                                {store?.name ?? "Stationery Shop"}
                            </span>
                            {store?.location ? (
                                <span className="mt-0.5 text-[11px] font-medium text-slate-400">
                                    {store.location}
                                </span>
                            ) : null}
                        </span>
                    </Link>

                    {/* ── Desktop category navigation ── */}
                    <nav
                        className="hidden lg:flex items-center gap-1"
                        aria-label="Product categories"
                    >
                        <CategoryNavButton
                            label="All"
                            active={activeCategoryId === null}
                            onClick={() => selectCategory(null)}
                        />
                        {visibleCategories.map((category) => (
                            <CategoryNavButton
                                key={category.id}
                                label={category.name}
                                active={activeCategoryId === category.id}
                                onClick={() => selectCategory(category.id)}
                            />
                        ))}
                    </nav>

                    {/* ── Auth status + cart ── */}
                    <div className="flex items-center gap-2 shrink-0">
                        {isAuthenticated ? (
                            <Link
                                href={route("guest.dashboard")}
                                className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 transition-colors hover:bg-slate-50 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    account_circle
                                </span>
                                <span>
                                    {user?.first_name
                                        ? `Hi, ${user.first_name}`
                                        : "My Account"}
                                </span>
                            </Link>
                        ) : (
                            <div className="hidden sm:flex items-center gap-1.5">
                                <Link
                                    href={route("login")}
                                    className="rounded-full px-3 py-1.5 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 active:scale-95"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    href={route("register")}
                                    className="rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-95"
                                    style={{ backgroundColor: STOREFRONT_BRAND }}
                                >
                                    Register
                                </Link>
                            </div>
                        )}

                        {/* Compact auth entry point for narrow screens */}
                        <Link
                            href={
                                isAuthenticated
                                    ? route("guest.dashboard")
                                    : route("login")
                            }
                            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 active:scale-95"
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
                                    borderColor: "rgba(194, 65, 12, 0.18)",
                                    "&:hover": {
                                        backgroundColor: "rgba(194, 65, 12, 0.12)",
                                    },
                                }}
                            >
                                <Badge
                                    badgeContent={cartCount}
                                    max={99}
                                    sx={{
                                        "& .MuiBadge-badge": {
                                            backgroundColor: STOREFRONT_BRAND,
                                            color: "#fff",
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
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                active
                    ? "text-white"
                    : "text-slate-600 hover:bg-slate-100"
            }`}
            style={active ? { backgroundColor: STOREFRONT_BRAND } : undefined}
        >
            {label}
        </button>
    );
}
