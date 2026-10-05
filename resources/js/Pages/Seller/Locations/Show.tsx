import SellerLayout from "@/Layouts/SellerLayout";
import { type Place, PlaceStrip } from "@/Components/Shared/OpsHub";
import ShelfBinMatrix from "@/Components/Seller/Locations/ShelfBinMatrix";
import { EmptyState } from "@/Components/Shared/ui";
import type { LocationItem, LocationTile, ShelfLine, ShelfMatrixData } from "@/types/sellerLocations";
import { Head, Link } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * One place stock sits in — Store Shelf, Store, Remote Hub or a main hub — in
 * the More hub's card style.
 *
 * A shelf opens on its replenishment row: ten boxes, one per shelf line, most
 * urgent first. Each box fills from the bottom with what is on the shelf, and
 * the dashed line across it is the refill point (the band's minimum); the top
 * of the box is the band's maximum. A box at or under its line needs a refill.
 */

interface Props {
    location: { id: number; kind: string; name: string; code: string | null };
    strip?: LocationTile[];
    items?: LocationItem[];
    shelfLines?: ShelfLine[];
    rowSize?: number;
    /** The shelf as bins (ShelfMatrix); null for other kinds of location. */
    matrix?: ShelfMatrixData | null;
    /** The shelf's managers (and admins): assign items and set their lines. */
    canEditShelf?: boolean;
    /** Raise a refill by hand. */
    canRaiseRefill?: boolean;
    /** The store's managers: choose where each item is refilled from. */
    canSetRoute?: boolean;
}

const KIND_META: Record<string, { label: string; icon: string; key: string }> = {
    shelf: { label: "Store Shelf", icon: "shelves", key: "shelf" },
    store: { label: "Store", icon: "storefront", key: "store" },
    backroom: { label: "Store", icon: "storefront", key: "store" },
    remote_hub: { label: "Remote Hub", icon: "warehouse", key: "remote_hub" },
    main_hub: { label: "Main Distribution Hub", icon: "hub", key: "" },
};

/** Literal class strings so the JIT compiler keeps them. */
const STATUS_STYLE: Record<ShelfLine["status"], { fill: string; chip: string; label: string }> = {
    ok: { fill: "bg-success", chip: "bg-success-container/60 text-on-success-container border-success/30", label: "Stocked" },
    refill: { fill: "bg-warning", chip: "bg-warning-container/60 text-on-warning-container border-warning/30", label: "Refill" },
    empty: { fill: "bg-error", chip: "bg-error-container/60 text-on-error-container border-error/30", label: "Empty" },
};

const pct = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

export default function LocationShow({
    location,
    strip = [],
    items = [],
    shelfLines = [],
    rowSize = 10,
    matrix = null,
    canEditShelf = false,
    canRaiseRefill = false,
    canSetRoute = false,
}: Props): React.ReactElement {
    const meta = KIND_META[location.kind] ?? { label: "Location", icon: "location_on", key: "" };
    const isShelf = location.kind === "shelf";

    const places: Place[] = strip.map((tile) => ({
        key: tile.key,
        label: tile.label,
        caption: tile.caption,
        icon: tile.icon,
        routeName: tile.location_id ? "seller.locations.show" : null,
        routeParams: tile.location_id ? { location: tile.location_id } : undefined,
        alert: tile.alert,
    }));
    const activeKey = strip.find((tile) => tile.location_id === location.id)?.key ?? meta.key;

    return (
        <>
            <Head title={location.name} />

            <div className="min-h-screen bg-background pb-28">
                {/* ── Header ── */}
                <section className="flex items-center space-x-3 px-4 pb-3 pt-4">
                    <Link
                        href={route("seller.menu.index")}
                        aria-label="Back"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant transition-all hover:bg-surface-container-high/60 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </Link>
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-primary-container bg-primary text-on-primary shadow-sm"
                    >
                        <span className="material-symbols-outlined text-2xl">{meta.icon}</span>
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">
                            {location.name}
                        </h1>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                            {meta.label}
                            {location.code ? ` · ${location.code}` : ""}
                        </p>
                    </div>
                </section>

                <div className="px-3.5">
                    {places.length ? (
                        <section className="mb-3 rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-1 shadow-sm">
                            <PlaceStrip places={places} activeKey={activeKey} bordered={false} />
                        </section>
                    ) : null}

                    {(isShelf || location.kind === "remote_hub") && matrix ? (
                        <ShelfBinMatrix
                            isShelf={isShelf}
                            locationId={location.id}
                            matrix={matrix}
                            canEdit={canEditShelf}
                            canRaiseRefill={canRaiseRefill}
                            canSetRoute={canSetRoute}
                        />
                    ) : isShelf ? (
                        <ReplenishmentRow lines={shelfLines} size={rowSize} />
                    ) : null}

                    <StockList items={items} spokenIn={isShelf ? "smallest unit" : "biggest unit first"} />
                </div>
            </div>
        </>
    );
}

/** Ten boxes per page of shelf lines, with the selected line's detail below. */
function ReplenishmentRow({ lines, size }: { lines: ShelfLine[]; size: number }): React.ReactElement {
    const [page, setPage] = useState(0);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const pages = Math.max(1, Math.ceil(lines.length / size));
    const current = Math.min(page, pages - 1);
    const slice = lines.slice(current * size, current * size + size);
    const boxes: Array<ShelfLine | null> = [...slice, ...Array(Math.max(0, size - slice.length)).fill(null)];
    const needRefill = lines.filter((line) => line.status !== "ok").length;

    const selected = useMemo(
        () => lines.find((line) => line.id === selectedId) ?? slice[0] ?? null,
        [lines, selectedId, slice],
    );

    return (
        <section className="mb-3 rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <h2 className="text-[13px] font-bold text-on-surface">
                        Replenishment
                    </h2>
                    {needRefill > 0 ? (
                        <span className="rounded-[999px] bg-error px-1.5 py-0.5 font-mono text-[9px] font-bold text-on-error">
                            {needRefill} to refill
                        </span>
                    ) : null}
                </div>
                {pages > 1 ? (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label="Previous ten"
                            disabled={current === 0}
                            onClick={() => setPage(current - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                        >
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <span className="font-mono text-[10px] text-outline">
                            {current + 1}/{pages}
                        </span>
                        <button
                            type="button"
                            aria-label="Next ten"
                            disabled={current >= pages - 1}
                            onClick={() => setPage(current + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                        >
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>
                ) : null}
            </div>

            {/* The row of boxes. */}
            <div className="grid grid-cols-10 gap-1">
                {boxes.map((line, index) => {
                    if (!line) {
                        return (
                            <div
                                key={`empty-${index}`}
                                className="h-24 rounded-[6px] border border-dashed border-outline-variant bg-surface-container-low/60"
                            />
                        );
                    }

                    const style = STATUS_STYLE[line.status];
                    const isSelected = selected?.id === line.id;

                    return (
                        <button
                            key={line.id}
                            type="button"
                            onClick={() => setSelectedId(line.id)}
                            aria-label={`${line.name}: ${line.on_hand} of ${line.max} ${line.unit}`}
                            aria-pressed={isSelected}
                            className={`relative h-24 overflow-hidden rounded-[6px] border bg-surface-container-low transition-all ${
                                isSelected ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"
                            }`}
                        >
                            {/* What is on the shelf, from the bottom. */}
                            <span
                                className={`absolute inset-x-0 bottom-0 ${style.fill} opacity-90`}
                                style={{ height: pct(line.fill) }}
                            />
                            {/* The refill line: the band's minimum. */}
                            <span
                                className="absolute inset-x-0 border-t-2 border-dashed border-on-surface"
                                style={{ bottom: pct(line.min / line.max) }}
                            />
                        </button>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center justify-center gap-3 text-[9px] font-medium text-on-surface-variant">
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] bg-success" /> On shelf
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 border-t-2 border-dashed border-on-surface" /> Refill line
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] border border-outline/50" /> Top = full
                </span>
            </div>

            {lines.length === 0 ? (
                <EmptyState
                    icon="tune"
                    title="No shelf bands yet"
                    description="Set a min and max for a product on this shelf and it appears in the row."
                    className="mt-3 rounded-[12px] bg-surface-container-low px-3 py-4"
                />
            ) : selected ? (
                <div className="mt-3 flex items-center justify-between rounded-[12px] border border-outline-variant/60 bg-surface-container-low/70 px-3 py-2.5">
                    <div className="min-w-0">
                        <h3 className="truncate text-xs font-bold text-on-surface">{selected.name}</h3>
                        <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                            {selected.variant} · {selected.on_hand} on shelf · refill at {selected.min} · full at{" "}
                            {selected.max} {selected.unit}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 pl-2">
                        <span className={`rounded-[999px] border px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[selected.status].chip}`}>
                            {STATUS_STYLE[selected.status].label}
                        </span>
                        {selected.refill > 0 ? (
                            <span className="font-mono text-[10px] font-semibold text-primary">
                                +{selected.refill} {selected.unit}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function StockList({ items, spokenIn }: { items: LocationItem[]; spokenIn: string }): React.ReactElement {
    return (
        <section className="mb-3 rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                    Stock here
                </h3>
                <span className="font-mono text-[10px] text-outline">
                    {items.length} item{items.length === 1 ? "" : "s"} · {spokenIn}
                </span>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                    <span className="material-symbols-outlined text-[30px] text-outline">inventory_2</span>
                    <p className="mt-1 text-[12px] font-bold text-on-surface">Nothing booked here yet</p>
                </div>
            ) : (
                <div className="grid gap-2">
                    {items.map((item) => (
                        <div
                            key={item.item_id}
                            className="flex items-center justify-between rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2"
                        >
                            <div className="flex min-w-0 items-center space-x-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-container text-on-surface-variant">
                                    <span className="material-symbols-outlined text-lg leading-none">inventory_2</span>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="truncate text-xs font-bold leading-tight text-on-surface">
                                        {item.product_name}
                                    </h4>
                                    <span className="mt-0.5 block truncate text-[10px] leading-none text-on-surface-variant">
                                        {item.variant_count} variant{item.variant_count === 1 ? "" : "s"}
                                        {item.item_sku ? ` · ${item.item_sku}` : ""}
                                    </span>
                                </div>
                            </div>
                            <span className="shrink-0 pl-2 text-right font-mono text-[11px] font-semibold text-on-surface-variant">
                                {item.display}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

LocationShow.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
