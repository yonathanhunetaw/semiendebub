import SellerLayout from "@/Layouts/SellerLayout";
import {
    HUB_BRAND as BRAND,
    HUB_INK as INK,
    HUB_PAGE_BG as PAGE_BG,
    OpsCard,
    PipelineCard,
    type Row,
    type Tile,
    href,
} from "@/Components/Shared/OpsHub";
import { SAMPLE_ORDERS } from "@/Data/sellerOrderFlow";
import { Head, Link } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Seller "More" hub.
 *
 * A stack of white cards on a near-white page: two pipeline cards (orders,
 * shipments) with counter grids, then the operations rows. The card set itself
 * lives in Components/Shared/OpsHub so the admin inventory hub renders the
 * same UI rather than a second copy of it.
 */

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
        { label: "To Pay", caption: "Awaiting payment", icon: "payments", count: stageCount("to_pay"), tone: "amber", tab: "tab=to_pay" },
        { label: "Paid", caption: "Payment confirmed", icon: "verified", count: stageCount("paid"), tone: "violet", tab: "tab=paid" },
        { label: "Pick & Pack", caption: "Being packed", icon: "inventory_2", count: stageCount("packing"), tone: "blue", tab: "tab=packing" },
        { label: "To Deliver", caption: "Ready to ship", icon: "local_shipping", count: stageCount("to_deliver"), tone: "brand", tab: "tab=to_deliver" },
        { label: "Delivered", caption: "Completed", icon: "task_alt", count: stageCount("delivered"), tone: "emerald", tab: "tab=delivered" },
        { label: "Canceled", caption: "Voided", icon: "assignment_return", count: stageCount("canceled"), tone: "rose", tab: "tab=canceled" },
    ];

    const shipmentTiles: Tile[] = [
        { label: "Manifest", caption: "Paperwork", icon: "fact_check", count: shipments.manifest ?? 0, tone: "blue", tab: "tab=pending" },
        { label: "Scheduled", caption: "Booked & picking", icon: "schedule", count: shipments.scheduled ?? 0, tone: "amber", tab: "tab=scheduled" },
        { label: "En Route", caption: "In transit", icon: "local_shipping", count: shipments.en_route ?? 0, tone: "brand", tab: "tab=en_route" },
        { label: "Shipped", caption: "Arrived", icon: "check_circle", count: shipments.shipped ?? 0, tone: "emerald", tab: "tab=shipped" },
        { label: "Overdue", caption: "Action req.", icon: "warning", count: shipments.overdue ?? 0, tone: "rose", alert: true, tab: "tab=overdue" },
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

                <div className="px-3.5">
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
            </div>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
