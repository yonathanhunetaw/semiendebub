import SellerLayout from "@/Layouts/SellerLayout";
import { HUB_BRAND, HUB_INK, HUB_PAGE_BG, type Place, PlaceStrip } from "@/Components/Shared/OpsHub";
import ShelfBinMatrix from "@/Components/Seller/Locations/ShelfBinMatrix";
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
    canEditShelf?: boolean;
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
    ok: { fill: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Stocked" },
    refill: { fill: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", label: "Refill" },
    empty: { fill: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200", label: "Empty" },
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

            <div className="min-h-screen pb-28" style={{ backgroundColor: HUB_PAGE_BG }}>
                {/* ── Header ── */}
                <section className="flex items-center space-x-3 px-4 pb-3 pt-4">
                    <Link
                        href={route("seller.menu.index")}
                        aria-label="Back"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-gray-700 transition-all hover:bg-gray-200/60 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </Link>
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-orange-200 text-white shadow-sm"
                        style={{ backgroundColor: HUB_BRAND }}
                    >
                        <span className="material-symbols-outlined text-2xl">{meta.icon}</span>
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-[17px] font-bold tracking-tight" style={{ color: HUB_INK }}>
                            {location.name}
                        </h1>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {meta.label}
                            {location.code ? ` · ${location.code}` : ""}
                        </p>
                    </div>
                </section>

                <div className="px-3.5">
                    {places.length ? (
                        <section className="mb-3 rounded-[16px] border border-gray-100 bg-white px-3.5 py-1 shadow-sm">
                            <PlaceStrip places={places} activeKey={activeKey} bordered={false} />
                        </section>
                    ) : null}

                    {isShelf && matrix ? (
                        <ShelfBinMatrix locationId={location.id} matrix={matrix} canEdit={canEditShelf} />
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
        <section className="mb-3 rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <h2 className="text-[13px] font-bold" style={{ color: HUB_INK }}>
                        Replenishment
                    </h2>
                    {needRefill > 0 ? (
                        <span className="rounded-[999px] bg-rose-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
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
                            className="flex h-7 w-7 items-center justify-center rounded-[999px] text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                        >
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <span className="font-mono text-[10px] text-gray-400">
                            {current + 1}/{pages}
                        </span>
                        <button
                            type="button"
                            aria-label="Next ten"
                            disabled={current >= pages - 1}
                            onClick={() => setPage(current + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-[999px] text-gray-600 hover:bg-gray-100 disabled:opacity-30"
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
                                className="h-24 rounded-[6px] border border-dashed border-gray-200 bg-gray-50/60"
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
                            className={`relative h-24 overflow-hidden rounded-[6px] border bg-gray-50 transition-all ${
                                isSelected ? "border-[#c2410c] ring-2 ring-orange-200" : "border-gray-200"
                            }`}
                        >
                            {/* What is on the shelf, from the bottom. */}
                            <span
                                className={`absolute inset-x-0 bottom-0 ${style.fill} opacity-90`}
                                style={{ height: pct(line.fill) }}
                            />
                            {/* The refill line: the band's minimum. */}
                            <span
                                className="absolute inset-x-0 border-t-2 border-dashed border-[#0b1c30]"
                                style={{ bottom: pct(line.min / line.max) }}
                            />
                        </button>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center justify-center gap-3 text-[9px] font-medium text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] bg-emerald-500" /> On shelf
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 border-t-2 border-dashed border-[#0b1c30]" /> Refill line
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] border border-gray-300" /> Top = full
                </span>
            </div>

            {lines.length === 0 ? (
                <div className="mt-3 rounded-[12px] bg-gray-50 px-3 py-4 text-center">
                    <span className="material-symbols-outlined text-[26px] text-slate-300">tune</span>
                    <p className="mt-1 text-[12px] font-bold text-gray-900">No shelf bands yet</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                        Set a min and max for a product on this shelf and it appears in the row.
                    </p>
                </div>
            ) : selected ? (
                <div className="mt-3 flex items-center justify-between rounded-[12px] border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                    <div className="min-w-0">
                        <h3 className="truncate text-xs font-bold text-gray-900">{selected.name}</h3>
                        <p className="mt-0.5 truncate text-[10px] text-gray-500">
                            {selected.variant} · {selected.on_hand} on shelf · refill at {selected.min} · full at{" "}
                            {selected.max} {selected.unit}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 pl-2">
                        <span className={`rounded-[999px] border px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[selected.status].chip}`}>
                            {STATUS_STYLE[selected.status].label}
                        </span>
                        {selected.refill > 0 ? (
                            <span className="font-mono text-[10px] font-semibold" style={{ color: HUB_BRAND }}>
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
        <section className="mb-3 rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: HUB_INK }}>
                    Stock here
                </h3>
                <span className="font-mono text-[10px] text-gray-400">
                    {items.length} item{items.length === 1 ? "" : "s"} · {spokenIn}
                </span>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                    <span className="material-symbols-outlined text-[30px] text-slate-300">inventory_2</span>
                    <p className="mt-1 text-[12px] font-bold text-gray-900">Nothing booked here yet</p>
                </div>
            ) : (
                <div className="grid gap-2">
                    {items.map((item) => (
                        <div
                            key={item.item_id}
                            className="flex items-center justify-between rounded-[12px] border border-gray-200 bg-white px-3 py-2"
                        >
                            <div className="flex min-w-0 items-center space-x-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-500">
                                    <span className="material-symbols-outlined text-lg leading-none">inventory_2</span>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="truncate text-xs font-bold leading-tight text-gray-900">
                                        {item.product_name}
                                    </h4>
                                    <span className="mt-0.5 block truncate text-[10px] leading-none text-gray-500">
                                        {item.variant_count} variant{item.variant_count === 1 ? "" : "s"}
                                        {item.item_sku ? ` · ${item.item_sku}` : ""}
                                    </span>
                                </div>
                            </div>
                            <span className="shrink-0 pl-2 text-right font-mono text-[11px] font-semibold text-gray-700">
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
