import SellerLayout from "@/Layouts/SellerLayout";
import { SAMPLE_ORDERS } from "@/Data/sellerOrderFlow";
import { Head, Link } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Seller "More" hub.
 *
 * Laid out as a stack of white cards on a near-white page: two pipeline cards
 * (orders, shipments) with 5-up counter grids, then the operations rows.
 *
 * Two notes on styling, because this project's tailwind.config.js overrides
 * parts of the default scale:
 *  - `rounded-full` is redefined to 0.75rem and `rounded-xl`/`rounded-lg` to
 *    0.5rem/0.25rem, so every radius here is an explicit arbitrary value.
 *    Pills and circles use `rounded-[999px]`.
 *  - Tailwind 3 has no `shadow-xs`; `shadow-sm` is the equivalent.
 */

const BRAND = "#c2410c";
const INK = "#0b1c30";
const PAGE_BG = "#F8F9FB";

/** Accent sets kept as literal class strings so the JIT compiler sees them. */
const TONES = {
    amber: { badge: "bg-amber-600", caption: "text-amber-700", hover: "group-hover:text-amber-600" },
    blue: { badge: "bg-blue-600", caption: "text-blue-600", hover: "group-hover:text-blue-600" },
    brand: { badge: "bg-[#c2410c]", caption: "text-[#c2410c]", hover: "group-hover:text-[#c2410c]" },
    emerald: { badge: "bg-emerald-600", caption: "text-emerald-600", hover: "group-hover:text-emerald-600" },
    rose: { badge: "bg-rose-600", caption: "text-rose-600", hover: "group-hover:text-rose-600" },
    violet: { badge: "bg-violet-600", caption: "text-violet-600", hover: "group-hover:text-violet-600" },
} as const;

type Tone = keyof typeof TONES;

interface ShipmentStats {
    manifest?: number;
    scheduled?: number;
    en_route?: number;
    shipped?: number;
    overdue?: number;
}

interface Props {
    stats?: {
        shipments?: ShipmentStats;
        catalogue?: { customers?: number; items?: number; carts?: number };
    };
    seller?: { name: string | null; email: string | null; store: string | null };
}

interface Tile {
    label: string;
    caption: string;
    icon: string;
    count: number;
    tone: Tone;
    /** Standing warning: carries its accent even at rest, as the design does. */
    alert?: boolean;
    /** Tab to open on the destination list, via `?tab=`. */
    tab?: string;
}

interface Row {
    label: string;
    caption: string;
    icon: string;
    /** Registered route name, or null while the module has no page yet. */
    route: string | null;
    tone: Tone | "ink";
    /** Gradient + border pair for the row shell; plain white when omitted. */
    surface?: string;
    count?: number;
}

/** Resolve a route name, or null when Ziggy has no such route registered. */
function href(name: string | null): string | null {
    if (!name) return null;

    try {
        return route(name);
    } catch {
        return null;
    }
}

/** Icon-only square used by the row list. */
const ROW_ICON_BG: Record<Tone | "ink", string> = {
    amber: "bg-amber-500",
    blue: "bg-blue-600",
    brand: "bg-[#c2410c]",
    emerald: "bg-emerald-600",
    rose: "bg-rose-600",
    violet: "bg-violet-600",
    ink: "bg-[#0b1c30]",
};

const ROW_HOVER: Record<Tone | "ink", string> = {
    amber: "group-hover:text-amber-600",
    blue: "group-hover:text-blue-600",
    brand: "group-hover:text-[#c2410c]",
    emerald: "group-hover:text-emerald-600",
    rose: "group-hover:text-rose-600",
    violet: "group-hover:text-violet-600",
    ink: "group-hover:text-gray-800",
};

/**
 * A 5-up counter grid. Every tile leads to the same list page — the order and
 * shipment indexes take no status filter yet — so the tiles read as counters
 * plus a way in, not as saved filters.
 */
function PipelineCard({
    title,
    actionLabel,
    actionRoute,
    tiles,
    footer,
    preview = false,
}: {
    title: string;
    actionLabel: string;
    actionRoute: string | null;
    tiles: Tile[];
    footer?: Row[];
    /** Flags a card whose counts come from sample data, not the database. */
    preview?: boolean;
}) {
    const target = href(actionRoute);

    return (
        <section className="mb-3 px-3.5">
            <div className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-[13px] font-bold" style={{ color: INK }}>
                            {title}
                        </h2>
                        {preview ? (
                            <span className="rounded-[999px] bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                Preview
                            </span>
                        ) : null}
                    </div>
                    {target ? (
                        <Link
                            href={target}
                            className="flex items-center text-[11px] font-medium text-gray-500 hover:text-gray-800"
                        >
                            <span>{actionLabel}</span>
                            <span className="material-symbols-outlined ml-0.5 text-xs">chevron_right</span>
                        </Link>
                    ) : null}
                </div>

                <div
                    className={`grid gap-1 text-center ${
                        tiles.length === 6 ? "grid-cols-3 gap-y-2" : "grid-cols-5"
                    } ${footer ? "border-b border-gray-100 pb-3" : ""}`}
                >
                    {tiles.map((tile) => {
                        const tone = TONES[tile.tone];
                        const tileTarget =
                            target && tile.tab ? `${target}?tab=${tile.tab}` : target;

                        const body = (
                            <>
                                <div
                                    className={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                                        tile.alert ? tone.caption : "text-gray-700"
                                    } ${target && !tile.alert ? tone.hover : ""}`}
                                >
                                    <span className="material-symbols-outlined text-[22px]">{tile.icon}</span>
                                    {tile.count > 0 ? (
                                        <span
                                            className={`absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-[999px] px-1 font-mono text-[8px] font-bold text-white shadow-sm ${tone.badge}`}
                                        >
                                            {tile.count > 99 ? "99+" : tile.count}
                                        </span>
                                    ) : null}
                                </div>
                                <span
                                    className={`mt-0.5 text-[10px] font-bold leading-tight ${
                                        tile.alert ? tone.caption : "text-gray-800"
                                    }`}
                                >
                                    {tile.label}
                                </span>
                                <span className={`text-[8px] font-medium leading-tight ${tone.caption}`}>
                                    {tile.caption}
                                </span>
                            </>
                        );

                        const shell =
                            "group flex flex-col items-center rounded-[12px] p-1 transition-colors";

                        return tileTarget ? (
                            <Link
                                key={tile.label}
                                href={tileTarget}
                                className={`${shell} ${tile.alert ? "hover:bg-rose-50/60" : "hover:bg-gray-50"}`}
                            >
                                {body}
                            </Link>
                        ) : (
                            <div key={tile.label} className={shell}>
                                {body}
                            </div>
                        );
                    })}
                </div>

                {footer ? (
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                        {footer.map((link) => {
                            const linkTarget = href(link.route);

                            const body = (
                                <>
                                    <span
                                        className={`material-symbols-outlined text-base ${
                                            linkTarget ? "text-gray-500" : "text-slate-300"
                                        }`}
                                    >
                                        {link.icon}
                                    </span>
                                    <span
                                        className={`text-[11px] font-medium ${
                                            linkTarget ? "text-gray-800" : "text-slate-400"
                                        }`}
                                    >
                                        {link.label}
                                    </span>
                                    {!linkTarget ? (
                                        <span className="rounded-[999px] bg-slate-100 px-1.5 text-[9px] font-bold uppercase text-slate-400">
                                            Soon
                                        </span>
                                    ) : null}
                                </>
                            );

                            const shell =
                                "flex items-center justify-center gap-1.5 rounded-[10px] bg-gray-50 px-2 py-1";

                            return linkTarget ? (
                                <Link
                                    key={link.label}
                                    href={linkTarget}
                                    className={`${shell} transition-colors hover:bg-gray-100`}
                                >
                                    {body}
                                </Link>
                            ) : (
                                <div
                                    key={link.label}
                                    aria-disabled="true"
                                    title={`${link.label} — not available yet`}
                                    className={`${shell} cursor-default`}
                                >
                                    {body}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

/** One row of the operations list. */
function OpsRow({ row }: { row: Row }) {
    const target = href(row.route);

    const body = (
        <>
            <div className="flex items-center space-x-2.5">
                <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm ${
                        target ? ROW_ICON_BG[row.tone] : "bg-slate-300"
                    }`}
                >
                    <span className="material-symbols-outlined text-lg leading-none">{row.icon}</span>
                </div>
                <div className="flex flex-col">
                    <h4
                        className={`text-xs font-bold leading-tight ${
                            target ? "text-gray-900" : "text-slate-400"
                        }`}
                    >
                        {row.label}
                    </h4>
                    <span className="mt-0.5 text-[10px] leading-none text-gray-500">{row.caption}</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                {row.count != null && row.count > 0 ? (
                    <span className="font-mono text-[11px] font-semibold text-gray-400">{row.count}</span>
                ) : null}
                {!target ? (
                    <span className="rounded-[999px] bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                        Soon
                    </span>
                ) : null}
                <span
                    className={`material-symbols-outlined text-base leading-none text-gray-400 transition-colors ${
                        target ? ROW_HOVER[row.tone] : ""
                    }`}
                >
                    chevron_right
                </span>
            </div>
        </>
    );

    const shell = `flex items-center justify-between rounded-[12px] border px-3 py-2 ${
        target ? row.surface ?? "border-gray-200 bg-white" : "border-slate-200/70 bg-slate-50/60"
    }`;

    return target ? (
        <Link key={row.label} href={target} className={`group ${shell} transition-colors hover:bg-gray-50`}>
            {body}
        </Link>
    ) : (
        <div
            key={row.label}
            aria-disabled="true"
            title={`${row.label} — not available yet`}
            className={`group ${shell} cursor-default`}
        >
            {body}
        </div>
    );
}

function OpsCard({ title, note, rows }: { title: string; note: string; rows: Row[] }) {
    return (
        <section className="mb-3 px-3.5">
            <div className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h3
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: INK }}
                    >
                        {title}
                    </h3>
                    <span className="font-mono text-[10px] text-gray-400">{note}</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                    {rows.map((row) => (
                        <OpsRow key={row.label} row={row} />
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function Index({ stats, seller }: Props): React.ReactElement {
    const shipments = stats?.shipments ?? {};
    const catalogue = stats?.catalogue ?? {};

    /*
     * Counted from the same sample orders the order screens render, so a tile
     * badge matches the tab it opens. Swap `stageCount` for server stats once
     * the order domain exists.
     */
    const stageCount = (stage: string) =>
        SAMPLE_ORDERS.filter((entry) => entry.stage === stage).length;

    const orderTiles: Tile[] = [
        { label: "To Pay", caption: "Awaiting payment", icon: "payments", count: stageCount("to_pay"), tone: "amber", tab: "to_pay" },
        { label: "Paid", caption: "Payment confirmed", icon: "verified", count: stageCount("paid"), tone: "violet", tab: "paid" },
        { label: "Pick & Pack", caption: "Being packed", icon: "inventory_2", count: stageCount("packing"), tone: "blue", tab: "packing" },
        { label: "To Deliver", caption: "Ready to ship", icon: "local_shipping", count: stageCount("to_deliver"), tone: "brand", tab: "to_deliver" },
        { label: "Delivered", caption: "Completed", icon: "task_alt", count: stageCount("delivered"), tone: "emerald", tab: "delivered" },
        { label: "Canceled", caption: "Voided", icon: "assignment_return", count: stageCount("canceled"), tone: "rose", tab: "canceled" },
    ];

    const shipmentTiles: Tile[] = [
        { label: "Manifest", caption: "Paperwork", icon: "fact_check", count: shipments.manifest ?? 0, tone: "blue", tab: "pending" },
        { label: "Scheduled", caption: "Booked & picking", icon: "schedule", count: shipments.scheduled ?? 0, tone: "amber", tab: "scheduled" },
        { label: "En Route", caption: "In transit", icon: "local_shipping", count: shipments.en_route ?? 0, tone: "brand", tab: "en_route" },
        { label: "Shipped", caption: "Arrived", icon: "check_circle", count: shipments.shipped ?? 0, tone: "emerald", tab: "shipped" },
        { label: "Overdue", caption: "Action req.", icon: "warning", count: shipments.overdue ?? 0, tone: "rose", alert: true, tab: "overdue" },
    ];

    const orderFooter: Row[] = [
        { label: "Store Orders", caption: "", icon: "receipt_long", route: "seller.carts.index", tone: "ink" },
        { label: "Transfers", caption: "", icon: "rv_hookup", route: null, tone: "ink" },
    ];

    const opsRows: Row[] = [
        {
            label: "Balance",
            caption: "Payouts & ledger",
            icon: "account_balance_wallet",
            route: null,
            tone: "emerald",
            surface: "border-emerald-200/70 bg-gradient-to-br from-[#F0FDF4] to-[#F7FEE7]",
        },
        {
            label: "Calendar",
            caption: "Schedules & shifts",
            icon: "calendar_today",
            route: null,
            tone: "amber",
            surface: "border-amber-200/60 bg-gradient-to-br from-[#FFF6E9] to-[#FFFBF3]",
        },
        {
            label: "Customers",
            caption: "Accounts & directory",
            icon: "group",
            route: "seller.customers.index",
            tone: "blue",
            count: catalogue.customers,
        },
        {
            label: "Documents",
            caption: "Invoices & compliance",
            icon: "description",
            route: null,
            tone: "brand",
            surface: "border-orange-200/70 bg-gradient-to-br from-[#FDF0ED] to-[#FFF8F6]",
        },
        {
            label: "Tasks",
            caption: "Daily checklist & actions",
            icon: "checklist",
            route: null,
            tone: "ink",
        },
    ];

    const catalogueRows: Row[] = [
        {
            label: "Items",
            caption: "Active catalogue",
            icon: "inventory_2",
            route: "seller.items.index",
            tone: "brand",
            count: catalogue.items,
        },
        {
            label: "Categories",
            caption: "Browse by group",
            icon: "category",
            route: "seller.categories.index",
            tone: "blue",
        },
        {
            label: "Carts",
            caption: "Open baskets",
            icon: "shopping_cart",
            route: "seller.carts.index",
            tone: "emerald",
            count: catalogue.carts,
        },
    ];

    const settingsHref = href("seller.settings.index");
    const [notifyOpen, setNotifyOpen] = useState(false);

    return (
        <>
            <Head title="More">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen pb-28" style={{ backgroundColor: PAGE_BG }}>
                {/* ── Identity header ── */}
                <section className="px-4 pb-3 pt-4">
                    <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center space-x-3">
                            <div
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-orange-200 text-white shadow-sm"
                                style={{ backgroundColor: BRAND }}
                            >
                                <span className="material-symbols-outlined text-2xl">warehouse</span>
                            </div>

                            {seller?.name ? (
                                <div className="min-w-0">
                                    <h1
                                        className="truncate text-[17px] font-bold tracking-tight"
                                        style={{ color: INK }}
                                    >
                                        {seller.name}
                                    </h1>
                                    <p className="mt-0.5 truncate text-[11px] text-gray-500">
                                        {seller.store ?? seller.email}
                                    </p>
                                </div>
                            ) : (
                                <Link
                                    href={route("seller.login")}
                                    className="rounded-[999px] px-5 py-2 text-[14px] font-bold text-white active:scale-95"
                                    style={{ backgroundColor: BRAND }}
                                >
                                    Sign in or Register
                                </Link>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center space-x-1">
                            {settingsHref ? (
                                <Link
                                    href={settingsHref}
                                    aria-label="Settings"
                                    className="flex h-9 w-9 items-center justify-center rounded-[999px] text-gray-700 transition-all hover:bg-gray-200/60 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[20px]">settings</span>
                                </Link>
                            ) : null}

                            {/* Notifications. No feed behind it yet, so the button
                                opens an empty-state panel rather than navigating
                                to a route that does not exist. */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setNotifyOpen((open) => !open)}
                                    aria-label="Notifications"
                                    aria-expanded={notifyOpen}
                                    className={`flex h-9 w-9 items-center justify-center rounded-[999px] transition-all active:scale-95 ${
                                        notifyOpen
                                            ? "bg-gray-200/70 text-gray-900"
                                            : "text-gray-700 hover:bg-gray-200/60"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        notifications
                                    </span>
                                </button>

                                {notifyOpen ? (
                                    <>
                                        <button
                                            type="button"
                                            aria-label="Close notifications"
                                            onClick={() => setNotifyOpen(false)}
                                            className="fixed inset-0 z-30 cursor-default"
                                        />
                                        <div className="absolute right-0 z-40 mt-2 w-56 rounded-[12px] border border-gray-100 bg-white p-4 text-center shadow-lg">
                                            <span className="material-symbols-outlined text-[26px] text-slate-300">
                                                notifications_off
                                            </span>
                                            <p className="mt-1 text-[12px] font-bold text-gray-900">
                                                You're all caught up
                                            </p>
                                            <p className="mt-0.5 text-[10px] text-slate-500">
                                                Alerts will appear here once the feed is live.
                                            </p>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </section>

                <PipelineCard
                    title="My Orders"
                    preview
                    actionLabel="Order list"
                    actionRoute="seller.orders.index"
                    tiles={orderTiles}
                    footer={orderFooter}
                />

                <PipelineCard
                    title="Shipments"
                    actionLabel="Console"
                    actionRoute="seller.shipments.index"
                    tiles={shipmentTiles}
                />

                <OpsCard title="Merchant Operations" note="Core Tools" rows={opsRows} />

                <OpsCard title="Catalogue" note="Browse" rows={catalogueRows} />
            </div>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
