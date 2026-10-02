import AdminLayout from "@/Layouts/AppLayout";
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
import React, { useMemo, useState } from "react";

/**
 * Admin inventory operations hub.
 *
 * One overview of everything the inventory domain holds — stores, warehouses,
 * transfers and shipments — built from the same card set as the seller "More"
 * hub (Components/Shared/OpsHub), and ending in an item picker that opens the
 * per-location stock tool at Admin/Inventory/Stores/ItemVariants.
 *
 * Counts come from the database, except the order pipeline: there is no admin
 * order domain yet, so that card reads the shared sample data and carries the
 * Preview chip, exactly as the seller hub's does.
 */

interface StoreSummary {
    id: number;
    name: string;
    type: string;
    location: string | null;
    location_code: string;
    /** Distinct items holding stock here. */
    live_items: number;
    live_variants: number;
    units: number;
    deployed_variants: number;
}

interface WarehouseSummary {
    id: number;
    name: string;
}

interface StockAtStore {
    id: number;
    name: string;
    /** `retail`, `central_warehouse` or `remote_warehouse`. */
    type: string;
    variants: number;
    stock: number;
}

interface DeployedItem {
    id: number;
    name: string;
    variants: number;
    store_stock: number;
    warehouse_stock: number;
    stores: StockAtStore[];
    warehouses: Array<{ id: number; name: string; stock: number }>;
}

interface Props {
    stores: StoreSummary[];
    warehouses: WarehouseSummary[];
    shipmentCounts: Record<string, number>;
    transferCounts: Record<string, number>;
    catalogue: { items: number; deployed_variants: number };
    deployedItems: DeployedItem[];
}

/** Store `type` values, as written by StoreSeeder / FacilitySeeder. */
const STORE_TYPE_LABEL: Record<string, string> = {
    retail: "Retail store",
    central_warehouse: "Central warehouse",
    remote_warehouse: "Remote warehouse",
};

const STORE_TYPE_ICON: Record<string, string> = {
    retail: "storefront",
    central_warehouse: "warehouse",
    remote_warehouse: "cloud_queue",
};

/** How many item cards the picker paints before deferring to search. */
const ITEM_PICKER_LIMIT = 24;

export default function InventoryHub({
    stores,
    warehouses,
    shipmentCounts,
    transferCounts,
    catalogue,
    deployedItems,
}: Props): React.ReactElement {
    const [itemSearch, setItemSearch] = useState("");

    const retail = stores.filter((store) => store.type === "retail");
    const facilities = stores.filter((store) => store.type !== "retail");

    /* ── Orders: sample data, as on the seller hub ───────────────────── */
    const stageCount = (stage: string): number =>
        SAMPLE_ORDERS.filter((entry) => entry.stage === stage).length;

    const orderTiles: Tile[] = [
        { label: "To Pay", caption: "Awaiting payment", icon: "payments", count: stageCount("to_pay"), tone: "amber" },
        { label: "Paid", caption: "Payment confirmed", icon: "verified", count: stageCount("paid"), tone: "violet" },
        { label: "Pick & Pack", caption: "Being packed", icon: "inventory_2", count: stageCount("packing"), tone: "blue" },
        { label: "To Deliver", caption: "Ready to ship", icon: "local_shipping", count: stageCount("to_deliver"), tone: "brand" },
        { label: "Delivered", caption: "Completed", icon: "task_alt", count: stageCount("delivered"), tone: "emerald" },
        { label: "Canceled", caption: "Voided", icon: "assignment_return", count: stageCount("canceled"), tone: "rose" },
    ];

    const orderFooter: Row[] = [
        { label: "Store Orders", caption: "", icon: "receipt_long", route: "admin.carts.index", tone: "ink" },
        { label: "Transfers", caption: "", icon: "rv_hookup", route: "admin.inventory.transfers", tone: "ink" },
    ];

    /* ── Shipments: every tile opens the filter it counts ─────────────── */
    const shipmentTiles: Tile[] = [
        { label: "Manifest", caption: "Awaiting agreement", icon: "fact_check", count: shipmentCounts.pending_agreement ?? 0, tone: "blue", tab: "status=pending_agreement" },
        { label: "Scheduled", caption: "Booked & picking", icon: "schedule", count: shipmentCounts.scheduled ?? 0, tone: "amber", tab: "status=scheduled" },
        { label: "En Route", caption: "In transit", icon: "local_shipping", count: shipmentCounts.in_transit ?? 0, tone: "brand", tab: "status=in_transit" },
        { label: "Shipped", caption: "Arrived", icon: "check_circle", count: shipmentCounts.delivered ?? 0, tone: "emerald", tab: "status=delivered" },
        // Past ETA and still moving. No single status matches it, so the tile
        // opens the open-runs board rather than a filter that would show a
        // different number than the badge.
        { label: "Overdue", caption: "Past ETA", icon: "warning", count: shipmentCounts.overdue ?? 0, tone: "rose", alert: true, tab: "status=open" },
    ];

    /* ── Transfers ─────────────────────────────────────────────────────── */
    const transferTiles: Tile[] = [
        { label: "Pending", caption: "Awaiting pick", icon: "pending_actions", count: transferCounts.pending ?? 0, tone: "amber" },
        { label: "In Transit", caption: "On the move", icon: "swap_horiz", count: transferCounts.in_transit ?? 0, tone: "brand" },
        { label: "Completed", caption: "Stock moved", icon: "task_alt", count: transferCounts.completed ?? 0, tone: "emerald" },
        { label: "Cancelled", caption: "Voided", icon: "block", count: transferCounts.cancelled ?? 0, tone: "rose" },
        { label: "Replenish", caption: "Restock runs", icon: "autorenew", count: 0, tone: "violet", routeName: "admin.inventory.replenish" },
    ];

    /* ── Locations ─────────────────────────────────────────────────────── */
    /*
     * The trailing figure is the deployed-variant count, not `items_count`.
     * The item_store pivot attaches all 182 catalogue items to every store, so
     * showing that number put "182" beside a store reading "0 variants" — the
     * pivot says the store may carry the item, store_variants says whether it
     * actually does.
     */
    /** "182 items live · 1,628 variants · 45,076 pcs" — items lead. */
    const liveCaption = (store: StoreSummary): string => {
        if (store.live_items === 0) {
            return `Nothing in stock · ${store.location ?? store.location_code}`;
        }

        return [
            `${store.live_items} item${store.live_items === 1 ? "" : "s"} live`,
            `${store.live_variants.toLocaleString()} variants`,
            `${store.units.toLocaleString()} pcs`,
        ].join(" · ");
    };

    const storeRows: Row[] = retail.map((store) => ({
        label: store.name,
        caption: liveCaption(store),
        icon: STORE_TYPE_ICON[store.type] ?? "storefront",
        route: "store.show",
        routeParams: { store: store.id },
        tone: "brand",
        // The trailing figure counts live items, not variants.
        count: store.live_items,
    }));

    const facilityRows: Row[] = [
        ...facilities.map((store) => ({
            label: store.name,
            caption: `${STORE_TYPE_LABEL[store.type] ?? store.type} · ${liveCaption(store)}`,
            icon: STORE_TYPE_ICON[store.type] ?? "warehouse",
            route: "store.show",
            routeParams: { store: store.id },
            tone: "blue" as const,
            count: store.live_items,
        })),
        ...warehouses.map((warehouse) => ({
            label: warehouse.name,
            caption: "Warehouse ledger & bins",
            icon: "inventory",
            route: "admin.inventory.warehouse.show",
            routeParams: { warehouse: warehouse.id },
            tone: "violet" as const,
        })),
    ];

    /* ── Item picker ───────────────────────────────────────────────────── */
    const visibleItems = useMemo(() => {
        const needle = itemSearch.trim().toLowerCase();

        if (!needle) return deployedItems;

        return deployedItems.filter(
            (item) =>
                item.name.toLowerCase().includes(needle) ||
                item.stores.some((store) => store.name.toLowerCase().includes(needle)),
        );
    }, [deployedItems, itemSearch]);

    /*
     * Rendering every deployed item would mean ~180 cards, each with a chip
     * per location it holds stock at, on first paint. The list is capped and
     * the search box is how you reach the rest — the footer below says so
     * whenever something is being held back.
     */
    const shown = useMemo(
        () => visibleItems.slice(0, ITEM_PICKER_LIMIT),
        [visibleItems],
    );

    return (
        <>
            <Head title="Inventory">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
                <div className="mx-auto w-full max-w-[1100px] px-3.5 pb-12">
                    {/* ── Identity header ── */}
                    <section className="pb-3 pt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center space-x-3">
                                <div
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-orange-200 text-white shadow-sm"
                                    style={{ backgroundColor: BRAND }}
                                >
                                    <span className="material-symbols-outlined text-2xl">warehouse</span>
                                </div>
                                <div className="min-w-0">
                                    <h1
                                        className="truncate text-[17px] font-bold tracking-tight"
                                        style={{ color: INK }}
                                    >
                                        Inventory
                                    </h1>
                                    <p className="mt-0.5 truncate text-[11px] text-gray-500">
                                        {retail.length} store{retail.length === 1 ? "" : "s"} ·{" "}
                                        {facilities.length + warehouses.length} facilit
                                        {facilities.length + warehouses.length === 1 ? "y" : "ies"} ·{" "}
                                        {catalogue.deployed_variants} deployed variants
                                    </p>
                                </div>
                            </div>

                            <Link
                                href={route("admin.inventory.stores")}
                                className="flex shrink-0 items-center gap-1 rounded-[999px] border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 transition-colors hover:bg-gray-50"
                            >
                                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                                All stock
                            </Link>
                        </div>
                    </section>

                    <PipelineCard
                        title="My Orders"
                        preview
                        actionLabel="Order list"
                        actionRoute="admin.carts.index"
                        tiles={orderTiles}
                        footer={orderFooter}
                    />

                    <PipelineCard
                        title="Shipments"
                        actionLabel="Console"
                        actionRoute="admin.inventory.shipments.index"
                        tiles={shipmentTiles}
                    />

                    <PipelineCard
                        title="Transfers"
                        actionLabel="Ledger"
                        actionRoute="admin.inventory.transfers"
                        tiles={transferTiles}
                    />

                    <OpsCard title="Stores" note="Retail" rows={storeRows} wide />

                    <OpsCard title="Warehouses & Hubs" note="Facilities" rows={facilityRows} wide />

                    {/* ── Item picker → per-location stock tool ── */}
                    <section className="mb-3">
                        <div className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h3
                                    className="text-xs font-bold uppercase tracking-wider"
                                    style={{ color: INK }}
                                >
                                    Stock by item
                                </h3>
                                <span className="font-mono text-[10px] text-gray-400">
                                    {deployedItems.length} of {catalogue.items} deployed
                                </span>
                            </div>

                            <p className="mb-2.5 text-[11px] text-gray-500">
                                Pick an item, then a store, to open the per-location stock tool —
                                shelf, store room, remote hub and warehouses, tap to filter or combine.
                            </p>

                            <label className="mb-3 flex items-center gap-2 rounded-[10px] border border-gray-200 bg-gray-50 px-2.5 py-1.5 focus-within:border-[#c2410c] focus-within:bg-white">
                                <span className="material-symbols-outlined text-[18px] text-gray-400">
                                    search
                                </span>
                                <input
                                    type="search"
                                    value={itemSearch}
                                    onChange={(event) => setItemSearch(event.target.value)}
                                    placeholder="Item or store name…"
                                    aria-label="Search deployed items"
                                    className="w-full border-0 bg-transparent p-0 text-[12px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                                />
                            </label>

                            <div className="grid grid-cols-1 gap-2">
                                {shown.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-[12px] border border-gray-200 bg-white px-3 py-2.5"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h4 className="truncate text-xs font-bold text-gray-900">
                                                    {item.name}
                                                </h4>
                                                <p className="mt-0.5 text-[10px] text-gray-500">
                                                    {item.variants} variant
                                                    {item.variants === 1 ? "" : "s"} ·{" "}
                                                    <span className="font-semibold text-gray-700">
                                                        {item.store_stock.toLocaleString()}
                                                    </span>{" "}
                                                    pcs in stores
                                                    {item.warehouse_stock > 0 ? (
                                                        <>
                                                            {" · "}
                                                            <span className="font-semibold text-gray-700">
                                                                {item.warehouse_stock.toLocaleString()}
                                                            </span>{" "}
                                                            in warehouses
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>
                                            <span className="shrink-0 rounded-[999px] bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-500">
                                                #{item.id}
                                            </span>
                                        </div>

                                        {/* The variant tool is store-scoped, so the row
                                            offers each location holding stock rather
                                            than picking one on the admin's behalf. */}
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {item.stores.map((store) => {
                                                const target = href("store.item.variants", {
                                                    store: store.id,
                                                    item: item.id,
                                                });

                                                if (!target) return null;

                                                const isFacility = store.type !== "retail";

                                                return (
                                                    <Link
                                                        key={store.id}
                                                        href={target}
                                                        className={`group flex items-center gap-1 rounded-[999px] border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                                            isFacility
                                                                ? "border-blue-200 bg-blue-50/70 text-blue-700 hover:border-blue-500 hover:bg-blue-50"
                                                                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#c2410c] hover:bg-orange-50 hover:text-[#c2410c]"
                                                        }`}
                                                        title={`${store.name} — ${store.stock.toLocaleString()} pcs across ${store.variants} variant${store.variants === 1 ? "" : "s"}`}
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">
                                                            {STORE_TYPE_ICON[store.type] ?? "storefront"}
                                                        </span>
                                                        {store.name}
                                                        <span className="font-mono font-medium opacity-60">
                                                            {store.stock.toLocaleString()}
                                                        </span>
                                                        <span className="material-symbols-outlined text-[13px]">
                                                            chevron_right
                                                        </span>
                                                    </Link>
                                                );
                                            })}

                                            {/* Warehouses are a separate table from the
                                                warehouse-typed stores above, and have no
                                                per-item variant screen, so they report
                                                rather than link. */}
                                            {item.warehouses.map((warehouse) => (
                                                <span
                                                    key={`wh-${warehouse.id}`}
                                                    className="flex items-center gap-1 rounded-[999px] border border-violet-200 bg-violet-50/70 px-2.5 py-1 text-[10px] font-bold text-violet-700"
                                                    title={`${warehouse.name} — ${warehouse.stock.toLocaleString()} pcs`}
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">
                                                        inventory
                                                    </span>
                                                    {warehouse.name}
                                                    <span className="font-mono font-medium opacity-60">
                                                        {warehouse.stock.toLocaleString()}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {visibleItems.length > shown.length ? (
                                    <p className="py-2 text-center text-[11px] text-slate-500">
                                        Showing {shown.length} of {visibleItems.length}. Search to
                                        narrow it down.
                                    </p>
                                ) : null}

                                {visibleItems.length === 0 ? (
                                    <div className="flex flex-col items-center px-6 py-10 text-center">
                                        <span className="material-symbols-outlined text-[32px] text-slate-300">
                                            inventory_2
                                        </span>
                                        <p className="mt-2 text-[13px] font-bold text-gray-900">
                                            {itemSearch
                                                ? "No matching items"
                                                : "Nothing is holding stock yet"}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            {itemSearch
                                                ? "Try a different item or store name."
                                                : "Receive stock into a store or warehouse to see it here."}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}

InventoryHub.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
