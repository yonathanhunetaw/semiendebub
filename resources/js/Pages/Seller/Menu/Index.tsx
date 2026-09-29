import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router } from "@inertiajs/react";
import React from "react";

const BRAND = "#c2410c";

/**
 * The six operational surfaces, kept prominent as tiles rather than buried in
 * the list. `route` is null where the module has no backing page yet — those
 * render as clearly unavailable instead of as silent dead links, which is what
 * the previous try/catch fallback to "#" produced.
 */
const PROMINENT: Array<{
    label: string;
    icon: string;
    route: string | null;
    badgeKey?: "orders" | "shipments";
}> = [
    { label: "Sales", icon: "trending_up", route: null },
    { label: "Orders", icon: "shopping_bag", route: "seller.orders.index", badgeKey: "orders" },
    { label: "Shipments", icon: "local_shipping", route: "seller.shipments.index", badgeKey: "shipments" },
    { label: "Calendar", icon: "calendar_month", route: null },
    { label: "Balance", icon: "account_balance_wallet", route: null },
    { label: "Documents", icon: "receipt_long", route: null },
];

/** Alibaba-style list rows, grouped into bands. */
const ROW_GROUPS: Array<
    Array<{ label: string; icon: string; route: string | null; badgeKey?: "customers" | "carts" | "items" }>
> = [
    [
        { label: "Items", icon: "inventory_2", route: "seller.items.index", badgeKey: "items" },
        { label: "Categories", icon: "category", route: "seller.categories.index" },
        { label: "Carts", icon: "shopping_cart", route: "seller.carts.index", badgeKey: "carts" },
        { label: "Customers", icon: "group", route: "seller.customers.index", badgeKey: "customers" },
    ],
    [
        { label: "Reviews", icon: "reviews", route: null },
        { label: "Promotions", icon: "campaign", route: null },
        { label: "Analytics", icon: "insights", route: null },
    ],
    [{ label: "Settings", icon: "settings", route: "seller.settings.index" }],
];

interface Props {
    stats?: {
        orders?: number;
        shipments?: number;
        customers?: number;
        carts?: number;
        items?: number;
    };
    seller?: { name: string | null; email: string | null; store: string | null };
}

/** Resolve a route name, or null when it is not registered. */
function href(name: string | null): string | null {
    if (!name) return null;
    try {
        return route(name);
    } catch {
        return null;
    }
}

export default function Index({ stats, seller }: Props): React.ReactElement {
    const initials = (seller?.name ?? "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return (
        <>
            <Head title="More">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen bg-slate-100 pb-28">
                {/* ── Title bar ── */}
                <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
                    <button
                        type="button"
                        onClick={() =>
                            window.history.length > 1
                                ? window.history.back()
                                : router.visit(route("seller.dashboard"))
                        }
                        aria-label="Back"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-700 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                    </button>
                    <h1 className="text-[19px] font-bold tracking-tight text-gray-900">More</h1>
                </div>

                {/* ── Profile block ── */}
                <div className="flex items-center gap-3 bg-white px-4 py-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[16px] font-bold text-slate-500">
                        {initials || (
                            <span className="material-symbols-outlined text-[30px]">person</span>
                        )}
                    </div>

                    {seller?.name ? (
                        <div className="min-w-0">
                            <p className="truncate text-[17px] font-bold text-gray-900">
                                {seller.name}
                            </p>
                            <p className="truncate text-[12px] text-slate-500">
                                {seller.store ?? seller.email}
                            </p>
                        </div>
                    ) : (
                        <Link
                            href={route("seller.login")}
                            className="rounded-full px-6 py-2.5 text-[15px] font-bold text-white active:scale-95"
                            style={{ backgroundColor: BRAND }}
                        >
                            Sign in or Register
                        </Link>
                    )}
                </div>

                {/* ── Prominent tiles ── */}
                <div className="bg-white px-3 pb-4">
                    <div className="grid grid-cols-3 gap-2">
                        {PROMINENT.map((tile) => {
                            const target = href(tile.route);
                            const badge = tile.badgeKey ? stats?.[tile.badgeKey] : undefined;
                            const body = (
                                <>
                                    <span className="relative">
                                        <span
                                            className="material-symbols-outlined text-[26px]"
                                            style={{
                                                color: target ? BRAND : "#cbd5e1",
                                                fontVariationSettings: "'FILL' 1",
                                            }}
                                        >
                                            {tile.icon}
                                        </span>
                                        {badge != null && badge > 0 ? (
                                            <span
                                                className="absolute -right-2.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                                                style={{ backgroundColor: BRAND }}
                                            >
                                                {badge > 99 ? "99+" : badge}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        className={`text-[12px] font-bold ${target ? "text-gray-900" : "text-slate-400"}`}
                                    >
                                        {tile.label}
                                    </span>
                                    {!target ? (
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-300">
                                            Soon
                                        </span>
                                    ) : null}
                                </>
                            );

                            const shell =
                                "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white py-4";

                            return target ? (
                                <Link
                                    key={tile.label}
                                    href={target}
                                    className={`${shell} transition-transform active:scale-95 hover:bg-slate-50`}
                                >
                                    {body}
                                </Link>
                            ) : (
                                <span
                                    key={tile.label}
                                    aria-disabled="true"
                                    title={`${tile.label} — coming soon`}
                                    className={`${shell} cursor-default bg-slate-50/60`}
                                >
                                    {body}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* ── List rows, banded like the reference ── */}
                {ROW_GROUPS.map((group, groupIndex) => (
                    <div key={groupIndex} className="mt-2 bg-white">
                        {group.map((row, rowIndex) => {
                            const target = href(row.route);
                            const badge = row.badgeKey ? stats?.[row.badgeKey] : undefined;
                            const notLast = rowIndex < group.length - 1;

                            const body = (
                                <>
                                    <span
                                        className="material-symbols-outlined text-[24px]"
                                        style={{ color: target ? "#334155" : "#cbd5e1" }}
                                    >
                                        {row.icon}
                                    </span>

                                    <span
                                        className={`flex-1 text-[16px] ${target ? "text-gray-900" : "text-slate-400"}`}
                                    >
                                        {row.label}
                                    </span>

                                    {badge != null && badge > 0 ? (
                                        <span className="text-[13px] font-semibold text-slate-400">
                                            {badge}
                                        </span>
                                    ) : null}

                                    {!target ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                            Soon
                                        </span>
                                    ) : null}

                                    <span
                                        className="material-symbols-outlined text-[20px]"
                                        style={{ color: "#cbd5e1" }}
                                    >
                                        chevron_right
                                    </span>
                                </>
                            );

                            const shell = `flex w-full items-center gap-4 px-4 py-4 text-left ${
                                notLast ? "border-b border-slate-100" : ""
                            }`;

                            return target ? (
                                <Link
                                    key={row.label}
                                    href={target}
                                    className={`${shell} active:bg-slate-50`}
                                >
                                    {body}
                                </Link>
                            ) : (
                                <span
                                    key={row.label}
                                    aria-disabled="true"
                                    className={`${shell} cursor-default`}
                                >
                                    {body}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
