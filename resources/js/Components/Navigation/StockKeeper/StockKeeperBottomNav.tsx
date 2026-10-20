import { Link, usePage } from "@inertiajs/react";
import React from "react";
import useBottomNav from "@/hooks/useBottomNav";
import { SK_BOTTOM_TABS, SK_NAV, SK_NAV_ITEMS, activeSkItem } from "./stockKeeperNav";

/**
 * Phones and tablets (below lg): a floating bottom bar with four sections and
 * a "More" sheet listing every section, as in the seller app. Hides while
 * the user scrolls down (useBottomNav).
 */
export default function StockKeeperBottomNav(): React.ReactElement {
    const { url } = usePage();
    const [moreOpen, setMoreOpen] = React.useState(false);
    const active = activeSkItem(url);
    const tabs = SK_BOTTOM_TABS.map((key) => SK_NAV_ITEMS.find((item) => item.key === key)!);
    const moreActive = active !== undefined && !(SK_BOTTOM_TABS as readonly string[]).includes(active.key);
    const ref = React.useRef<HTMLDivElement>(null);
    useBottomNav(ref, 8);

    // A visit closes the sheet.
    React.useEffect(() => setMoreOpen(false), [url]);

    const tabClass = (on: boolean) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center py-1 transition-all ${
            on ? "text-primary" : "text-on-surface-variant hover:text-on-surface active:scale-95"
        }`;
    const iconClass = (on: boolean) =>
        `material-symbols-outlined text-[22px] ${on ? "[font-variation-settings:'FILL'_1,'wght'_500]" : ""}`;

    return (
        <>
            {moreOpen && (
                <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="All sections">
                    <button type="button" aria-label="Close" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-on-surface/40" />
                    <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[80vh] w-full max-w-[640px] overflow-y-auto rounded-t-[24px] border border-outline-variant bg-surface-container-lowest px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
                        <div className="mx-auto mb-3 h-1 w-10 rounded-[999px] bg-outline-variant" />
                        {SK_NAV.map((group) => (
                            <div key={group.label} className="mb-3">
                                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{group.label}</p>
                                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                    {group.items.map((item) => {
                                        const on = item.key === active?.key;
                                        return (
                                            <Link
                                                key={item.key}
                                                href={route(item.route)}
                                                className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${
                                                    on ? "border-primary bg-primary-container/40" : "border-outline-variant/70 bg-surface-container-low hover:bg-surface-container"
                                                }`}
                                            >
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${on ? "bg-primary text-on-primary" : "bg-surface-container text-primary"}`}>
                                                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block text-[14px] font-bold text-on-surface">{item.label}</span>
                                                    <span className="block truncate text-[12px] text-on-surface-variant">{item.hint}</span>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div ref={ref} className="app-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden">
                <nav
                    aria-label="Stock keeper navigation"
                    className="pointer-events-auto mx-auto flex max-w-[520px] items-center justify-between gap-1 rounded-2xl border border-outline-variant/90 bg-surface-container-lowest/95 px-2 py-1.5 shadow-xl backdrop-blur-lg"
                >
                    {tabs.map((item) => {
                        const on = item.key === active?.key && !moreOpen;
                        return (
                            <Link key={item.key} href={route(item.route)} aria-current={on ? "page" : undefined} className={tabClass(on)}>
                                <span className={iconClass(on)}>{item.icon}</span>
                                <span className={`mt-0.5 truncate text-[11px] tracking-tight ${on ? "font-bold" : "font-medium"}`}>{item.label}</span>
                                {on && <span className="absolute bottom-0 h-0.5 w-5 rounded-[999px] bg-primary" />}
                            </Link>
                        );
                    })}
                    <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} className={tabClass(moreOpen || moreActive)}>
                        <span className={iconClass(moreOpen || moreActive)}>{moreOpen ? "close" : "apps"}</span>
                        <span className={`mt-0.5 text-[11px] tracking-tight ${moreOpen || moreActive ? "font-bold" : "font-medium"}`}>More</span>
                        {(moreOpen || moreActive) && <span className="absolute bottom-0 h-0.5 w-5 rounded-[999px] bg-primary" />}
                    </button>
                </nav>
            </div>
        </>
    );
}
