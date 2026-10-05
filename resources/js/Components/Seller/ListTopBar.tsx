import { router } from "@inertiajs/react";
import React from "react";

/**
 * Search + action header with underline tabs, shared by the seller's list
 * screens (My Orders, Shipments).
 *
 * Layout follows the marketplace pattern the design was taken from: back
 * chevron, a pill search field with a solid submit button inside it, then the
 * icon actions. The support/headset icon from that design is deliberately not
 * here — there is no support desk behind it.
 *
 * Note this project's tailwind.config.js redefines `rounded-full` to 0.75rem,
 * so pills use `rounded-[999px]`.
 */

export interface TabSpec {
    id: string;
    label: string;
    /** Rendered beside the label when present. */
    count?: number;
}

interface Props {
    /** Where the back chevron goes when there is no history to pop. */
    fallbackRoute: string;
    search: string;
    onSearch: (value: string) => void;
    searchPlaceholder: string;
    tabs: TabSpec[];
    activeTab: string;
    onTab: (id: string) => void;
    /** Renders the filter button; omit to hide it. */
    onFilter?: () => void;
    filterActive?: boolean;
    /** Renders the delete/select button; omit to hide it. */
    onDelete?: () => void;
    deleteActive?: boolean;
    /** Extra control rendered after the icon actions, e.g. a "New" button. */
    trailing?: React.ReactNode;
}

export default function ListTopBar({
    fallbackRoute,
    search,
    onSearch,
    searchPlaceholder,
    tabs,
    activeTab,
    onTab,
    onFilter,
    filterActive = false,
    onDelete,
    deleteActive = false,
    trailing,
}: Props): React.ReactElement {
    const goBack = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        router.visit(route(fallbackRoute));
    };

    return (
        <div className="sticky top-0 z-20 bg-surface-container-lowest">
            <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                <button
                    type="button"
                    onClick={goBack}
                    aria-label="Back"
                    className="flex h-9 w-7 shrink-0 items-center justify-center text-on-surface active:scale-90"
                >
                    <span className="material-symbols-outlined text-[26px]">chevron_left</span>
                </button>

                {/* Search pill — the submit button sits inside the rounded field. */}
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-[999px] border border-on-surface/85 pl-4 pr-1">
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => onSearch(event.target.value)}
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder}
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-on-surface placeholder:text-outline focus:border-0 focus:outline-none focus:ring-0"
                    />
                    {search ? (
                        <button
                            type="button"
                            onClick={() => onSearch("")}
                            aria-label="Clear search"
                            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center text-outline active:scale-90"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    ) : null}
                    <span
                        aria-hidden="true"
                        className="flex h-8 w-11 shrink-0 items-center justify-center rounded-[999px] bg-inverse-surface text-inverse-on-surface"
                    >
                        <span className="material-symbols-outlined text-[19px]">search</span>
                    </span>
                </div>

                {onFilter ? (
                    <button
                        type="button"
                        onClick={onFilter}
                        aria-label="Filter"
                        aria-pressed={filterActive}
                        className={`flex h-9 w-8 shrink-0 items-center justify-center active:scale-90 ${
                            filterActive ? "text-primary" : "text-on-surface"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[24px]">tune</span>
                    </button>
                ) : null}

                {onDelete ? (
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={deleteActive ? "Exit selection mode" : "Select and remove"}
                        aria-pressed={deleteActive}
                        className={`flex h-9 w-8 shrink-0 items-center justify-center active:scale-90 ${
                            deleteActive ? "text-error" : "text-on-surface"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[23px]">
                            {deleteActive ? "close" : "delete"}
                        </span>
                    </button>
                ) : null}

                {trailing}
            </div>

            {/* Underline tabs. `no-scrollbar` (app.css) keeps the strip swipeable
                without painting a track across the header. */}
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3">
                {tabs.map((tab) => {
                    const active = tab.id === activeTab;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTab(tab.id)}
                            aria-current={active ? "page" : undefined}
                            className="relative shrink-0 px-3 pb-2.5 pt-1"
                        >
                            <span
                                className={`whitespace-nowrap text-[15px] ${
                                    active ? "font-bold text-on-surface" : "font-normal text-outline"
                                }`}
                            >
                                {tab.label}
                                {tab.count != null && tab.count > 0 ? (
                                    <span
                                        className={`ml-1 font-mono text-[11px] ${
                                            active ? "text-on-surface" : "text-outline"
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                ) : null}
                            </span>
                            {active ? (
                                <span
                                    className="absolute inset-x-2 bottom-0 h-[3px] rounded-[999px] bg-on-surface"
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className="h-px w-full bg-outline-variant/60" />
        </div>
    );
}
