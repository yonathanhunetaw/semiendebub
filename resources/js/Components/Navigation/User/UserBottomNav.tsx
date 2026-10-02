import { Link, router, usePage } from "@inertiajs/react";
import React from "react";

import { STOREFRONT_BRAND } from "@/Components/Storefront/storefrontConstants";

export interface UserBottomNavProps {
    /** Badge count on the cart tab. */
    cartCount?: number;
    /** The cart is a slide-over, not a page, so the tab calls back. */
    onOpenCart?: () => void;
    /** Drives the account tab between profile and sign-in. */
    isAuthenticated?: boolean;
}

type TabKey = "home" | "discover" | "account";

/**
 * Buyer bottom navigation.
 *
 * Five slots, phone-first, fixed to the viewport bottom with a safe-area inset
 * so it clears the home indicator on iOS. Only the active tab is tinted; the
 * rest stay neutral, which is what makes the current position readable at a
 * glance.
 *
 * Hidden from `md` up. A bottom tab rail is a phone affordance, and on a wide
 * screen it strands five tiny targets along the bottom edge while the masthead
 * sits empty — so the same destinations move into the "All Categories"
 * hamburger (StorefrontMenuDrawer) there. Anything else pinned to the bottom
 * offsets by ABOVE_USER_BOTTOM_NAV while this is on screen.
 */
export default function UserBottomNav({
    cartCount = 0,
    onOpenCart,
    isAuthenticated = false,
}: UserBottomNavProps): React.ReactElement {
    const { url } = usePage();
    const path = url.split("?")[0];
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";

    const active: TabKey = React.useMemo(() => {
        if (path.startsWith("/profile") || path.startsWith("/login")) return "account";
        // Discover is the shop filtered to live discounts, so it shares /shop.
        if (query.includes("on_sale=1")) return "discover";
        if (path.startsWith("/shop") || path.startsWith("/dashboard")) return "home";
        return "home";
    }, [path, query]);

    return (
        <nav
            aria-label="Main"
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="mx-auto flex max-w-2xl items-stretch">
                <NavTab
                    label="Home"
                    icon="home"
                    href={route("storefront.index")}
                    active={active === "home"}
                />

                <NavTab
                    label="Discover"
                    icon="visibility"
                    href={route("storefront.index", { on_sale: 1 })}
                    active={active === "discover"}
                />

                {/*
                  This app has no messaging feature yet, so the slot is present
                  for layout parity but inert rather than a dead link.
                */}
                <NavTab label="Messages" icon="chat" disabled />

                {/*
                  An action, not a destination, on pages that mount CartDrawer.
                  On the ones that do not (the account page), there is no
                  slide-over to open, so the tab falls back to the catalogue —
                  where the cart lives — instead of being a button that does
                  nothing when pressed.
                */}
                {onOpenCart ? (
                    <NavTab
                        label="Cart"
                        icon="shopping_cart"
                        badge={cartCount}
                        onClick={onOpenCart}
                    />
                ) : (
                    <NavTab
                        label="Cart"
                        icon="shopping_cart"
                        badge={cartCount}
                        href={route("storefront.index")}
                    />
                )}

                <NavTab
                    label="Account"
                    icon="person"
                    href={isAuthenticated ? route("profile.edit") : route("login")}
                    active={active === "account"}
                />
            </div>
        </nav>
    );
}

interface NavTabProps {
    label: string;
    /** Material Symbols ligature name. */
    icon: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    badge?: number;
    disabled?: boolean;
}

function NavTab({
    label,
    icon,
    href,
    onClick,
    active = false,
    badge = 0,
    disabled = false,
}: NavTabProps): React.ReactElement {
    const body = (
        <>
            <span className="relative">
                <span
                    className="material-symbols-outlined text-[24px] leading-none"
                    style={{
                        fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                        color: active ? STOREFRONT_BRAND : undefined,
                    }}
                >
                    {icon}
                </span>

                {badge > 0 ? (
                    <span
                        className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                        style={{ backgroundColor: STOREFRONT_BRAND }}
                    >
                        {badge > 99 ? "99+" : badge}
                    </span>
                ) : null}
            </span>

            <span
                className="text-[10px] font-bold leading-none"
                style={{ color: active ? STOREFRONT_BRAND : undefined }}
            >
                {label}
            </span>
        </>
    );

    const shared =
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors";

    if (disabled) {
        return (
            <span
                aria-disabled="true"
                title={`${label} — coming soon`}
                className={`${shared} cursor-default text-slate-300`}
            >
                {body}
            </span>
        );
    }

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className={`${shared} text-slate-500 active:scale-95`}
            >
                {body}
            </button>
        );
    }

    return (
        <Link
            href={href ?? "#"}
            aria-current={active ? "page" : undefined}
            className={`${shared} text-slate-500 active:scale-95`}
        >
            {body}
        </Link>
    );
}
