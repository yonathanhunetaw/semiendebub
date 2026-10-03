import type { ShelfBin, ShelfMatrixData } from "@/types/sellerLocations";
import { router } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

/** Literal class strings so the JIT compiler keeps them. */
const STATUS: Record<ShelfBin["status"], { bar: string; text: string; cell: string; badge: string; label: string }> = {
    ok: { bar: "bg-[#047857]", text: "text-emerald-900", cell: "border-emerald-600/30 bg-white", badge: "bg-emerald-100 text-emerald-800", label: "Normal" },
    refill: { bar: "bg-[#c2410c]", text: "text-[#c2410c]", cell: "border-[#c2410c]/40 bg-orange-50/40", badge: "bg-orange-100 text-[#c2410c]", label: "Refill soon" },
    critical: { bar: "bg-[#e11d48]", text: "text-rose-700", cell: "border-rose-400 bg-rose-50/40", badge: "bg-rose-100 text-[#e11d48]", label: "Crit low" },
    empty: { bar: "bg-slate-300", text: "text-slate-400", cell: "border-dashed border-slate-300 bg-slate-100/50", badge: "bg-slate-100 text-slate-600", label: "Empty" },
};

type Mode = "max" | "refill" | "critical";

const pct = (value: number): string => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

/**
 * A Store Shelf as bins: one item per bin, A–E across and 1–10 down, fifty to
 * a tier. Each bin fills with what is on the shelf; the orange line is the
 * refill point and the red line is critical, both set per item in one of its
 * pack units. Tapping a bin opens its editor below.
 */
export default function ShelfBinMatrix({
    locationId,
    matrix,
    canEdit,
}: {
    locationId: number;
    matrix: ShelfMatrixData;
    canEdit: boolean;
}): React.ReactElement {
    const [activeId, setActiveId] = useState<number | null>(matrix.bins[0]?.item_id ?? null);

    useEffect(() => {
        if (!matrix.bins.some((bin) => bin.item_id === activeId)) {
            setActiveId(matrix.bins[0]?.item_id ?? null);
        }
    }, [matrix.bins, activeId]);

    const active = useMemo(() => matrix.bins.find((bin) => bin.item_id === activeId) ?? null, [matrix.bins, activeId]);
    const cells: Array<ShelfBin | null> = Array.from({ length: matrix.columns.length * matrix.rows }, (_, i) => matrix.bins[i] ?? null);

    const goTier = (tier: number): void => {
        const next = tier < 1 ? matrix.tiers : tier > matrix.tiers ? 1 : tier;
        router.get(route("seller.locations.show", locationId), { tier: next }, { preserveScroll: true, preserveState: true, only: ["matrix"] });
    };

    const occupancy = matrix.totals.items > 0 ? (matrix.totals.occupied / matrix.totals.items) * 100 : 0;

    return (
        <>
            <section className="mb-3 rounded-[24px] bg-white px-4 pb-4 pt-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[20px] font-bold tracking-tight text-slate-900">Replenishment</h2>
                    <div className="flex items-center space-x-1 rounded-[12px] bg-slate-100 p-1">
                        <button type="button" aria-label="Previous tier" onClick={() => goTier(matrix.tier - 1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white text-slate-700 shadow-sm active:scale-95">
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <div className="min-w-[70px] px-2 text-center">
                            <span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400">Tier</span>
                            <span className="font-mono text-[14px] font-bold leading-none text-[#c2410c]">
                                {String(matrix.tier).padStart(2, "0")} / {String(matrix.tiers).padStart(2, "0")}
                            </span>
                        </div>
                        <button type="button" aria-label="Next tier" onClick={() => goTier(matrix.tier + 1)} className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white text-slate-700 shadow-sm active:scale-95">
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>
                </div>

                <div className="mb-3 flex items-center justify-between rounded-[12px] border border-slate-100 bg-[#f8fafc] px-3 py-1.5 text-[11px]">
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#047857]" /><span className="font-medium text-slate-700">On shelf</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#c2410c]" /><span className="font-medium text-slate-700">Refill line</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#e11d48]" /><span className="font-bold text-[#e11d48]">Crit low</span></span>
                    <span className="flex items-center space-x-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-slate-200" /><span className="font-medium text-slate-400">Empty</span></span>
                </div>

                <div className="mx-auto w-full max-w-[360px] pb-1">
                    <div className="mb-1 flex items-center pl-5 pr-1 font-mono text-[11px] font-bold text-slate-400">
                        {matrix.columns.map((column) => (
                            <div key={column} className="flex-1 text-center">{column}</div>
                        ))}
                    </div>
                    <div className="flex space-x-1">
                        <div className="flex w-4 select-none flex-col justify-between py-1 text-center font-mono text-[11px] font-bold text-slate-400">
                            {Array.from({ length: matrix.rows }, (_, r) => (
                                <div key={r} className="flex h-8 items-center justify-center">{r + 1}</div>
                            ))}
                        </div>
                        <div className="grid flex-1 grid-cols-5 gap-1.5 rounded-[16px] border border-slate-200 bg-[#f8fafc] p-1.5">
                            {cells.map((bin, index) => (bin ? (
                                <Bin key={bin.item_id} bin={bin} selected={bin.item_id === activeId} onSelect={() => setActiveId(bin.item_id)} />
                            ) : (
                                <div key={`open-${index}`} className="aspect-square rounded-[6px] border border-dashed border-slate-200 bg-white/40" />
                            )))}
                        </div>
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
                                className={i + 1 === matrix.tier ? "h-2 w-7 rounded-[999px] bg-[#c2410c]" : "h-2 w-2 rounded-[999px] bg-slate-300 hover:bg-slate-400"}
                            />
                        ))}
                    </div>
                    <p className="text-center font-mono text-[11px] tracking-wide text-slate-500">
                        Tier {matrix.tier} of {matrix.tiers} · {matrix.totals.items} item{matrix.totals.items === 1 ? "" : "s"} on this shelf
                    </p>
                </div>
            </section>

            {active ? <BinEditor key={active.item_id} locationId={locationId} bin={active} canEdit={canEdit} /> : (
                <section className="mb-3 rounded-[24px] bg-white px-4 py-5 text-center shadow-sm">
                    <span className="material-symbols-outlined text-[28px] text-slate-300">shelves</span>
                    <p className="mt-1 text-[13px] font-bold text-slate-900">Nothing on this shelf yet</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Move stock here from the store floor with a transfer, then set each item&apos;s band.</p>
                </section>
            )}

            <section className="mb-3 rounded-[24px] bg-white px-4 py-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[15px] font-bold uppercase text-slate-900">Shelf summary</h3>
                    <span className="font-mono text-[12px] text-slate-500">
                        <span className="font-bold text-slate-900">{matrix.totals.pieces.toLocaleString()}</span> pieces
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[16px] border border-slate-100 bg-[#f8fafc] p-3">
                        <div className="mb-1 flex items-center space-x-1.5 text-slate-500">
                            <span className="material-symbols-outlined text-[16px] text-[#047857]">inventory_2</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Occupancy</span>
                        </div>
                        <div className="text-[20px] font-bold leading-tight text-slate-900">{occupancy.toFixed(1)}%</div>
                        <p className="mt-0.5 text-[11px] text-slate-500">{matrix.totals.occupied} stocked · {matrix.totals.items - matrix.totals.occupied} empty</p>
                    </div>
                    <div className="rounded-[16px] border border-slate-100 bg-[#f8fafc] p-3">
                        <div className="mb-1 flex items-center space-x-1.5 text-slate-500">
                            <span className="material-symbols-outlined text-[16px] text-[#c2410c]">priority_high</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Refill queue</span>
                        </div>
                        <div className="text-[20px] font-bold leading-tight text-[#c2410c]">{matrix.totals.refill_queue} items</div>
                        <p className="mt-0.5 text-[11px] text-slate-500">{matrix.totals.critical} critical · {matrix.totals.banded} with a band</p>
                    </div>
                </div>
            </section>
        </>
    );
}

function Bin({ bin, selected, onSelect }: { bin: ShelfBin; selected: boolean; onSelect: () => void }): React.ReactElement {
    const style = STATUS[bin.status];
    const unitMax = bin.band?.max ?? null;

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${bin.coord}: ${bin.name}, ${bin.display}`}
            aria-pressed={selected}
            className={`relative flex aspect-square flex-col justify-between overflow-hidden rounded-[6px] border p-1 text-left transition-all active:scale-95 ${style.cell} ${
                selected ? "z-20 scale-[1.04] border-[#c2410c] shadow-[0_0_0_2px_#c2410c] bg-orange-50" : ""
            }`}
        >
            <div className="absolute inset-y-0 left-0 w-1 bg-slate-200">
                <div className={`absolute bottom-0 w-full ${style.bar}`} style={{ height: pct(bin.fill) }} />
                {bin.band && bin.band.max > 0 ? (
                    <>
                        <div className="absolute z-10 h-px w-full bg-[#c2410c]" style={{ bottom: pct(bin.band.refill / bin.band.max) }} />
                        <div className="absolute z-10 h-px w-full bg-[#e11d48]" style={{ bottom: pct(bin.band.critical / bin.band.max) }} />
                    </>
                ) : null}
            </div>
            <div className="flex justify-end pr-0.5 font-mono text-[7px] font-semibold leading-none text-slate-400">{unitMax ?? "--"}</div>
            <div className="my-auto flex flex-col items-center justify-center pl-1">
                <span className={`font-mono text-[13px] font-bold leading-none ${style.text}`}>{bin.in_unit}</span>
                <span className={`mt-0.5 truncate font-mono text-[7px] leading-none ${style.text}`}>{bin.unit.name.slice(0, 4).toLowerCase()}</span>
            </div>
            <span className="truncate pl-1 text-center font-mono text-[7.5px] font-semibold leading-none text-slate-800">{bin.short}</span>
        </button>
    );
}

function BinEditor({ locationId, bin, canEdit }: { locationId: number; bin: ShelfBin; canEdit: boolean }): React.ReactElement {
    const style = STATUS[bin.status];
    const [editing, setEditing] = useState(false);
    const [mode, setMode] = useState<Mode>("max");
    const [unitId, setUnitId] = useState<number | null>(bin.unit.id);
    const [band, setBand] = useState({
        max: bin.band?.max ?? 10,
        refill: bin.band?.refill ?? 4,
        critical: bin.band?.critical ?? 2,
    });
    const [busy, setBusy] = useState(false);

    const unit = bin.units.find((u) => u.id === unitId) ?? bin.unit;
    const inUnit = Math.round((bin.pieces / Math.max(1, unit.pieces)) * 10) / 10;

    const step = (delta: number): void => {
        setBand((current) => {
            const next = { ...current, [mode]: Math.max(0, current[mode] + delta) };
            // Keep the lines in order: critical ≤ refill ≤ max.
            if (mode === "max") next.max = Math.max(1, next.max, next.refill);
            if (mode === "refill") next.refill = Math.min(Math.max(next.refill, next.critical), next.max);
            if (mode === "critical") next.critical = Math.min(next.critical, next.refill);
            return next;
        });
    };

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

    const value = editing ? band[mode] : inUnit;
    const gaugeMax = Math.max(1, band.max);

    return (
        <section className="mb-3 rounded-[24px] border border-orange-200/80 bg-gradient-to-b from-orange-50/40 to-white px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-orange-100 pb-2.5">
                <div className="flex min-w-0 items-center space-x-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#c2410c] text-white shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[15px] font-bold text-slate-900">Bin {bin.coord}</span>
                            <span className={`rounded-[999px] px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>{style.label}</span>
                        </div>
                        <p className="max-w-[200px] truncate text-[12px] font-medium text-slate-600">{bin.name}</p>
                    </div>
                </div>
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => setEditing((e) => !e)}
                        className={`flex items-center space-x-1 rounded-[12px] px-2.5 py-1 text-[11px] font-semibold active:scale-95 ${editing ? "bg-slate-200 text-slate-700" : "bg-orange-100/80 text-[#c2410c]"}`}
                    >
                        <span className="material-symbols-outlined text-[15px]">{editing ? "close" : "edit"}</span>
                        <span>{editing ? "Close" : "Edit band"}</span>
                    </button>
                ) : null}
            </div>

            {editing ? (
                <div className="mb-3 grid grid-cols-3 gap-1 rounded-[12px] bg-slate-100 p-1">
                    {([
                        ["max", "Max", "bg-[#047857]"],
                        ["refill", "Refill line", "bg-[#c2410c]"],
                        ["critical", "Crit low", "bg-[#e11d48]"],
                    ] as Array<[Mode, string, string]>).map(([id, label, dot]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setMode(id)}
                            className={`flex items-center justify-center space-x-1 rounded-[8px] px-2 py-1.5 font-mono text-[10px] font-bold ${mode === id ? "border border-slate-200/80 bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                        >
                            <span className={`h-2 w-2 rounded-[2px] ${dot}`} />
                            <span className="truncate">{label}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="mb-3 flex flex-col items-center rounded-[16px] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex w-full items-center justify-between px-1">
                    <div>
                        <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {editing ? `Adjust ${mode === "critical" ? "crit low" : mode}` : "On the shelf"}
                        </span>
                        <span className="text-[13px] font-bold text-slate-900">{bin.display}</span>
                    </div>
                    <div className="flex items-baseline space-x-1 text-right">
                        <span className="font-mono text-[26px] font-black leading-none text-slate-900">{value}</span>
                        <span className="font-mono text-[12px] font-bold text-slate-400">/ {band.max} {unit.name.toLowerCase()}</span>
                    </div>
                </div>

                <div className="flex w-full items-center justify-center gap-3">
                    <div className={`relative flex aspect-square w-44 shrink-0 flex-col justify-between overflow-hidden rounded-[16px] border-2 bg-white p-3 shadow-md ${style.cell}`}>
                        <div className="absolute inset-y-0 left-0 w-3 bg-slate-100">
                            <div className={`absolute bottom-0 w-full ${style.bar}`} style={{ height: pct(inUnit / gaugeMax) }} />
                            <div className="absolute z-10 h-[2.5px] w-full bg-[#c2410c]" style={{ bottom: pct(band.refill / gaugeMax) }} />
                            <div className="absolute z-10 h-[2.5px] w-full bg-[#e11d48]" style={{ bottom: pct(band.critical / gaugeMax) }} />
                        </div>
                        <div className="flex justify-end pr-0.5 font-mono text-[10px] font-bold leading-none text-slate-400">{band.max}</div>
                        <div className="my-auto flex flex-col items-center justify-center pl-2">
                            <span className={`font-mono text-[34px] font-black leading-none tracking-tight ${style.text}`}>{inUnit}</span>
                            <span className={`mt-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide ${style.text}`}>{unit.name}</span>
                        </div>
                        <span className="truncate pl-2 text-center font-mono text-[11px] font-bold leading-none text-slate-800">{bin.short}</span>
                    </div>

                    {editing ? (
                        <div className="flex h-44 w-14 flex-col justify-between py-0.5">
                            <button type="button" aria-label="Increase" onClick={() => step(1)} className="flex h-16 w-full flex-col items-center justify-center rounded-[16px] border-2 border-slate-200 bg-white text-slate-900 shadow-sm active:scale-95">
                                <span className="material-symbols-outlined text-[26px]">add</span>
                                <span className="font-mono text-[9px] font-bold leading-none text-slate-400">+1</span>
                            </button>
                            <span className="block truncate rounded-[4px] bg-slate-100 px-1.5 py-0.5 text-center font-mono text-[9px] font-bold uppercase text-slate-600">{mode}</span>
                            <button type="button" aria-label="Decrease" onClick={() => step(-1)} className="flex h-16 w-full flex-col items-center justify-center rounded-[16px] border-2 border-slate-200 bg-white text-slate-900 shadow-sm active:scale-95">
                                <span className="material-symbols-outlined text-[26px]">remove</span>
                                <span className="font-mono text-[9px] font-bold leading-none text-slate-400">-1</span>
                            </button>
                        </div>
                    ) : null}
                </div>

                {editing ? (
                    <div className="mt-3 flex w-full items-center gap-2 border-t border-slate-100 pt-3">
                        <label className="font-mono text-[10px] font-bold uppercase text-slate-400" htmlFor={`unit-${bin.item_id}`}>Counted in</label>
                        <select
                            id={`unit-${bin.item_id}`}
                            value={unitId ?? ""}
                            onChange={(e) => setUnitId(e.target.value === "" ? null : Number(e.target.value))}
                            className="flex-1 rounded-[8px] border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] font-bold"
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

            <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-[12px] border border-slate-100 bg-white p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-700">
                        <span>Refill line</span>
                        <span className="material-symbols-outlined text-[15px] text-[#c2410c]">arrow_downward</span>
                    </div>
                    <span className="font-mono text-[14px] font-bold text-[#c2410c]">{band.refill}</span>
                    <span className="ml-1 font-mono text-[11px] text-slate-500">{unit.name.toLowerCase()}</span>
                </div>
                <div className="rounded-[12px] border border-rose-100 bg-rose-50/20 p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[#e11d48]">
                        <span>Crit low alert</span>
                        <span className="material-symbols-outlined text-[15px]">error</span>
                    </div>
                    <span className="font-mono text-[14px] font-bold text-[#e11d48]">{band.critical}</span>
                    <span className="ml-1 font-mono text-[11px] text-[#e11d48]">{unit.name.toLowerCase()}</span>
                </div>
            </div>

            {canEdit ? (
                <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        onClick={refill}
                        disabled={busy || bin.band === null}
                        title={bin.band === null ? "Set a band first" : undefined}
                        className="flex flex-1 items-center justify-center space-x-1.5 rounded-[12px] bg-[#c2410c] px-3 py-2.5 text-[12px] font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                        <span>Request refill</span>
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={busy || !editing}
                        className="flex items-center justify-center space-x-1.5 rounded-[12px] bg-slate-900 px-5 py-2.5 text-[12px] font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[16px]">check</span>
                        <span>Save</span>
                    </button>
                </div>
            ) : null}
        </section>
    );
}
