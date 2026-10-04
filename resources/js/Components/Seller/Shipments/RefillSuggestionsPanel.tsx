import type { RefillRow, ReplenishmentPanel } from "@/types/refills";
import { router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Refill requests waiting to be put on a manifest — raised by stock keepers or
 * automatically at a bin's refill line. Sits above the shipment's manifest.
 * The store manager ticks what goes on this run, may change each amount, and
 * adds them; what is left reappears on the next manifest.
 */
export default function RefillSuggestionsPanel({ shipmentId, panel }: { shipmentId: number; panel: ReplenishmentPanel }): React.ReactElement | null {
    const [picked, setPicked] = useState<Record<number, number>>({});
    const [busy, setBusy] = useState(false);

    if (panel.suggestions.length === 0) {
        return null;
    }

    const toggle = (row: RefillRow): void =>
        setPicked((current) => {
            const next = { ...current };
            if (row.id in next) delete next[row.id];
            else next[row.id] = row.quantity;
            return next;
        });

    const setAmount = (id: number, value: number): void => setPicked((current) => ({ ...current, [id]: Math.max(1, value) }));

    const add = (): void => {
        const ids = Object.keys(picked).map(Number);
        if (ids.length === 0) return;
        setBusy(true);
        router.post(
            route("seller.refills.manifest", shipmentId),
            {
                lines: ids.map((id) => {
                    const row = panel.suggestions.find((r) => r.id === id);
                    return { id, quantity: row && picked[id] !== row.quantity ? picked[id] : null };
                }),
            },
            { preserveScroll: true, onSuccess: () => setPicked({}), onFinish: () => setBusy(false) },
        );
    };

    const count = Object.keys(picked).length;

    return (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-900">Requested refills ({panel.suggestions.length})</p>
                    <p className="text-[10px] text-slate-400">From stock keepers and the shelf&apos;s refill line. Tick what goes on this run.</p>
                </div>
                {panel.can_add ? (
                    <button
                        type="button"
                        onClick={add}
                        disabled={busy || count === 0}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#c2410c] text-white text-[12px] font-bold active:scale-95 transition-transform shrink-0 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                        Add {count || ""} to manifest
                    </button>
                ) : null}
            </div>
            {!panel.manifest_open ? (
                <p className="mb-2 text-[11px] text-slate-500">The manifest is locked once picking has started; these wait for the next run.</p>
            ) : null}

            <ul className="mt-2 space-y-2">
                {panel.suggestions.map((row) => {
                    const on = row.id in picked;
                    const canAdjust = row.can.update;

                    return (
                        <li key={row.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${on ? "border-[#c2410c] bg-orange-50/50" : "border-slate-100 bg-slate-50/50"}`}>
                            {panel.can_add && row.can.add_to_manifest ? (
                                <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggle(row)}
                                    aria-label={`Add ${row.item_name} to this manifest`}
                                    className="h-4 w-4 rounded border-slate-300 text-[#c2410c] focus:ring-[#c2410c]"
                                />
                            ) : null}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[12px] font-bold text-gray-900">{row.item_name}</span>
                                    {row.urgent ? <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[9px] font-bold text-red-700">Crit low</span> : null}
                                </div>
                                <p className="text-[10px] text-slate-500 truncate">
                                    {row.requested_display} for {row.target?.name ?? "the shelf"} ·{" "}
                                    {row.origin === "manual" ? `asked by ${row.raised_by ?? "a stock keeper"}` : "raised automatically"}
                                </p>
                            </div>
                            {on ? (
                                <label className="flex items-center gap-1 text-[11px] text-slate-600 shrink-0">
                                    <input
                                        type="number"
                                        min={1}
                                        value={picked[row.id]}
                                        disabled={!canAdjust}
                                        title={canAdjust ? undefined : "You may add it, but not change the amount"}
                                        onChange={(e) => setAmount(row.id, Number(e.target.value) || 1)}
                                        className="w-16 rounded-lg border border-slate-200 px-1.5 py-1 text-[12px] disabled:bg-slate-100"
                                    />
                                    <span>{row.unit.toLowerCase()}</span>
                                </label>
                            ) : (
                                <span className="text-[11px] font-mono font-bold text-slate-700 shrink-0">
                                    {row.quantity} {row.unit.toLowerCase()}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
