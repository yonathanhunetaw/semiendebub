import SellerLayout from "@/Layouts/SellerLayout";
import {
    OpsCard,
    PipelineCard,
    type Row,
    type Tile,
    href,
} from "@/Components/Shared/OpsHub";
import {
    EmptyState,
    HeaderIconButton,
    PageHeader,
    headerIconButtonClass,
} from "@/Components/Shared/ui";
import type { OrderStage } from "@/Data/sellerOrderFlow";
import type { LocationTile } from "@/types/sellerLocations";
import { Head, Link } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Seller "More" hub — the seller console.
 *
 * A stack of surface cards on the page background: My Orders, Shipments and
 * Storage & Inventory Locations as counter grids, then Merchant Operations.
 * The card set lives in Components/Shared/OpsHub (built from the shared
 * components in Components/Shared/ui) so the admin inventory hub renders the
 * same UI rather than a second copy of it.
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
        { label: "To Pay", caption: "Allocated / Unpaid", icon: "payments", count: stageCount("to_pay"), tone: "warning", tab: "tab=to_pay" },
        { label: "Paid", caption: "Payment Confirmed", icon: "verified", count: stageCount("paid"), tone: "info", tab: "tab=paid" },
        { label: "Pick & Pack", caption: "In Progress / Picking", icon: "inventory_2", count: stageCount("packing"), tone: "info", tab: "tab=packing" },
        { label: "To Deliver", caption: "Ready to Ship", icon: "local_shipping", count: stageCount("to_deliver"), tone: "primary", tab: "tab=to_deliver" },
        { label: "Delivered", caption: "Completed", icon: "task_alt", count: stageCount("delivered"), tone: "success", tab: "tab=delivered" },
        { label: "Returns", caption: "Reverse Ops · soon", icon: "assignment_return", count: 0, tone: "error", disabled: true },
        { label: "Canceled", caption: "Voided / Closed", icon: "cancel", count: stageCount("canceled"), tone: "neutral", tab: "tab=canceled" },
    ];

    /*
     * The live Pick & Pack queue is where batch work happens: a paid order's
     * lines are sourced from a real shelf, floor or hub there. Batch waybills
     * and manifests across several orders are shown but not built yet.
     */
    const orderFooter: Row[] = [
        { label: "Store Orders", caption: "", icon: "receipt_long", route: "seller.carts.index", tone: "neutral" },
        { label: "Transfers", caption: "", icon: "rv_hookup", route: null, tone: "neutral" },
        {
            label: ordersAwaitingSourcing > 0 ? `Pick & Pack queue (${ordersAwaitingSourcing})` : "Pick & Pack queue",
            caption: "",
            icon: "where_to_vote",
            route: "seller.orders.queue",
            tone: "neutral",
        },
        { label: "Bulk waybills", caption: "", icon: "library_add_check", route: null, tone: "neutral" },
    ];

    const shipmentTiles: Tile[] = [
        { label: "Scheduled", caption: "Booked Slot", icon: "schedule", count: shipments.scheduled ?? 0, tone: "warning", tab: "tab=scheduled" },
        { label: "Pending Manifest", caption: "Paperwork", icon: "fact_check", count: shipments.manifest ?? 0, tone: "info", tab: "tab=pending" },
        { label: "En Route", caption: "In Transit", icon: "local_shipping", count: shipments.en_route ?? 0, tone: "primary", tab: "tab=en_route" },
        { label: "Shipped", caption: "Delivered Hub", icon: "check_circle", count: shipments.shipped ?? 0, tone: "success", tab: "tab=shipped" },
        { label: "Overdue", caption: "Action Req.", icon: "warning", count: shipments.overdue ?? 0, tone: "error", alert: true, tab: "tab=overdue" },
    ];

    /* Courier hand-off signals for congested routes. Read-only until shipments
       record attempts, signatures and the assigned vehicle. */
    const shipmentFooter: Row[] = [
        { label: "Proof of delivery", caption: "", icon: "signature", route: null, tone: "neutral" },
        { label: "Vehicle / dispatcher", caption: "", icon: "two_wheeler", route: null, tone: "neutral" },
    ];

    const LOCATION_TONES: Record<string, Tile["tone"]> = {
        shelf: "success",
        store: "info",
        remote_hub: "primary",
        hub_A: "neutral",
        hub_B: "warning",
    };

    const locationTiles: Tile[] = locations.map((tile) => ({
        label: tile.label,
        caption: tile.alert > 0 ? `${tile.alert} to refill` : tile.caption,
        icon: tile.key === "hub_B" ? "domain" : tile.icon,
        count: tile.pieces,
        badge: tile.location_id && tile.pieces > 0 ? compact(tile.pieces) : undefined,
        tone: LOCATION_TONES[tile.key] ?? "neutral",
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
            tone: "neutral",
        },
        // Remote Hub and shipment refills the store floor could not cover,
        // waiting for the store manager.
        { label: "Refill requests", caption: "", icon: "playlist_add_check", route: "seller.refills.index", tone: "neutral" },
        { label: "Multi-Tier Directory", caption: "", icon: "account_tree", route: null, tone: "neutral" },
    ];

    const opsRows: Row[] = [
        {
            label: "Balance",
            caption: "Payouts & ledger",
            icon: "account_balance_wallet",
            route: null,
            tone: "success",
            surface: "border-success/30 bg-gradient-to-br from-success-container/60 to-surface-container-lowest",
        },
        {
            label: "Calendar",
            caption: "Schedules & shifts",
            icon: "calendar_today",
            route: null,
            tone: "warning",
            surface: "border-warning/30 bg-gradient-to-br from-warning-container/60 to-surface-container-lowest",
        },
        {
            label: "Customers",
            caption: catalogue.customers ? `${catalogue.customers} Accounts & directory` : "Accounts & directory",
            icon: "group",
            route: "seller.customers.index",
            tone: "info",
            count: catalogue.customers,
        },
        {
            label: "Documents",
            caption: "Invoices & compliance",
            icon: "description",
            route: null,
            tone: "primary",
            surface: "border-primary/30 bg-gradient-to-br from-primary-container/60 to-surface-container-lowest",
        },
        {
            label: "Tasks",
            caption: "Daily checklist & actions",
            icon: "checklist",
            route: null,
            tone: "neutral",
        },
    ];

    const settingsHref = href("seller.settings.index");
    const [notifyOpen, setNotifyOpen] = useState(false);

    return (
        <>
            <Head title="More" />

            <div className="min-h-screen bg-background pb-28">
                {/* ── Identity header ── */}
                <PageHeader
                    icon="warehouse"
                    title={seller?.name}
                    subtitle={seller?.store ?? seller?.email ?? ""}
                    actions={
                        <>
                            {settingsHref ? (
                                <Link href={settingsHref} aria-label="Settings" className={headerIconButtonClass}>
                                    <span className="material-symbols-outlined text-[20px]">settings</span>
                                </Link>
                            ) : null}

                            {/* Notifications. No feed behind it yet, so the button
                                opens an empty-state panel rather than navigating
                                to a route that does not exist. */}
                            <div className="relative">
                                <HeaderIconButton
                                    icon="notifications"
                                    onClick={() => setNotifyOpen((open) => !open)}
                                    aria-label="Notifications"
                                    aria-expanded={notifyOpen}
                                    active={notifyOpen}
                                />

                                {notifyOpen ? (
                                    <>
                                        <button
                                            type="button"
                                            aria-label="Close notifications"
                                            onClick={() => setNotifyOpen(false)}
                                            className="fixed inset-0 z-30 cursor-default"
                                        />
                                        <div className="absolute right-0 z-40 mt-2 w-56 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-4 shadow-lg">
                                            <EmptyState
                                                icon="notifications_off"
                                                title="You're all caught up"
                                                description="Alerts will appear here once the feed is live."
                                            />
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </>
                    }
                >
                    {seller?.name ? undefined : (
                        <Link
                            href={route("seller.login")}
                            className="rounded-[999px] bg-primary px-5 py-2 text-[14px] font-bold text-on-primary active:scale-95"
                        >
                            Sign in or Register
                        </Link>
                    )}
                </PageHeader>

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
