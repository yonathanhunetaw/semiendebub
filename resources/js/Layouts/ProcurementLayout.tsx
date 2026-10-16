import FlashToast from "@/Components/Shared/FlashToast";
import { PROCUREMENT_NAV, activeProcurementItem } from "@/Components/Navigation/Procurement/procurementNav";
import { ThemeContext } from "@/theme/ThemeContext";
import { Head, Link, router, usePage } from "@inertiajs/react";
import { CssBaseline } from "@mui/material";
import React from "react";

interface LayoutProps {
    auth?: { user?: { first_name?: string; last_name?: string; role?: string } | null };
    [key: string]: unknown;
}

/**
 * The procurement shell, Tailwind-first like the stock keeper app.
 *
 *   < lg  top bar with the sections as a tab row under it
 *   ≥ lg  fixed sidebar, content beside it
 *
 * Colours come from the procurement role (theme/roles.ts) through the tokens.
 */
export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
    const { url, props } = usePage<LayoutProps>();
    const active = activeProcurementItem(url);
    const user = props.auth?.user;
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (mode: "light" | "dark" | "system") => void;
        currentSetting: "light" | "dark" | "system";
    };
    const initials = `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase() || "PR";
    const flipTheme = () => toggleTheme(currentSetting === "dark" ? "light" : "dark");

    return (
        <div className="min-h-screen bg-background text-on-surface [background-image:radial-gradient(circle_at_top,rgb(var(--primary)/0.10),transparent_32%)]">
            <CssBaseline />
            <Head>
                <title>Procurement | Duka</title>
            </Head>
            <FlashToast bottomClass="bottom-[calc(24px+env(safe-area-inset-bottom))]" />

            <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-outline-variant bg-surface-container-lowest lg:flex">
                <Link href={route("procurement.dashboard")} className="flex items-center gap-3 px-5 pb-4 pt-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-[22px] [font-variation-settings:'FILL'_1]">shopping_cart</span>
                    </span>
                    <span>
                        <span className="block text-[15px] font-extrabold leading-tight text-on-surface">Procurement</span>
                        <span className="block text-[12px] text-on-surface-variant">Buying for the hubs</span>
                    </span>
                </Link>

                <div className="px-3">
                    <Link
                        href={route("procurement.purchase_orders.create")}
                        className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary shadow-sm hover:opacity-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        New purchase order
                    </Link>
                </div>

                <nav aria-label="Procurement sections" className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
                    {PROCUREMENT_NAV.map((item) => {
                        const on = item.key === active?.key;
                        return (
                            <Link
                                key={item.key}
                                href={route(item.route)}
                                aria-current={on ? "page" : undefined}
                                className={`mb-0.5 flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors ${
                                    on ? "bg-primary-container/60 text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                                }`}
                            >
                                <span className={`material-symbols-outlined text-[20px] ${on ? "[font-variation-settings:'FILL'_1]" : ""}`}>{item.icon}</span>
                                <span className="min-w-0">
                                    <span className={`block text-[14px] ${on ? "font-bold" : "font-medium"}`}>{item.label}</span>
                                    <span className="block truncate text-[11px] text-on-surface-variant">{item.hint}</span>
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-outline-variant p-3">
                    <div className="flex items-center gap-3 rounded-[12px] px-2 py-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[999px] bg-primary-container text-[13px] font-bold text-primary">{initials}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold text-on-surface">{[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Procurement"}</span>
                            <span className="block truncate text-[12px] text-on-surface-variant">{user?.role ?? "Procurement"}</span>
                        </span>
                        <button type="button" onClick={flipTheme} aria-label="Switch light or dark" className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[18px]">{currentSetting === "dark" ? "light_mode" : "dark_mode"}</span>
                        </button>
                        <button type="button" onClick={() => router.post("/logout")} aria-label="Sign out" className="flex h-8 w-8 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[18px]">logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            <div className="lg:pl-[256px]">
                {/* Phone/tablet: brand, new order, and the sections as tabs. */}
                <header className="sticky top-0 z-20 border-b border-outline-variant/70 bg-surface-container-lowest/90 backdrop-blur-lg lg:hidden">
                    <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-3 px-4 sm:px-6">
                        <Link href={route("procurement.dashboard")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-on-primary">
                            <span className="material-symbols-outlined text-[20px] [font-variation-settings:'FILL'_1]">shopping_cart</span>
                        </Link>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-extrabold leading-tight">{active?.label ?? "Procurement"}</p>
                            <p className="truncate text-[12px] text-on-surface-variant">{active?.hint ?? "Buying for the hubs"}</p>
                        </div>
                        <button type="button" onClick={flipTheme} aria-label="Switch light or dark" className="flex h-9 w-9 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[20px]">{currentSetting === "dark" ? "light_mode" : "dark_mode"}</span>
                        </button>
                        <button type="button" onClick={() => router.post("/logout")} aria-label="Sign out" className="flex h-9 w-9 items-center justify-center rounded-[10px] text-on-surface-variant hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[20px]">logout</span>
                        </button>
                    </div>
                    <nav aria-label="Procurement sections" className="mx-auto flex max-w-[1100px] gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
                        {PROCUREMENT_NAV.map((item) => {
                            const on = item.key === active?.key;
                            return (
                                <Link
                                    key={item.key}
                                    href={route(item.route)}
                                    aria-current={on ? "page" : undefined}
                                    className={`flex shrink-0 items-center gap-1.5 rounded-[999px] px-3 py-1.5 text-[13px] font-bold ${
                                        on ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </header>

                <main className="mx-auto w-full min-w-0 max-w-[1400px] px-3 pb-12 pt-4 sm:px-6 sm:pt-6 lg:px-8">{children}</main>
            </div>
        </div>
    );
}
