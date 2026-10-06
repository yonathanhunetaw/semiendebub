import type { AssignableItem, RefillSource, RefillStatus, ShelfBin, ShelfMatrixData } from "@/types/sellerLocations";
import { router } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

type StatusKey = ShelfBin["status"] | "unassigned";

/** Literal class strings so the JIT compiler keeps them. */
const STATUS: Record<StatusKey, { bar: string; text: string; cell: string; badge: string; label: string }> = {
    ok: { bar: "bg-success", text: "text-on-success-container", cell: "border-success/30 bg-surface-container-lowest", badge: "bg-success-container text-on-success-container", label: "Normal" },
    refill: { bar: "bg-primary", text: "text-primary", cell: "border-primary/40 bg-primary-container/25", badge: "bg-primary-container text-on-primary-container", label: "Refill soon" },
    critical: { bar: "bg-error", text: "text-on-error-container", cell: "border-error/60 bg-error-container/25", badge: "bg-error-container text-on-error-container", label: "Crit low" },
    empty: { bar: "bg-surface-container-highest", text: "text-outline", cell: "border-dashed border-outline/50 bg-surface-container/50", badge: "bg-surface-container text-on-surface-variant", label: "Empty" },
    unassigned: { bar: "bg-warning", text: "text-on-warning-container", cell: "border-dashed border-warning/60 bg-warning-container/35", badge: "bg-warning-container text-on-warning-container", label: "Unassigned" },
};

const SOURCE_LABEL: Record<RefillSource, string> = {
    floor: "Store floor",
    remote_hub: "Remote Hub",
    shipment: "Shipment",
};

/** Canonical order: closest to the shelf first. */
const SOURCES: RefillSource[] = ["floor", "remote_hub", "shipment"];

const LEG_STATUS: Record<RefillStatus, { label: string; chip: string }> = {
    pending: { label: "Waiting for manager", chip: "bg-warning-container text-on-warning-container" },
    approved: { label: "Approved", chip: "bg-info-container text-on-info-container" },
    in_progress: { label: "On its way", chip: "bg-success-container text-on-success-container" },
    fulfilled: { label: "Done", chip: "bg-surface-container text-on-surface-variant" },
    cancelled: { label: "Cancelled", chip: "bg-surface-container text-on-surface-variant" },
};

type Mode = "max" | "refill" | "critical";

const pct = (value: number): string => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const statusOf = (bin: ShelfBin): StatusKey => (bin.assigned ? bin.status : "unassigned");

/**
 * A Store Shelf as bins: one item per bin, A–E across and 1–10 down, fifty to
 * a tier. Each bin fills with what is on the shelf; the orange line is the
 * refill point and the red line is critical, both set per item in one of its
 * pack units. Tapping a bin opens it below.
 *
 * Planogram first: a bin exists because a shelf manager assigned the item.
 * Managers tap an open cell to assign one; everyone else sees the shelf
 * read-only. Stock on the shelf for an item with no bin shows as unassigned.
 */
export default function ShelfBinMatrix({
    locationId,
    matrix,
    canEdit,
    canRaiseRefill,
    canSetRoute,
    isShelf = true,
}: {
    locationId: number;
    /** False for a Remote Hub's own lines: no refill route, restocked only by shipment. */
    isShelf?: boolean;
    matrix: ShelfMatrixData;
    canEdit: boolean;
    canRaiseRefill: boolean;
    canSetRoute: boolean;
}): React.ReactElement {
    const [activeId, setActiveId] = useState<number | null>(matrix.bins[0]?.item_id ?? null);
    const [assigning, setAssigning] = useState(false);

    useEffect(() => {
        if (activeId !== null && !matrix.bins.some((bin) => bin.item_id === activeId)) {
            setActiveId(matrix.bins[0]?.item_id ?? null);
        }
    }, [matrix.bins, activeId]);

    const active = useMemo(() => matrix.bins.find((bin) => bin.item_id === activeId) ?? null, [matrix.bins, activeId]);
    const cells: Array<ShelfBin | null> = Array.from({ length: matrix.columns.length * matrix.rows }, (_, i) => matrix.bins[i] ?? null);

    const goTier = (tier: number): void => {
        const next = tier < 1 ? matrix.tiers : tier > matrix.tiers ? 1 : tier;
        router.get(route("seller.locations.show", locationId), { tier: next }, { preserveScroll: true, preserveState: true, only: ["matrix"] });
    };

    const select = (itemId: number): void => {
        setAssigning(false);
        setActiveId(itemId);
    };

    const occupancy = matrix.totals.items > 0 ? (matrix.totals.occupied / matrix.totals.items) * 100 : 0;

    const capacity = matrix.columns.length * matrix.rows * matrix.tiers;
    const legs = matrix.bins.flatMap((bin) => bin.refills.map((leg) => ({ leg, bin })));

    return (
        <>
            <div className="mb-3 hidden grid-cols-4 gap-3.5 lg:grid">
                <Kpi icon="view_compact_alt" label="Bins in use" value={`${matrix.totals.items} / ${capacity}`} note={`${occupancy.toFixed(1)}% have stock`} bar={capacity ? matrix.totals.items / capacity : 0} />
                <Kpi icon="priority_high" tone="primary" label="Refill queue" value={`${matrix.totals.refill_queue} item${matrix.totals.refill_queue === 1 ? "" : "s"}`} note={`${matrix.totals.critical} critical · ${matrix.totals.refill_pending} on its way`} />
                <Kpi icon="inventory_2" label="On the shelf" value={`${matrix.totals.pieces.toLocaleString()} pieces`} note={`${matrix.totals.occupied} bin${matrix.totals.occupied === 1 ? "" : "s"} stocked`} />
                <Kpi icon="help" tone={matrix.totals.unassigned > 0 ? "warning" : undefined} label="Unassigned" value={String(matrix.totals.unassigned)} note="Stock with no bin" />
            </div>

            <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-5">
            <div className="lg:col-span-8">
            <section className="mb-3 rounded-[24px] bg-surface-container-lowest px-4 pb-4 pt-4 shadow-sm lg:p-5">
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-[20px] font-bold tracking-tight text-on-surface">Replenishment</h2>
                        {!canEdit ? (
                            <p className="flex items-center space-x-1 text-[11px] font-medium text-on-surface-variant">
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                <span>View only · the shelf&apos;s managers set what sits here</span>
                            </p>
                        ) : null}
                    </div>
                    <div className="flex items-center space-x-1 rounded-[12px] bg-surface-container p-1">
                        <button type="button" aria-label="Previous tier" onClick={() => goTier(matrix.tier - 1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-surface-container-lowest text-on-surface-variant shadow-sm active:scale-95">
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <div className="min-w-[70px] px-2 text-center">
                            <span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-outline">Tier</span>
                            <span className="font-mono text-[14px] font-bold leading-none text-primary">
                                {String(matrix.tier).padStart(2, "0")} / {String(matrix.tiers).padStart(2, "0")}
                            </span>
                        </div>
                        <button type="button" aria-label="Next tier" onClick={() => goTier(matrix.tier + 1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-surface-container-lowest text-on-surface-variant shadow-sm active:scale-95">
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center justify-between gap-y-1 rounded-[12px] border border-outline-variant/60 bg-surface-container-low px-3 py-1.5 text-[11px]">
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-success" /><span className="font-medium text-on-surface-variant">On shelf</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary" /><span className="font-medium text-on-surface-variant">Refill line</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-error" /><span className="font-bold text-error">Crit low</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-surface-container-high" /><span className="font-medium text-outline">Empty</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-dashed border-warning bg-warning-container" /><span className="font-medium text-on-warning-container">Unassigned</span></span>
                    <span className="flex items-center space-x-1.5"><span className="material-symbols-outlined text-[13px] text-info">local_shipping</span><span className="font-medium text-on-surface-variant">Refill on its way</span></span>
                </div>

                <div className="mx-auto w-full max-w-[360px] pb-1 lg:max-w-none">
                    <div className="mb-1 grid grid-cols-[16px_repeat(5,minmax(0,1fr))] gap-x-1.5 font-mono text-[11px] font-bold text-outline lg:gap-x-2.5">
                        <div />
                        {matrix.columns.map((column) => (
                            <div key={column} className="text-center lg:rounded-[6px] lg:border lg:border-outline-variant/60 lg:bg-surface-container lg:py-1">{column}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-[16px_repeat(5,minmax(0,1fr))] gap-1.5 rounded-[16px] border border-outline-variant bg-surface-container-low p-1.5 lg:gap-2.5 lg:p-2.5">
                        {cells.map((bin, index) => (
                            <React.Fragment key={bin ? bin.item_id : `open-${index}`}>
                                {index % matrix.columns.length === 0 ? (
                                    <div className="flex select-none items-center justify-center font-mono text-[11px] font-bold text-outline">
                                        {Math.floor(index / matrix.columns.length) + 1}
                                    </div>
                                ) : null}
                                {bin ? (
                                    <Bin bin={bin} selected={!assigning && bin.item_id === activeId} onSelect={() => select(bin.item_id)} />
                                ) : canEdit ? (
                                    <button
                                        type="button"
                                        aria-label="Assign an item to an open bin"
                                        onClick={() => setAssigning(true)}
                                        className="flex aspect-square items-center justify-center rounded-[6px] border border-dashed border-outline/50 bg-surface-container-lowest/40 text-outline hover:border-primary hover:text-primary active:scale-95 lg:aspect-auto lg:h-20"
                                    >
                                        <span className="material-symbols-outlined text-[16px] lg:text-[20px]">add</span>
                                    </button>
                                ) : (
                                    <div className="aspect-square rounded-[6px] border border-dashed border-outline-variant bg-surface-container-lowest/40 lg:aspect-auto lg:h-20" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-col items-center space-y-2">
                    <div className="flex items-center space-x-2">
                        {Array.from({ length: matrix.tiers }, (_, i) => (
                            <button
                                key={i}
                                type="button"
                                aria-label={`Go to tier ${i + 1}`}
                                onClick={() => goTier(i + 1)}
                                className={i + 1 === matrix.tier ? "h-2 w-7 rounded-[999px] bg-primary" : "h-2 w-2 rounded-[999px] bg-surface-container-highest hover:bg-outline"}
                            />
                        ))}
                    </div>
                    <p className="text-center font-mono text-[11px] tracking-wide text-on-surface-variant">
                        Tier {matrix.tier} of {matrix.tiers} · {matrix.totals.items} item{matrix.totals.items === 1 ? "" : "s"} on this shelf
                    </p>
                    {canEdit ? (
                        <button
                            type="button"
                            onClick={() => setAssigning(true)}
                            className="flex items-center space-x-1 rounded-[12px] bg-primary-container/80 px-3 py-1.5 text-[12px] font-semibold text-primary active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[16px]">add_box</span>
                            <span>Assign item</span>
                        </button>
                    ) : null}
                </div>
            </section>

            {legs.length ? <RestockOrders legs={legs} /> : null}
            </div>

            <div className="lg:sticky lg:top-4 lg:col-span-4">
            {assigning && canEdit ? (
                <AssignPanel locationId={locationId} onClose={() => setAssigning(false)} />
            ) : active ? (
                <BinEditor
                    key={active.item_id}
                    isShelf={isShelf}
                    locationId={locationId}
                    bin={active}
                    canEdit={canEdit}
                    canRaiseRefill={canRaiseRefill}
                    canSetRoute={canSetRoute}
                />
            ) : (
                <section className="mb-3 rounded-[24px] bg-surface-container-lowest px-4 py-5 text-center shadow-sm">
                    <span className="material-symbols-outlined text-[28px] text-outline">shelves</span>
                    <p className="mt-1 text-[13px] font-bold text-on-surface">Nothing assigned to this shelf yet</p>
                    <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        {canEdit
                            ? "Tap an open bin to assign an item and set its refill line and crit low."
                            : "A shelf manager assigns each item a bin before stock can go here."}
                    </p>
                </section>
            )}

            <section className="mb-3 rounded-[24px] bg-surface-container-lowest px-4 py-4 shadow-sm lg:hidden">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[15px] font-bold uppercase text-on-surface">Shelf summary</h3>
                    <span className="font-mono text-[12px] text-on-surface-variant">
                        <span className="font-bold text-on-surface">{matrix.totals.pieces.toLocaleString()}</span> pieces
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[16px] border border-outline-variant/60 bg-surface-container-low p-3">
                        <div className="mb-1 flex items-center space-x-1.5 text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px] text-success">inventory_2</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Occupancy</span>
                        </div>
                        <div className="text-[20px] font-bold leading-tight text-on-surface">{occupancy.toFixed(1)}%</div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">{matrix.totals.occupied} stocked · {matrix.totals.items - matrix.totals.occupied} empty</p>
                    </div>
                    <div className="rounded-[16px] border border-outline-variant/60 bg-surface-container-low p-3">
                        <div className="mb-1 flex items-center space-x-1.5 text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px] text-primary">priority_high</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Refill queue</span>
                        </div>
                        <div className="text-[20px] font-bold leading-tight text-primary">{matrix.totals.refill_queue} items</div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                            {matrix.totals.critical} critical · {matrix.totals.refill_pending} on its way
                        </p>
                    </div>
                </div>
                {matrix.totals.unassigned > 0 ? (
                    <p className="mt-2.5 flex items-center space-x-1.5 rounded-[12px] border border-warning/30 bg-warning-container/60 px-3 py-2 text-[11px] font-medium text-on-warning-container">
                        <span className="material-symbols-outlined text-[16px]">help</span>
                        <span>
                            {matrix.totals.unassigned} item{matrix.totals.unassigned === 1 ? " is" : "s are"} on the shelf without a bin. They are never refilled until a shelf manager assigns them.
                        </span>
                    </p>
                ) : null}
            </section>
            </div>
            </div>
        </>
    );
}

const KPI_TONE = {
    default: "border-primary/20 bg-primary-container/40 text-primary",
    primary: "border-primary/20 bg-primary-container/40 text-primary",
    warning: "border-warning/30 bg-warning-container/60 text-on-warning-container",
} as const;

function Kpi({ icon, label, value, note, bar, tone = "default" }: { icon: string; label: string; value: string; note: string; bar?: number; tone?: keyof typeof KPI_TONE }): React.ReactElement {
    return (
        <div className="flex items-center justify-between rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-sm">
            <div className="min-w-0 flex-1 pr-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
                <p className="mt-1 text-base font-bold text-on-surface">{value}</p>
                {bar !== undefined ? (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[999px] bg-surface-container-high">
                        <div className="h-1.5 rounded-[999px] bg-primary" style={{ width: pct(bar) }} />
                    </div>
                ) : null}
                <p className="mt-1 truncate font-mono text-[11px] text-outline">{note}</p>
            </div>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border ${KPI_TONE[tone]}`}>
                <span className="material-symbols-outlined text-[22px]">{icon}</span>
            </div>
        </div>
    );
}

/** Every open refill leg on the shelf, one row each, urgent first. */
function RestockOrders({ legs }: { legs: Array<{ leg: ShelfBin["refills"][number]; bin: ShelfBin }> }): React.ReactElement {
    return (
        <section className="mb-3 rounded-[24px] bg-surface-container-lowest p-4 shadow-sm lg:p-5">
            <div className="mb-3 flex items-center space-x-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-primary-container/60 text-primary">
                    <span className="material-symbols-outlined text-[16px]">alt_route</span>
                </div>
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-on-surface">Open refills</h3>
            </div>
            <ul className="space-y-2">
                {legs.map(({ leg, bin }) => (
                    <li key={leg.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-outline-variant/60 bg-surface-container-low p-3">
                        <div className="flex min-w-0 items-center space-x-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-warning/30 bg-warning-container font-mono text-[12px] font-bold text-on-warning-container">{bin.coord}</div>
                            <div className="min-w-0">
                                <p className="truncate text-[12px] font-bold text-on-surface">{bin.name} · {leg.display}</p>
                                <p className="truncate text-[11px] text-on-surface-variant">From {SOURCE_LABEL[leg.source]} · {leg.reference}</p>
                            </div>
                        </div>
                        <span className={`shrink-0 rounded-[999px] px-2.5 py-1 text-[11px] font-bold ${leg.awaits_hub ? "bg-info-container text-on-info-container" : LEG_STATUS[leg.status].chip}`}>
                            {leg.awaits_hub ? "Hub to accept" : LEG_STATUS[leg.status].label}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function Bin({ bin, selected, onSelect }: { bin: ShelfBin; selected: boolean; onSelect: () => void }): React.ReactElement {
    const style = STATUS[statusOf(bin)];
    const unitMax = bin.band?.max ?? null;
    const urgent = bin.refills.some((leg) => leg.urgent);

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${bin.coord}: ${bin.name}, ${bin.display}${bin.assigned ? "" : ", unassigned"}${bin.refills.length ? ", refill on its way" : ""}`}
            aria-pressed={selected}
            className={`relative flex aspect-square flex-col justify-between overflow-hidden rounded-[6px] border p-1 text-left transition-all active:scale-95 lg:aspect-auto lg:h-24 lg:rounded-[10px] lg:p-2 ${style.cell} ${
                selected ? "z-20 scale-[1.04] border-primary shadow-[0_0_0_2px_rgb(var(--primary))] bg-primary-container/60" : ""
            }`}
        >
            <div className="absolute inset-y-0 left-0 w-1 bg-surface-container-high lg:w-1.5">
                <div className={`absolute bottom-0 w-full ${style.bar}`} style={{ height: pct(bin.fill) }} />
                {bin.band && bin.band.max > 0 ? (
                    <>
                        <div className="absolute z-10 h-px w-full bg-primary" style={{ bottom: pct(bin.band.refill / bin.band.max) }} />
                        <div className="absolute z-10 h-px w-full bg-error" style={{ bottom: pct(bin.band.critical / bin.band.max) }} />
                    </>
                ) : null}
            </div>
            <div className="flex items-center justify-between pl-1 pr-0.5">
                {bin.refills.length ? (
                    <span className={`material-symbols-outlined text-[9px] leading-none ${urgent ? "text-error" : "text-info"}`}>local_shipping</span>
                ) : !bin.assigned ? (
                    <span className="material-symbols-outlined text-[9px] leading-none text-warning">help</span>
                ) : <span />}
                <span className="font-mono text-[7px] font-semibold leading-none text-outline lg:rounded-[4px] lg:border lg:border-outline-variant lg:bg-surface-container-lowest lg:px-1 lg:py-0.5 lg:text-[10px]">{unitMax !== null ? <><span className="hidden lg:inline">Cap: </span>{unitMax}</> : "--"}</span>
            </div>
            <div className="my-auto flex flex-col items-center justify-center pl-1">
                <span className={`font-mono text-[13px] font-bold leading-none lg:text-xl ${style.text}`}>{bin.in_unit}</span>
                <span className={`mt-0.5 truncate font-mono text-[7px] leading-none lg:text-[10px] lg:uppercase ${style.text}`}>{bin.unit.name.slice(0, 4).toLowerCase()}</span>
            </div>
            <div className="flex items-center justify-between pl-1 lg:border-t lg:border-outline-variant/50 lg:pt-1">
                <span className="min-w-0 flex-1 truncate text-center font-mono text-[7.5px] font-semibold leading-none text-on-surface lg:text-left lg:font-sans lg:text-[11px]">{bin.short}</span>
                <span className={`hidden pl-1 text-[9px] font-bold uppercase lg:block ${style.text}`}>{style.label}</span>
            </div>
        </button>
    );
}

/** The three lines, kept in order: critical ≤ refill ≤ max. */
function useLines(initial: { max: number; refill: number; critical: number }) {
    const [lines, setLines] = useState(initial);

    const step = (mode: Mode, delta: number): void => {
        setLines((current) => {
            const next = { ...current, [mode]: Math.max(0, current[mode] + delta) };
            if (mode === "max") next.max = Math.max(1, next.max, next.refill);
            if (mode === "refill") next.refill = Math.min(Math.max(next.refill, next.critical), next.max);
            if (mode === "critical") next.critical = Math.min(next.critical, next.refill);
            return next;
        });
    };

    return { lines, step };
}

function LineStepper({ label, value, dot, onStep }: { label: string; value: number; dot: string; onStep: (delta: number) => void }): React.ReactElement {
    return (
        <div className="flex items-center justify-between rounded-[12px] border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1.5">
            <span className="flex items-center space-x-1.5 text-[12px] font-semibold text-on-surface-variant">
                <span className={`h-2 w-2 rounded-[2px] ${dot}`} />
                <span>{label}</span>
            </span>
            <span className="flex items-center space-x-2">
                <button type="button" aria-label={`Lower ${label}`} onClick={() => onStep(-1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-outline-variant bg-surface-container-low active:scale-95">
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                </button>
                <span className="w-8 text-center font-mono text-[14px] font-bold text-on-surface">{value}</span>
                <button type="button" aria-label={`Raise ${label}`} onClick={() => onStep(1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-outline-variant bg-surface-container-low active:scale-95">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
            </span>
        </div>
    );
}

/** Pick an item the store sells, then its lines; it takes the next open bin. */
function AssignPanel({ locationId, onClose }: { locationId: number; onClose: () => void }): React.ReactElement {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<AssignableItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<AssignableItem | null>(null);
    const [unitId, setUnitId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const { lines, step } = useLines({ max: 10, refill: 4, critical: 2 });

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            fetch(`${route("seller.locations.assignable", locationId)}?q=${encodeURIComponent(query)}`, {
                headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
                signal: controller.signal,
            })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
                .then((data: { items: AssignableItem[] }) => setResults(data.items))
                .catch((e: unknown) => {
                    if (!(e instanceof DOMException && e.name === "AbortError")) setError("Could not load items.");
                })
                .finally(() => setLoading(false));
        }, 250);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [locationId, query]);

    const pick = (item: AssignableItem): void => {
        setPicked(item);
        // Count in the biggest pack by default: shelves are planned in packs.
        setUnitId(item.units[0]?.id ?? null);
        setError(null);
    };

    const save = (): void => {
        if (!picked) return;
        setBusy(true);
        router.patch(
            route("seller.locations.bands.update", { location: locationId, item: picked.id }),
            { item_packaging_type_id: unitId, max: lines.max, refill: lines.refill, critical: lines.critical },
            {
                preserveScroll: true,
                onSuccess: () => onClose(),
                onError: (errors) => setError(Object.values(errors)[0] ?? "Could not assign the item."),
                onFinish: () => setBusy(false),
            },
        );
    };

    const unitName = (picked?.units.find((u) => u.id === unitId) ?? picked?.units[0])?.name.toLowerCase() ?? "units";

    return (
        <section className="mb-3 rounded-[24px] border border-primary/25 bg-gradient-to-b from-primary-container/25 to-surface-container-lowest px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-primary/20 pb-2.5">
                <div className="flex items-center space-x-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">add_box</span>
                    </div>
                    <div>
                        <span className="block text-[15px] font-bold text-on-surface">Assign an item</span>
                        <span className="text-[11px] text-on-surface-variant">It takes the next open bin</span>
                    </div>
                </div>
                <button type="button" onClick={onClose} className="flex items-center space-x-1 rounded-[12px] bg-surface-container-high px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant active:scale-95">
                    <span className="material-symbols-outlined text-[15px]">close</span>
                    <span>Close</span>
                </button>
            </div>

            {picked === null ? (
                <>
                    <label className="mb-2 flex items-center space-x-2 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2">
                        <span className="material-symbols-outlined text-[18px] text-outline">search</span>
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search the store's items"
                            className="w-full border-0 bg-transparent p-0 text-[13px] focus:ring-0"
                            autoFocus
                        />
                    </label>
                    {error ? <p className="mb-2 text-[12px] font-medium text-error">{error}</p> : null}
                    <ul className="max-h-64 divide-y divide-outline-variant/60 overflow-y-auto rounded-[12px] border border-outline-variant/60 bg-surface-container-lowest">
                        {results.map((item) => (
                            <li key={item.id}>
                                <button type="button" onClick={() => pick(item)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-primary-container/35">
                                    <span className="truncate text-[13px] font-medium text-on-surface">{item.name}</span>
                                    <span className="ml-2 shrink-0 font-mono text-[10px] text-outline">{item.units.map((u) => u.name).join(" · ")}</span>
                                </button>
                            </li>
                        ))}
                        {!loading && results.length === 0 ? (
                            <li className="px-3 py-3 text-center text-[12px] text-on-surface-variant">No unassigned items match.</li>
                        ) : null}
                        {loading ? <li className="px-3 py-3 text-center text-[12px] text-outline">Searching…</li> : null}
                    </ul>
                </>
            ) : (
                <>
                    <div className="mb-3 flex items-center justify-between rounded-[12px] border border-outline-variant/60 bg-surface-container-lowest px-3 py-2">
                        <span className="truncate text-[13px] font-bold text-on-surface">{picked.name}</span>
                        <button type="button" onClick={() => setPicked(null)} className="ml-2 shrink-0 text-[11px] font-semibold text-primary">Change</button>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                        <label className="font-mono text-[10px] font-bold uppercase text-outline" htmlFor="assign-unit">Counted in</label>
                        <select
                            id="assign-unit"
                            value={unitId ?? ""}
                            onChange={(e) => setUnitId(e.target.value === "" ? null : Number(e.target.value))}
                            className="flex-1 rounded-[8px] border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono text-[11px] font-bold"
                        >
                            {picked.units.map((u) => (
                                <option key={`${u.id}-${u.name}`} value={u.id ?? ""}>
                                    {u.name} ({u.pieces} pcs)
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="mb-3 space-y-1.5">
                        <LineStepper label={`Max (${unitName})`} value={lines.max} dot="bg-success" onStep={(d) => step("max", d)} />
                        <LineStepper label="Refill line" value={lines.refill} dot="bg-primary" onStep={(d) => step("refill", d)} />
                        <LineStepper label="Crit low" value={lines.critical} dot="bg-error" onStep={(d) => step("critical", d)} />
                    </div>
                    {error ? <p className="mb-2 text-[12px] font-medium text-error">{error}</p> : null}
                    <button
                        type="button"
                        onClick={save}
                        disabled={busy}
                        className="flex w-full items-center justify-center space-x-1.5 rounded-[12px] bg-inverse-surface px-3 py-2.5 text-[12px] font-bold text-inverse-on-surface shadow-sm active:scale-95 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[16px]">check</span>
                        <span>Assign to shelf</span>
                    </button>
                </>
            )}
        </section>
    );
}

function BinEditor({
    locationId,
    bin,
    canEdit,
    canRaiseRefill,
    canSetRoute,
    isShelf,
}: {
    locationId: number;
    isShelf: boolean;
    bin: ShelfBin;
    canEdit: boolean;
    canRaiseRefill: boolean;
    canSetRoute: boolean;
}): React.ReactElement {
    const style = STATUS[statusOf(bin)];
    const [editing, setEditing] = useState(false);
    const [mode, setMode] = useState<Mode>("max");
    const [unitId, setUnitId] = useState<number | null>(bin.unit.id);
    const { lines: band, step } = useLines({
        max: bin.band?.max ?? 10,
        refill: bin.band?.refill ?? 4,
        critical: bin.band?.critical ?? 2,
    });
    const [sources, setSources] = useState<RefillSource[]>(bin.route);
    const [busy, setBusy] = useState(false);

    const unit = bin.units.find((u) => u.id === unitId) ?? bin.unit;
    const inUnit = Math.round((bin.pieces / Math.max(1, unit.pieces)) * 10) / 10;
    const routeChanged = sources.join() !== bin.route.join();

    const save = (): void => {
        setBusy(true);
        router.patch(
            route("seller.locations.bands.update", { location: locationId, item: bin.item_id }),
            { item_packaging_type_id: unitId, max: band.max, refill: band.refill, critical: band.critical },
            { preserveScroll: true, onSuccess: () => setEditing(false), onFinish: () => setBusy(false) },
        );
    };

    const refill = (): void => {
        setBusy(true);
        router.post(route("seller.locations.bands.refill", { location: locationId, item: bin.item_id }), {}, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    const remove = (): void => {
        if (!window.confirm(`Take ${bin.name} off this shelf? Stock already here stays, shown as unassigned.`)) return;
        setBusy(true);
        router.delete(route("seller.locations.bands.destroy", { location: locationId, item: bin.item_id }), { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    const toggleSource = (source: RefillSource): void => {
        setSources((current) => {
            const next = current.includes(source) ? current.filter((s) => s !== source) : [...current, source];
            // Keep the canonical order; a route needs at least one source.
            return next.length ? SOURCES.filter((s) => next.includes(s)) : current;
        });
    };

    const saveRoute = (): void => {
        setBusy(true);
        router.put(route("seller.locations.routes.update", { location: locationId, item: bin.item_id }), { sources }, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    const value = editing ? band[mode] : inUnit;
    const gaugeMax = Math.max(1, band.max);

    return (
        <section className="mb-3 rounded-[24px] border border-primary/25 bg-gradient-to-b from-primary-container/25 to-surface-container-lowest px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-primary/20 pb-2.5">
                <div className="flex min-w-0 items-center space-x-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[15px] font-bold text-on-surface">Bin {bin.coord}</span>
                            <span className={`rounded-[999px] px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>{style.label}</span>
                        </div>
                        <p className="max-w-[200px] truncate text-[12px] font-medium text-on-surface-variant">{bin.name}</p>
                    </div>
                </div>
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => setEditing((e) => !e)}
                        className={`flex items-center space-x-1 rounded-[12px] px-2.5 py-1 text-[11px] font-semibold active:scale-95 ${editing ? "bg-surface-container-high text-on-surface-variant" : "bg-primary-container/80 text-primary"}`}
                    >
                        <span className="material-symbols-outlined text-[15px]">{editing ? "close" : bin.assigned ? "edit" : "add_box"}</span>
                        <span>{editing ? "Close" : bin.assigned ? "Edit lines" : "Assign"}</span>
                    </button>
                ) : null}
            </div>

            {!bin.assigned ? (
                <p className="mb-3 rounded-[12px] border border-warning/30 bg-warning-container/60 px-3 py-2 text-[11px] font-medium text-on-warning-container">
                    {bin.name} is on the shelf but has no bin. It is never refilled, and no more can be moved here, until a shelf manager assigns it.
                </p>
            ) : null}

            {editing ? (
                <div className="mb-3 grid grid-cols-3 gap-1 rounded-[12px] bg-surface-container p-1">
                    {([
                        ["max", "Max", "bg-success"],
                        ["refill", "Refill line", "bg-primary"],
                        ["critical", "Crit low", "bg-error"],
                    ] as Array<[Mode, string, string]>).map(([id, label, dot]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setMode(id)}
                            className={`flex items-center justify-center space-x-1 rounded-[8px] px-2 py-1.5 font-mono text-[10px] font-bold ${mode === id ? "border border-outline-variant/80 bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"}`}
                        >
                            <span className={`h-2 w-2 rounded-[2px] ${dot}`} />
                            <span className="truncate">{label}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="mb-3 flex flex-col items-center rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-sm">
                <div className="mb-3 flex w-full items-center justify-between px-1">
                    <div>
                        <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-outline">
                            {editing ? `Adjust ${mode === "critical" ? "crit low" : mode}` : "On the shelf"}
                        </span>
                        <span className="text-[13px] font-bold text-on-surface">{bin.display}</span>
                    </div>
                    <div className="flex items-baseline space-x-1 text-right">
                        <span className="font-mono text-[26px] font-black leading-none text-on-surface">{value}</span>
                        <span className="font-mono text-[12px] font-bold text-outline">/ {bin.band || editing ? band.max : "--"} {unit.name.toLowerCase()}</span>
                    </div>
                </div>

                <div className="flex w-full items-center justify-center gap-3">
                    <div className={`relative flex aspect-square w-44 shrink-0 flex-col justify-between overflow-hidden rounded-[16px] border-2 bg-surface-container-lowest p-3 shadow-md ${style.cell}`}>
                        <div className="absolute inset-y-0 left-0 w-3 bg-surface-container">
                            <div className={`absolute bottom-0 w-full ${style.bar}`} style={{ height: pct(inUnit / gaugeMax) }} />
                            {bin.band || editing ? (
                                <>
                                    <div className="absolute z-10 h-[2.5px] w-full bg-primary" style={{ bottom: pct(band.refill / gaugeMax) }} />
                                    <div className="absolute z-10 h-[2.5px] w-full bg-error" style={{ bottom: pct(band.critical / gaugeMax) }} />
                                </>
                            ) : null}
                        </div>
                        <div className="flex justify-end pr-0.5 font-mono text-[10px] font-bold leading-none text-outline">{bin.band || editing ? band.max : "--"}</div>
                        <div className="my-auto flex flex-col items-center justify-center pl-2">
                            <span className={`font-mono text-[34px] font-black leading-none tracking-tight ${style.text}`}>{inUnit}</span>
                            <span className={`mt-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide ${style.text}`}>{unit.name}</span>
                        </div>
                        <span className="truncate pl-2 text-center font-mono text-[11px] font-bold leading-none text-on-surface">{bin.short}</span>
                    </div>

                    {editing ? (
                        <div className="flex h-44 w-14 flex-col justify-between py-0.5">
                            <button type="button" aria-label="Increase" onClick={() => step(mode, 1)} className="flex h-16 w-full flex-col items-center justify-center rounded-[16px] border-2 border-outline-variant bg-surface-container-lowest text-on-surface shadow-sm active:scale-95">
                                <span className="material-symbols-outlined text-[26px]">add</span>
                                <span className="font-mono text-[9px] font-bold leading-none text-outline">+1</span>
                            </button>
                            <span className="block truncate rounded-[4px] bg-surface-container px-1.5 py-0.5 text-center font-mono text-[9px] font-bold uppercase text-on-surface-variant">{mode}</span>
                            <button type="button" aria-label="Decrease" onClick={() => step(mode, -1)} className="flex h-16 w-full flex-col items-center justify-center rounded-[16px] border-2 border-outline-variant bg-surface-container-lowest text-on-surface shadow-sm active:scale-95">
                                <span className="material-symbols-outlined text-[26px]">remove</span>
                                <span className="font-mono text-[9px] font-bold leading-none text-outline">-1</span>
                            </button>
                        </div>
                    ) : null}
                </div>

                {editing ? (
                    <div className="mt-3 flex w-full items-center gap-2 border-t border-outline-variant/60 pt-3">
                        <label className="font-mono text-[10px] font-bold uppercase text-outline" htmlFor={`unit-${bin.item_id}`}>Counted in</label>
                        <select
                            id={`unit-${bin.item_id}`}
                            value={unitId ?? ""}
                            onChange={(e) => setUnitId(e.target.value === "" ? null : Number(e.target.value))}
                            className="flex-1 rounded-[8px] border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono text-[11px] font-bold"
                        >
                            {bin.units.map((u) => (
                                <option key={`${u.id}-${u.name}`} value={u.id ?? ""}>
                                    {u.name} ({u.pieces} pcs)
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
            </div>

            {bin.band || editing ? (
                <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-[12px] border border-outline-variant/60 bg-surface-container-lowest p-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-on-surface-variant">
                            <span>Refill line</span>
                            <span className="material-symbols-outlined text-[15px] text-primary">arrow_downward</span>
                        </div>
                        <span className="font-mono text-[14px] font-bold text-primary">{band.refill}</span>
                        <span className="ml-1 font-mono text-[11px] text-on-surface-variant">{unit.name.toLowerCase()}</span>
                    </div>
                    <div className="rounded-[12px] border border-error/20 bg-error-container/10 p-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-error">
                            <span>Crit low alert</span>
                            <span className="material-symbols-outlined text-[15px]">error</span>
                        </div>
                        <span className="font-mono text-[14px] font-bold text-error">{band.critical}</span>
                        <span className="ml-1 font-mono text-[11px] text-error">{unit.name.toLowerCase()}</span>
                    </div>
                </div>
            ) : null}

            {bin.refills.length ? (
                <div className="mb-3 rounded-[12px] border border-info/20 bg-info-container/25 p-2.5">
                    <div className="mb-1.5 flex items-center space-x-1.5 text-[11px] font-bold uppercase tracking-wider text-on-info-container">
                        <span className="material-symbols-outlined text-[15px]">local_shipping</span>
                        <span>Refill on its way</span>
                    </div>
                    <ul className="space-y-1">
                        {bin.refills.map((leg) => (
                            <li key={leg.id} className="flex items-center justify-between text-[12px]">
                                <span className="flex min-w-0 items-center space-x-1.5">
                                    {leg.urgent ? <span className="material-symbols-outlined text-[14px] text-error">priority_high</span> : null}
                                    <span className="truncate font-medium text-on-surface">{leg.display}</span>
                                    <span className="shrink-0 text-on-surface-variant">from {SOURCE_LABEL[leg.source]}</span>
                                </span>
                                {leg.awaits_hub ? (
                                    <span className="ml-2 shrink-0 rounded-[999px] bg-info-container px-2 py-0.5 text-[10px] font-bold text-on-info-container">Hub to accept</span>
                                ) : (
                                    <span className={`ml-2 shrink-0 rounded-[999px] px-2 py-0.5 text-[10px] font-bold ${LEG_STATUS[leg.status].chip}`}>{LEG_STATUS[leg.status].label}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {bin.assigned && isShelf ? (
                <div className="mb-3 rounded-[12px] border border-outline-variant/60 bg-surface-container-lowest p-2.5">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Refilled from</div>
                    <div className="flex flex-wrap gap-1.5">
                        {SOURCES.map((source) => {
                            const on = sources.includes(source);
                            return canSetRoute ? (
                                <button
                                    key={source}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleSource(source)}
                                    className={`flex items-center space-x-1 rounded-[999px] border px-2.5 py-1 text-[11px] font-semibold active:scale-95 ${on ? "border-inverse-surface bg-inverse-surface text-inverse-on-surface" : "border-outline-variant bg-surface-container-lowest text-outline line-through"}`}
                                >
                                    <span>{SOURCE_LABEL[source]}</span>
                                </button>
                            ) : (
                                <span key={source} className={`rounded-[999px] border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-outline/50 bg-surface-container-low text-on-surface" : "border-outline-variant/60 text-outline line-through"}`}>
                                    {SOURCE_LABEL[source]}
                                </span>
                            );
                        })}
                        {canSetRoute && routeChanged ? (
                            <button type="button" onClick={saveRoute} disabled={busy} className="rounded-[999px] bg-primary px-2.5 py-1 text-[11px] font-bold text-on-primary active:scale-95 disabled:opacity-40">
                                Save route
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {canRaiseRefill || canEdit ? (
                <div className="flex items-center space-x-2">
                    {canRaiseRefill ? (
                        <button
                            type="button"
                            onClick={refill}
                            disabled={busy || !bin.assigned}
                            title={!bin.assigned ? "Assign the item first" : undefined}
                            className="flex flex-1 items-center justify-center space-x-1.5 rounded-[12px] bg-primary px-3 py-2.5 text-[12px] font-bold text-on-primary shadow-sm active:scale-95 disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                            <span>Request refill</span>
                        </button>
                    ) : null}
                    {canEdit && bin.assigned && !editing ? (
                        <button
                            type="button"
                            onClick={remove}
                            disabled={busy}
                            aria-label={`Take ${bin.name} off this shelf`}
                            className="flex items-center justify-center rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-[12px] font-bold text-on-surface-variant active:scale-95 disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    ) : null}
                    {canEdit && editing ? (
                        <button
                            type="button"
                            onClick={save}
                            disabled={busy}
                            className="flex flex-1 items-center justify-center space-x-1.5 rounded-[12px] bg-inverse-surface px-5 py-2.5 text-[12px] font-bold text-inverse-on-surface shadow-sm active:scale-95 disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            <span>{bin.assigned ? "Save" : "Assign to shelf"}</span>
                        </button>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
