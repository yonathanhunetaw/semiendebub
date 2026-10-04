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
import type { OrderStage } from "@/Data/sellerOrderFlow";
import type { LocationTile } from "@/types/sellerLocations";
import { Head, Link } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Seller "More" hub — the seller console.
 *
 * A stack of white cards on a near-white page: My Orders, Shipments and
 * Storage & Inventory Locations as counter grids, then Merchant Operations.
 * The card set lives in Components/Shared/OpsHub so the admin inventory hub
 * renders the same UI rather than a second copy of it.
 *
 * Tiles not backed by data yet (Returns, bulk waybills, proof of delivery,
 * vehicle assignment) are shown read-only so the layout is final; they say
 * so instead of showing a number.
 */

interface ShipmentStats {
    manifest?: number;
    scheduled?: number;
    en_route?: number;
    shipped?: number;
    overdue?: number;
}

interface Props {
    /** Store Shelf, Store, Remote Hub, Main Hub A and B, nearest first. */
    locations?: LocationTile[];
    stats?: {
        /** Real order counts per stage, from SellerOrderBoard. */
        order_stages?: Partial<Record<OrderStage, number>>;
        shipments?: ShipmentStats;
        catalogue?: { customers?: number; items?: number; carts?: number };
        /** Live order counters. Unlike the pipeline tiles these are server-side. */
        orders?: { awaiting_sourcing?: number };
    };
    seller?: { name: string | null; email: string | null; store: string | null };
}

/** 1,180 → "1.2k", 24,310 → "24k": the badge has room for four characters. */
function compact(value: number): string {
    if (value < 1000) return String(value);
    if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export default function Index({ locations = [], stats, seller }: Props): React.ReactElement {
    const shipments = stats?.shipments ?? {};
    const catalogue = stats?.catalogue ?? {};
    /** Real count: paid orders whose lines still have to be sourced. */
    const ordersAwaitingSourcing = stats?.orders?.awaiting_sourcing ?? 0;

    /* Same stage mapping the order list uses, so a badge matches its tab. */
    const stageCount = (stage: OrderStage) => stats?.order_stages?.[stage] ?? 0;

    const orderTiles: Tile[] = [
        { label: "To Pay", caption: "Allocated / Unpaid", icon: "payments", count: stageCount("to_pay"), tone: "amber", tab: "tab=to_pay" },
        { label: "Paid", caption: "Payment Confirmed", icon: "verified", count: stageCount("paid"), tone: "blue", tab: "tab=paid" },
        { label: "Pick & Pack", caption: "In Progress / Picking", icon: "inventory_2", count: stageCount("packing"), tone: "blue", tab: "tab=packing" },
        { label: "To Deliver", caption: "Ready to Ship", icon: "local_shipping", count: stageCount("to_deliver"), tone: "brand", tab: "tab=to_deliver" },
        { label: "Delivered", caption: "Completed", icon: "task_alt", count: stageCount("delivered"), tone: "emerald", tab: "tab=delivered" },
        { label: "Returns", caption: "Reverse Ops · soon", icon: "assignment_return", count: 0, tone: "rose", disabled: true },
        { label: "Canceled", caption: "Voided / Closed", icon: "cancel", count: stageCount("canceled"), tone: "ink", tab: "tab=canceled" },
    ];

    /*
     * The live Pick & Pack queue is where batch work happens: a paid order's
     * lines are sourced from a real shelf, floor or hub there. Batch waybills
     * and manifests across several orders are shown but not built yet.
     */
    const orderFooter: Row[] = [
        { label: "Store Orders", caption: "", icon: "receipt_long", route: "seller.carts.index", tone: "ink" },
        { label: "Transfers", caption: "", icon: "rv_hookup", route: null, tone: "ink" },
        {
            label: ordersAwaitingSourcing > 0 ? `Pick & Pack queue (${ordersAwaitingSourcing})` : "Pick & Pack queue",
            caption: "",
            icon: "where_to_vote",
            route: "seller.orders.queue",
            tone: "ink",
        },
        { label: "Bulk waybills", caption: "", icon: "library_add_check", route: null, tone: "ink" },
    ];

    const shipmentTiles: Tile[] = [
        { label: "Scheduled", caption: "Booked Slot", icon: "schedule", count: shipments.scheduled ?? 0, tone: "amber", tab: "tab=scheduled" },
        { label: "Pending Manifest", caption: "Paperwork", icon: "fact_check", count: shipments.manifest ?? 0, tone: "blue", tab: "tab=pending" },
        { label: "En Route", caption: "In Transit", icon: "local_shipping", count: shipments.en_route ?? 0, tone: "brand", tab: "tab=en_route" },
        { label: "Shipped", caption: "Delivered Hub", icon: "check_circle", count: shipments.shipped ?? 0, tone: "emerald", tab: "tab=shipped" },
        { label: "Overdue", caption: "Action Req.", icon: "warning", count: shipments.overdue ?? 0, tone: "rose", alert: true, tab: "tab=overdue" },
    ];

    /* Courier hand-off signals for congested routes. Read-only until shipments
       record attempts, signatures and the assigned vehicle. */
    const shipmentFooter: Row[] = [
        { label: "Proof of delivery", caption: "", icon: "signature", route: null, tone: "ink" },
        { label: "Vehicle / dispatcher", caption: "", icon: "two_wheeler", route: null, tone: "ink" },
    ];

    const LOCATION_TONES: Record<string, Tile["tone"]> = {
        shelf: "emerald",
        store: "blue",
        remote_hub: "brand",
        hub_A: "ink",
        hub_B: "amber",
    };

    const locationTiles: Tile[] = locations.map((tile) => ({
        label: tile.label,
        caption: tile.alert > 0 ? `${tile.alert} to refill` : tile.caption,
        icon: tile.key === "hub_B" ? "domain" : tile.icon,
        count: tile.pieces,
        badge: tile.location_id && tile.pieces > 0 ? compact(tile.pieces) : undefined,
        tone: LOCATION_TONES[tile.key] ?? "ink",
        alert: tile.alert > 0,
        disabled: !tile.location_id,
        routeName: "seller.locations.show",
        routeParams: tile.location_id ? { location: tile.location_id } : undefined,
    }));

    const shelf = locations.find((tile) => tile.key === "shelf");

    const locationFooter: Row[] = [
        {
            label: "Shelf Bin Matrix",
            caption: "",
            icon: "grid_view",
            route: shelf?.location_id ? "seller.locations.show" : null,
            routeParams: shelf?.location_id ? { location: shelf.location_id } : undefined,
            tone: "ink",
        },
        // Remote Hub and shipment refills the store floor could not cover,
        // waiting for the store manager.
        { label: "Refill requests", caption: "", icon: "playlist_add_check", route: "seller.refills.index", tone: "ink" },
        { label: "Multi-Tier Directory", caption: "", icon: "account_tree", route: null, tone: "ink" },
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
            caption: catalogue.customers ? `${catalogue.customers} Accounts & directory` : "Accounts & directory",
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

    const settingsHref = href("seller.settings.index");
    const [notifyOpen, setNotifyOpen] = useState(false);

    return (
        <>
            <Head title="More" />

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
                    actionLabel="Pipeline map"
                    actionRoute="seller.orders.index"
                    tiles={orderTiles}
                    columns={4}
                    footer={orderFooter}
                />

                <PipelineCard
                    title="Shipments"
                    actionLabel="Console"
                    actionRoute="seller.shipments.index"
                    tiles={shipmentTiles}
                    footer={shipmentFooter}
                />

                <PipelineCard
                    title="Storage & Inventory Locations"
                    actionLabel="View all"
                    actionRoute={null}
                    tiles={locationTiles}
                    footer={locationFooter}
                />

                <OpsCard title="Merchant Operations" note="Core Tools" rows={opsRows} />
                </div>
            </div>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
