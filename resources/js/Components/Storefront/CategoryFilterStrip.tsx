import React from "react";

import type {
    StorefrontCategory,
    StorefrontSort,
    StorefrontSortOption,
} from "@/types/storefront";
import { STOREFRONT_BRAND, STOREFRONT_SHELL } from "./storefrontConstants";

export interface CategoryFilterStripProps {
    categories: StorefrontCategory[];
    activeCategoryId: number | null;
    onSelectCategory: (categoryId: number | null) => void;
    /** Controlled value of the search box. */
    search: string;
    onSearchChange: (value: string) => void;
    onSearchSubmit: () => void;
    onSearchClear: () => void;
    totalCount: number;
    isSearching?: boolean;

    /* -- ordering and availability -- */
    sorts: StorefrontSortOption[];
    activeSort: StorefrontSort;
    onSelectSort: (sort: StorefrontSort) => void;
    inStockOnly: boolean;
    onToggleInStock: (next: boolean) => void;
    onSaleOnly: boolean;
    onToggleOnSale: (next: boolean) => void;
    /** Clears search, category, sort and both switches in one go. */
    onResetFilters: () => void;
}

/**
 * Search box plus the mobile-friendly category pill strip.
 *
 * The strip scrolls horizontally with its scrollbar hidden
 * (`no-scrollbar scroll-smooth`, utility defined in resources/css/app.css) so
 * a long taxonomy stays usable on a phone without a visible track.
 */
export default function CategoryFilterStrip({
    categories,
    activeCategoryId,
    onSelectCategory,
    search,
    onSearchChange,
    onSearchSubmit,
    onSearchClear,
    totalCount,
    isSearching = false,
    sorts,
    activeSort,
    onSelectSort,
    inStockOnly,
    onToggleInStock,
    onSaleOnly,
    onToggleOnSale,
    onResetFilters,
}: CategoryFilterStripProps): React.ReactElement {
    const hasNarrowing =
        search.length > 0 ||
        activeCategoryId !== null ||
        inStockOnly ||
        onSaleOnly ||
        activeSort !== "name";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        onSearchSubmit();
    };

    return (
        <div className="sticky top-16 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
            <div className={`${STOREFRONT_SHELL} py-3`}>
                {/* ── Search ── */}
                <form onSubmit={handleSubmit} role="search">
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition-colors focus-within:border-orange-300 focus-within:bg-white">
                        <span className="material-symbols-outlined text-[20px] text-slate-400">
                            search
                        </span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Search notebooks, pens, art supplies…"
                            aria-label="Search products"
                            className="w-full border-0 bg-transparent p-0 text-[13px] font-medium text-gray-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        />
                        {search.length > 0 ? (
                            <button
                                type="button"
                                onClick={onSearchClear}
                                aria-label="Clear search"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    close
                                </span>
                            </button>
                        ) : null}
                        {isSearching ? (
                            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-orange-200 border-t-transparent" />
                        ) : null}
                    </div>
                </form>

                {/* ── Category pills ── */}
                <div
                    className="no-scrollbar scroll-smooth mt-2.5 flex gap-1.5 overflow-x-auto"
                    role="group"
                    aria-label="Filter by category"
                >
                    <FilterPill
                        label="All"
                        count={totalCount}
                        active={activeCategoryId === null}
                        onClick={() => onSelectCategory(null)}
                    />
                    {categories.map((category) => (
                        <FilterPill
                            key={category.id}
                            label={category.name}
                            count={category.count}
                            active={activeCategoryId === category.id}
                            onClick={() => onSelectCategory(category.id)}
                        />
                    ))}
                </div>

                {/* ── Ordering and availability ── */}
                <div className="no-scrollbar scroll-smooth mt-2 flex items-center gap-1.5 overflow-x-auto">
                    <label className="relative shrink-0">
                        <span className="sr-only">Sort products</span>
                        <select
                            value={activeSort}
                            onChange={(event) =>
                                onSelectSort(event.target.value as StorefrontSort)
                            }
                            className="appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[11px] font-bold text-slate-600 focus:border-orange-300 focus:outline-none"
                        >
                            {sorts.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">
                            swap_vert
                        </span>
                        <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">
                            expand_more
                        </span>
                    </label>

                    <TogglePill
                        label="In stock"
                        icon="inventory_2"
                        active={inStockOnly}
                        onClick={() => onToggleInStock(!inStockOnly)}
                    />
                    <TogglePill
                        label="On sale"
                        icon="sell"
                        active={onSaleOnly}
                        onClick={() => onToggleOnSale(!onSaleOnly)}
                    />

                    {hasNarrowing ? (
                        <button
                            type="button"
                            onClick={onResetFilters}
                            className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-slate-400 transition-colors hover:text-slate-600"
                        >
                            Reset
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

interface TogglePillProps {
    label: string;
    icon: string;
    active: boolean;
    onClick: () => void;
}

function TogglePill({
    label,
    icon,
    active,
    onClick,
}: TogglePillProps): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                active
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            style={
                active
                    ? { backgroundColor: STOREFRONT_BRAND, borderColor: STOREFRONT_BRAND }
                    : undefined
            }
        >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
        </button>
    );
}

interface FilterPillProps {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}

function FilterPill({
    label,
    count,
    active,
    onClick,
}: FilterPillProps): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                active
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            style={
                active
                    ? {
                          backgroundColor: STOREFRONT_BRAND,
                          borderColor: STOREFRONT_BRAND,
                      }
                    : undefined
            }
        >
            {label} ({count})
        </button>
    );
}
