import AdminLayout from "@/Layouts/AdminLayout";
import StoreBanner, { type BannerFigureData } from "@/Components/Admin/StoreBanner";
import { OpsCard, type Row, href } from "@/Components/Shared/OpsHub";
import { Card } from "@/Components/Shared/ui";
import { Head, Link } from "@inertiajs/react";
import { useAdminScope } from "@/Components/Navigation/Admin/useAdminScope";
import React, { useMemo, useState } from "react";

/**
 * The Store page on "All stores": laid out like one store's page
 * (Admin/Stores/Hub, same banner and cards) across every store in scope, with
 * the stores and facilities to open, and ending in an item picker that opens
 * the per-location stock tool at Admin/Inventory/Stores/ItemVariants.
 * Orders live under Orders in the sidebar, not here.
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
    /**
     * Raw ledger sum, in mixed packaging units — 11 cartons plus 6 pieces is
     * 17 here, which is why `pieces` exists. Audit only.
     */
    stock: number;
    /** The comparable total: every unit converted to pieces. */
    pieces?: number;
}

interface DeployedItem {
    id: number;
    name: string;
    variants: number;
    store_stock: number;
    warehouse_stock: number;
    store_pieces?: number;
    warehouse_pieces?: number;
    stores: StockAtStore[];
    warehouses: Array<{ id: number; name: string; stock: number; pieces?: number }>;
}

interface Props {
    stores: StoreSummary[];
    warehouses: WarehouseSummary[];
    shipmentCounts: Record<string, number>;
    transferCounts: Record<string, number>;
    catalogue: { items: number; deployed_variants: number };
    deployedItems: DeployedItem[];
    /** Distinct items deployed at the stores in scope. */
    itemsCarried?: number;
    counts?: {
        /** Refills the planner proposes, waiting for a ruling. */
        refills?: number;
        /** Stocktakes submitted, waiting for someone else to approve. */
        counts?: number;
    };
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
    itemsCarried = 0,
    counts,
}: Props): React.ReactElement {
    const { isGlobalAdmin } = useAdminScope();
    const [itemSearch, setItemSearch] = useState("");

    const retail = stores.filter((store) => store.type === "retail");
    const facilities = stores.filter((store) => store.type !== "retail");
    const refills = counts?.refills ?? 0;
    const takes = counts?.counts ?? 0;
    // The all-stock list is a global admin's; a store admin would get a 403.
    const allStock = isGlobalAdmin ? "admin.inventory.stores" : null;

    /* ── The banner: the same four figures as one store's page ─────────── */
    const figures: BannerFigureData[] = [
        { label: "Items carried", value: itemsCarried, icon: "inventory_2", route: allStock },
        { label: "Shipments moving", value: shipmentCounts.open ?? 0, icon: "local_shipping", route: "admin.inventory.shipments.index" },
        { label: "Transfers under way", value: (transferCounts.pending ?? 0) + (transferCounts.in_transit ?? 0), icon: "swap_horiz", route: "admin.inventory.transfers" },
        { label: "Waiting for you", value: refills + takes, icon: "pending_actions", route: "admin.inventory.replenishment.index", alert: true },
    ];

    /* ── Locations ─────────────────────────────────────────────────────── */
    /*
     * The trailing figure is the live-item count, not `items_count`.
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
        tone: "primary",
        count: store.live_items,
    }));

    const facilityRows: Row[] = [
        ...facilities.map((store) => ({
            label: store.name,
            caption: `${STORE_TYPE_LABEL[store.type] ?? store.type} · ${liveCaption(store)}`,
            icon: STORE_TYPE_ICON[store.type] ?? "warehouse",
            route: "store.show",
            routeParams: { store: store.id },
            tone: "info" as const,
            count: store.live_items,
        })),
        ...warehouses.map((warehouse) => ({
            label: warehouse.name,
            caption: "Warehouse ledger & bins",
            icon: "inventory",
            route: "admin.inventory.warehouse.show",
            routeParams: { warehouse: warehouse.id },
            tone: "tertiary" as const,
        })),
    ];

    /* ── The same groups as one store's page; the per-store screens are behind each store ── */
    const stock: Row[] = [
        ...(allStock ? [{ label: "All stock", caption: "Every store's items and deployed variants", icon: "grid_view", route: allStock, tone: "primary" as const }] : []),
        { label: "Capacity", caption: "Min and max levels for every variant", icon: "tune", route: "admin.inventory.capacity.index", tone: "success" },
    ];

    const movement: Row[] = [
        { label: "Transfers", caption: "One item between two places", icon: "swap_horiz", route: "admin.inventory.transfers", tone: "primary" },
        { label: "Shipments", caption: "Hub runs: pick, send, receive", icon: "local_shipping", route: "admin.inventory.shipments.index", tone: "info" },
    ];

    const approvals: Row[] = [
        { label: "Refills", caption: "Proposed moves waiting for a ruling", icon: "rule", route: "admin.inventory.replenishment.index", tone: refills > 0 ? "warning" : "success", count: refills },
        { label: "Stock counts", caption: "Submitted counts to approve", icon: "fact_check", route: "admin.inventory.counts.index", tone: takes > 0 ? "warning" : "success", count: takes },
    ];

    const setup: Row[] = [
        { label: "Locations", caption: "Shelf, floor and Remote Hub, and who manages each", icon: "account_tree", route: "admin.inventory.stock-locations.index", tone: "primary" },
        { label: "Payment accounts", caption: "Where customers pay in, and who confirms each", icon: "account_balance", route: "admin.payment-accounts.index", tone: "info" },
        { label: "Seller balances", caption: "What each seller holds and has handed over", icon: "account_balance_wallet", route: "admin.balances.index", tone: "success" },
        { label: "Customer prices & discounts", caption: "Per-customer prices and when discounts end", icon: "sell", route: "admin.customers.discounts", tone: "warning" },
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

    const facilityCount = facilities.length + warehouses.length;

    return (
        <>
            <Head title="All stores" />

            <div className="mx-auto w-full max-w-[1100px] pb-12">
                <StoreBanner
                    eyebrow="Every store"
                    title="All stores"
                    subtitle={`${retail.length} store${retail.length === 1 ? "" : "s"} · ${facilityCount} facilit${facilityCount === 1 ? "y" : "ies"} · ${catalogue.deployed_variants.toLocaleString()} deployed variants`}
                    figures={figures}
                />

                <div className="flex flex-col gap-3">
                    {/* Each store opens its own Items; its replenish and price deviations sit on its page. */}
                    <OpsCard title="Stores" note="Open one" rows={storeRows} wide />
                    {facilityRows.length > 0 && <OpsCard title="Warehouses & hubs" note="Facilities" rows={facilityRows} wide />}
                    <OpsCard title="Stock" note="What is here" rows={stock} wide />
                    <OpsCard title="Movement" note="What is on the way" rows={movement} wide />
                    <OpsCard title="Approvals" note="What waits for a ruling" rows={approvals} wide />
                    <OpsCard title="Setup" note="How the stores run" rows={setup} wide />

                    {/* ── Item picker → per-location stock tool ── */}
                    <Card
                        title="Stock by item"
                        titleVariant="caps"
                        note={`${deployedItems.length} of ${catalogue.items} deployed`}
                    >

                    <p className="mb-2.5 text-[11px] text-on-surface-variant">
                        Pick an item, then a store, to open the per-location stock tool —
                        shelf, store room, remote hub and warehouses, tap to filter or combine.
                    </p>

                    <label className="mb-3 flex items-center gap-2 rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 py-1.5 focus-within:border-primary focus-within:bg-surface-container-lowest">
                        <span className="material-symbols-outlined text-[18px] text-outline">
                            search
                        </span>
                        <input
                            type="search"
                            value={itemSearch}
                            onChange={(event) => setItemSearch(event.target.value)}
                            placeholder="Item or store name…"
                            aria-label="Search deployed items"
                            className="w-full border-0 bg-transparent p-0 text-[12px] font-medium text-on-surface placeholder:text-outline focus:outline-none focus:ring-0"
                        />
                    </label>

                    <div className="grid grid-cols-1 gap-2">
                        {shown.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2.5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h4 className="truncate text-xs font-bold text-on-surface">
                                            {item.name}
                                        </h4>
                                        <p className="mt-0.5 text-[10px] text-on-surface-variant">
                                            {item.variants} variant
                                            {item.variants === 1 ? "" : "s"} ·{" "}
                                            <span className="font-semibold text-on-surface">
                                                {item.store_stock.toLocaleString()}
                                            </span>{" "}
                                            pcs in stores
                                            {item.warehouse_stock > 0 ? (
                                                <>
                                                    {" · "}
                                                    <span className="font-semibold text-on-surface">
                                                        {item.warehouse_stock.toLocaleString()}
                                                    </span>{" "}
                                                    in warehouses
                                                </>
                                            ) : null}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-[999px] bg-surface-container px-2 py-0.5 font-mono text-[10px] font-bold text-on-surface-variant">
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
                                                        ? "border-info/30 bg-info-container/70 text-on-info-container hover:border-info hover:bg-info-container"
                                                        : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary hover:bg-primary-container/60 hover:text-primary"
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
                                            className="flex items-center gap-1 rounded-[999px] border border-tertiary/30 bg-tertiary-container/70 px-2.5 py-1 text-[10px] font-bold text-on-tertiary-container"
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
                            <p className="py-2 text-center text-[11px] text-on-surface-variant">
                                Showing {shown.length} of {visibleItems.length}. Search to
                                narrow it down.
                            </p>
                        ) : null}

                        {visibleItems.length === 0 ? (
                            <div className="flex flex-col items-center px-6 py-10 text-center">
                                <span className="material-symbols-outlined text-[32px] text-outline/60">
                                    inventory_2
                                </span>
                                <p className="mt-2 text-[13px] font-bold text-on-surface">
                                    {itemSearch
                                        ? "No matching items"
                                        : "Nothing is holding stock yet"}
                                </p>
                                <p className="mt-1 text-[11px] text-on-surface-variant">
                                    {itemSearch
                                        ? "Try a different item or store name."
                                        : "Receive stock into a store or warehouse to see it here."}
                                </p>
                            </div>
                        ) : null}
                    </div>
                    </Card>
                </div>
            </div>
        </>
    );
}

InventoryHub.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
