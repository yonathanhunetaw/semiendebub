import { Link, router, usePage } from "@inertiajs/react";
import React from "react";
import { ThemeContext } from "@/app";
import { SK_NAV, activeSkItem } from "./stockKeeperNav";

interface SideNavProps {
    auth?: { user?: { first_name?: string; last_name?: string; role?: string } | null };
    [key: string]: unknown;
}

/** Desktop (lg and up): a fixed sidebar with every section and the account. */
export default function StockKeeperSideNav({ onScan }: { onScan: () => void }): React.ReactElement {
    const { url, props } = usePage<SideNavProps>();
    const active = activeSkItem(url);
    const user = props.auth?.user;
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (mode: "light" | "dark" | "system") => void;
        currentSetting: "light" | "dark" | "system";
    };
    const initials = `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase() || "SK";

    return (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-outline-variant bg-surface-container-lowest lg:flex">
            <Link href={route("stock_keeper.dashboard")} className="flex items-center gap-3 px-5 pb-4 pt-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                    <span className="material-symbols-outlined text-[22px] [font-variation-settings:'FILL'_1]">warehouse</span>
                </span>
                <span>
                    <span className="block text-[15px] font-extrabold leading-tight text-on-surface">Stock Keeper</span>
                    <span className="block text-[12px] text-on-surface-variant">Duka warehouse desk</span>
                </span>
            </Link>

            <div className="px-3">
                <button
                    type="button"
                    onClick={onScan}
                    className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary shadow-sm hover:opacity-95"
                >
                    <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                    Scan a barcode
                </button>
            </div>

            <nav aria-label="Stock keeper sections" className="flex-1 overflow-y-auto px-3 pb-4">
                {SK_NAV.map((group) => (
                    <div key={group.label} className="mt-3">
                        <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/80">{group.label}</p>
                        {group.items.map((item) => {
                            const on = item.key === active?.key;
                            return (
                                <Link
                                    key={item.key}
                                    href={route(item.route)}
                                    aria-current={on ? "page" : undefined}
                                    className={`group mb-0.5 flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors ${
                                        on ? "bg-primary-container/60 text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-[20px] ${on ? "[font-variation-settings:'FILL'_1]" : ""}`}>{item.icon}</span>
                                    <span className={`text-[14px] ${on ? "font-bold" : "font-medium"}`}>{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="border-t border-outline-variant p-3">
                <div className="flex items-center gap-3 rounded-[12px] px-2 py-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[999px] bg-primary-container text-[13px] font-bold text-primary">{initials}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-on-surface">{[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Stock keeper"}</span>
                        <span className="block truncate text-[12px] text-on-surface-variant">{user?.role ?? "Stock Keeper"}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => toggleTheme(currentSetting === "dark" ? "light" : "dark")}
                        aria-label="Switch light or dark"
                        className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[18px]">{currentSetting === "dark" ? "light_mode" : "dark_mode"}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => router.post("/logout")}
                        aria-label="Sign out"
                        className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[18px]">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
