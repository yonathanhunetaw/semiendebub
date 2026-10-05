import { Link, usePage } from "@inertiajs/react";
import React from "react";

const navItems = [
    { value: "dashboard", label: "Store", icon: "storefront", href: () => route("seller.dashboard") },
    { value: "categories", label: "Categories", icon: "category", href: () => route("seller.categories.index") },
    { value: "carts", label: "Carts", icon: "shopping_cart", href: () => route("seller.carts.index") },
    { value: "more", label: "More", icon: "apps", href: () => route("seller.menu.index") },
] as const;

type Tab = (typeof navItems)[number]["value"];

function currentTab(url: string): Tab {
    const path = url.split("?")[0];
    if (path.startsWith("/dashboard")) return "dashboard";
    if (path.startsWith("/categories")) return "categories";
    if (path.startsWith("/orders") || path.startsWith("/carts")) return "carts";
    return "more";
}

interface SellerNavProps {
    /** Shared by HandleInertiaRequests for sellers; null for other roles. */
    seller?: { open_carts: number } | null;
    [key: string]: unknown;
}

/**
 * The seller's floating bottom bar: a white (`surface-container-lowest`)
 * card with a hairline border. The active tab is `primary` with a filled
 * icon, bold label and an underline; the rest are `on-surface-variant`.
 * Carts carries a `primary` badge with the seller's open carts. Positions
 * itself (fixed, centred on the 480px shell), so layouts just render it.
 */
export default function SellerBottomNav(): React.ReactElement {
    const { url, props } = usePage<SellerNavProps>();
    const active = currentTab(url);
    const openCarts = props.seller?.open_carts ?? 0;

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:max-w-full md:max-w-[1200px]">
            <nav
                aria-label="Seller navigation"
                className="pointer-events-auto mx-auto flex max-w-[456px] items-center justify-between rounded-2xl border border-outline-variant/90 bg-surface-container-lowest/95 px-3 py-1.5 shadow-xl backdrop-blur-lg"
            >
                {navItems.map((item) => {
                    const isActive = item.value === active;
                    return (
                        <Link
                            key={item.value}
                            href={item.href()}
                            aria-current={isActive ? "page" : undefined}
                            className={`relative flex w-16 flex-col items-center justify-center py-1 transition-all ${
                                isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface active:scale-95"
                            }`}
                        >
                            <span className="relative">
                                <span
                                    className={`material-symbols-outlined text-[22px] ${
                                        isActive ? "[font-variation-settings:'FILL'_1,'wght'_500]" : ""
                                    }`}
                                >
                                    {item.icon}
                                </span>
                                {item.value === "carts" && openCarts > 0 && (
                                    <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-[999px] bg-primary px-1 text-[10px] font-bold text-on-primary ring-2 ring-surface-container-lowest">
                                        {openCarts > 99 ? "99+" : openCarts}
                                    </span>
                                )}
                            </span>
                            <span className={`mt-0.5 text-[11px] tracking-tight ${isActive ? "font-bold" : "font-medium"}`}>
                                {item.label}
                            </span>
                            {isActive && <span className="absolute bottom-0 h-0.5 w-5 rounded-[999px] bg-primary" />}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
