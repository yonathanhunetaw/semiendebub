import React from "react";

import type { StorefrontCategory } from "@/types/storefront";
import { STOREFRONT_BRAND } from "./storefrontConstants";

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
}: CategoryFilterStripProps): React.ReactElement {
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        onSearchSubmit();
    };

    return (
        <div className="sticky top-16 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
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
            </div>
        </div>
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
