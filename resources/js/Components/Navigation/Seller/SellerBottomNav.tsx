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
 * The seller's floating bottom bar: a rounded `primary` slab with `on-primary`
 * tabs. The active tab gets a filled icon, bold label and a dot; Carts carries
 * a badge with the seller's open carts. Positions itself (fixed, centred on
 * the 480px shell), so layouts just render it.
 */
export default function SellerBottomNav(): React.ReactElement {
    const { url, props } = usePage<SellerNavProps>();
    const active = currentTab(url);
    const openCarts = props.seller?.open_carts ?? 0;

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] px-3 pb-[calc(8px+env(safe-area-inset-bottom))] sm:max-w-full md:max-w-[1200px]">
            <nav
                aria-label="Seller navigation"
                className="pointer-events-auto mx-auto flex h-16 max-w-[456px] items-center justify-around rounded-2xl bg-primary px-2 text-on-primary shadow-xl"
            >
                {navItems.map((item) => {
                    const isActive = item.value === active;
                    return (
                        <Link
                            key={item.value}
                            href={item.href()}
                            aria-current={isActive ? "page" : undefined}
                            className={`relative flex w-16 flex-col items-center justify-center py-1 transition-transform active:scale-95 ${
                                isActive ? "text-on-primary" : "text-on-primary/80 hover:text-on-primary"
                            }`}
                        >
                            <span className="relative">
                                <span
                                    className={`material-symbols-outlined text-[24px] ${
                                        isActive ? "[font-variation-settings:'FILL'_1,'wght'_600]" : ""
                                    }`}
                                >
                                    {item.icon}
                                </span>
                                {item.value === "carts" && openCarts > 0 && (
                                    <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-[999px] bg-on-primary px-1 text-[10px] font-bold text-primary shadow-sm">
                                        {openCarts > 99 ? "99+" : openCarts}
                                    </span>
                                )}
                            </span>
                            <span className={`mt-0.5 text-[11px] tracking-tight ${isActive ? "font-bold" : "font-medium"}`}>
                                {item.label}
                            </span>
                            {isActive && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-[999px] bg-on-primary" />}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
