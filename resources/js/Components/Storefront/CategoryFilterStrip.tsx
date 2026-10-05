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
 *
 * From `md` up the search field and the category pills are hidden: the
 * masthead carries both there, and showing them twice would cost a desktop
 * shopper a third of the fold before the first product. Sorting and the
 * availability switches have no home in the masthead, so they stay on every
 * width.
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
        // 64px masthead on phones; 112px once the category row appears at `md`.
        <div className="sticky top-16 z-20 border-b border-outline-variant/70 bg-surface-container-lowest/95 backdrop-blur md:top-28">
            <div className={`${STOREFRONT_SHELL} py-3`}>
                {/* ── Search ── */}
                <form onSubmit={handleSubmit} role="search" className="md:hidden">
                    <div className="flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-low px-3 py-2 transition-colors focus-within:border-primary/50 focus-within:bg-surface-container-lowest">
                        <span className="material-symbols-outlined text-[20px] text-outline">
                            search
                        </span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Search notebooks, pens, art supplies…"
                            aria-label="Search products"
                            className="w-full border-0 bg-transparent p-0 text-[13px] font-medium text-on-surface placeholder:text-outline focus:outline-none focus:ring-0"
                        />
                        {search.length > 0 ? (
                            <button
                                type="button"
                                onClick={onSearchClear}
                                aria-label="Clear search"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface-variant"
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    close
                                </span>
                            </button>
                        ) : null}
                        {isSearching ? (
                            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-transparent" />
                        ) : null}
                    </div>
                </form>

                {/* ── Category pills ── */}
                <div
                    className="no-scrollbar scroll-smooth mt-2.5 flex gap-1.5 overflow-x-auto md:hidden"
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
                <div className="no-scrollbar scroll-smooth mt-2 flex items-center gap-1.5 overflow-x-auto md:mt-0">
                    <label className="relative shrink-0">
                        <span className="sr-only">Sort products</span>
                        <select
                            value={activeSort}
                            onChange={(event) =>
                                onSelectSort(event.target.value as StorefrontSort)
                            }
                            className="appearance-none rounded-full border border-outline-variant bg-surface-container-lowest py-1.5 pl-7 pr-7 text-[11px] font-bold text-on-surface-variant focus:border-primary/50 focus:outline-none"
                        >
                            {sorts.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-outline">
                            swap_vert
                        </span>
                        <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-outline">
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
                            className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-outline transition-colors hover:text-on-surface-variant"
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
                    ? "border-transparent text-on-primary"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
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
                    ? "border-transparent text-on-primary"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
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
