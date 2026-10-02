import { Link } from "@inertiajs/react";
import { Drawer } from "@mui/material";
import React from "react";

import type { StorefrontAuthUser, StorefrontCategory } from "@/types/storefront";
import { STOREFRONT_BRAND, STOREFRONT_BRAND_SOFT } from "./storefrontConstants";

export interface StorefrontMenuDrawerProps {
    open: boolean;
    onClose: () => void;
    categories: StorefrontCategory[];
    activeCategoryId: number | null;
    onSelectCategory: (categoryId: number | null) => void;
    cartCount: number;
    onOpenCart: () => void;
    user: StorefrontAuthUser | null;
}

/**
 * The desktop counterpart to UserBottomNav.
 *
 * On a phone the five buyer destinations sit in a fixed bar at the bottom of
 * the screen. That bar is hidden from `md` up, where a bottom-anchored tab rail
 * reads as a phone affordance stranded on a wide screen — so the same
 * destinations, plus the full category tree, open from the "All Categories"
 * hamburger in the masthead instead.
 */
export default function StorefrontMenuDrawer({
    open,
    onClose,
    categories,
    activeCategoryId,
    onSelectCategory,
    cartCount,
    onOpenCart,
    user,
}: StorefrontMenuDrawerProps): React.ReactElement {
    const isAuthenticated = user !== null;

    const pick = (categoryId: number | null): void => {
        onSelectCategory(categoryId);
        onClose();
    };

    return (
        <Drawer
            anchor="left"
            open={open}
            onClose={onClose}
            slotProps={{ paper: { sx: { width: 320, maxWidth: "88vw" } } }}
        >
            <div className="flex h-full flex-col bg-white">
                {/* ── Header ── */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <span className="text-[14px] font-extrabold tracking-tight text-gray-900">
                        Browse
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {/* ── Categories ── */}
                    <p className="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        All categories
                    </p>
                    <nav aria-label="Product categories">
                        <DrawerRow
                            label="All products"
                            icon="grid_view"
                            active={activeCategoryId === null}
                            onClick={() => pick(null)}
                        />
                        {categories.map((category) => (
                            <DrawerRow
                                key={category.id}
                                label={category.name}
                                icon="label"
                                trailing={String(category.count)}
                                active={activeCategoryId === category.id}
                                onClick={() => pick(category.id)}
                            />
                        ))}
                    </nav>

                    <div className="mx-4 my-3 h-px bg-slate-100" />

                    {/* ── The buyer destinations the bottom bar carries on phones ── */}
                    <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        My shopping
                    </p>
                    <nav aria-label="Account">
                        <DrawerRow
                            label="Home"
                            icon="home"
                            href={route("storefront.index")}
                            onClick={onClose}
                        />
                        <DrawerRow
                            label="Discover deals"
                            icon="local_offer"
                            href={route("storefront.index", { on_sale: 1 })}
                            onClick={onClose}
                        />
                        <DrawerRow
                            label="Cart"
                            icon="shopping_cart"
                            trailing={cartCount > 0 ? String(cartCount) : undefined}
                            onClick={() => {
                                onClose();
                                onOpenCart();
                            }}
                        />
                        {/* No messaging feature exists yet — present for parity
                            with the phone bar, but inert rather than a dead link. */}
                        <DrawerRow label="Messages" icon="chat" disabled />
                        <DrawerRow
                            label={isAuthenticated ? "My account" : "Sign in"}
                            icon="person"
                            href={
                                isAuthenticated ? route("profile.edit") : route("login")
                            }
                            onClick={onClose}
                        />
                    </nav>
                </div>

                {/* ── Auth footer ── */}
                {!isAuthenticated ? (
                    <div className="border-t border-slate-200 p-4">
                        <Link
                            href={route("register")}
                            className="flex h-10 w-full items-center justify-center rounded-full text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: STOREFRONT_BRAND }}
                        >
                            Create an account
                        </Link>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}

interface DrawerRowProps {
    label: string;
    /** Material Symbols ligature name. */
    icon: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    trailing?: string;
    disabled?: boolean;
}

function DrawerRow({
    label,
    icon,
    href,
    onClick,
    active = false,
    trailing,
    disabled = false,
}: DrawerRowProps): React.ReactElement {
    const body = (
        <>
            <span
                className="material-symbols-outlined text-[20px]"
                style={{
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                    color: active ? STOREFRONT_BRAND : undefined,
                }}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {trailing ? (
                <span className="shrink-0 text-[11px] font-bold text-slate-400">
                    {trailing}
                </span>
            ) : null}
        </>
    );

    const shared =
        "flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-semibold transition-colors";

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

    const tone = active
        ? "text-gray-900"
        : "text-slate-600 hover:bg-slate-50 hover:text-gray-900";
    const style = active ? { backgroundColor: STOREFRONT_BRAND_SOFT } : undefined;

    if (href) {
        return (
            <Link href={href} onClick={onClick} className={`${shared} ${tone}`} style={style}>
                {body}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} className={`${shared} ${tone}`} style={style}>
            {body}
        </button>
    );
}
