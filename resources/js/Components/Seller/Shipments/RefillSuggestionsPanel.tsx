import type { ReplenishmentPanel } from "@/types/refills";
import { router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Items that need refilling, offered above the shipment's manifest. Critically
 * low items come first. A suggestion names only the item: the amount is worked
 * out by the refill engine (what it takes to fill the bin back up, less what is
 * already on its way), and lands on the manifest when the manager taps Add. The
 * suggestion, and the alert behind it, then clear. The manager can still change
 * the amount on the manifest line.
 */
export default function RefillSuggestionsPanel({ shipmentId, panel }: { shipmentId: number; panel: ReplenishmentPanel }): React.ReactElement | null {
    const [busyIds, setBusyIds] = useState<number[]>([]);

    if (panel.suggestions.length === 0) {
        return null;
    }

    const send = (ids: number[]): void => {
        if (ids.length === 0) return;
        setBusyIds((current) => [...current, ...ids]);
        router.post(
            route("seller.refills.manifest", shipmentId),
            { lines: ids.map((id) => ({ id, quantity: null })) },
            {
                preserveScroll: true,
                onFinish: () => setBusyIds((current) => current.filter((id) => !ids.includes(id))),
            },
        );
    };

    const addable = panel.suggestions.filter((row) => panel.can_add && row.can.add_to_manifest);
    const critical = panel.suggestions.filter((row) => row.urgent).length;

    return (
        <div className="bg-surface-container-lowest rounded-2xl border border-primary/30 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-on-surface">
                        Suggested for this run ({panel.suggestions.length})
                    </p>
                    <p className="text-[10px] text-outline">
                        {critical > 0 ? `${critical} critically low · ` : ""}Add one to put the amount that fills its gap on the list.
                    </p>
                </div>
                {addable.length > 1 ? (
                    <button
                        type="button"
                        onClick={() => send(addable.map((row) => row.id))}
                        disabled={addable.every((row) => busyIds.includes(row.id))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-[12px] font-bold active:scale-95 transition-transform shrink-0 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                        Add all
                    </button>
                ) : null}
            </div>
            {!panel.manifest_open ? (
                <p className="mb-2 text-[11px] text-on-surface-variant">The manifest is locked once picking has started; these wait for the next run.</p>
            ) : null}

            <ul className="mt-2 space-y-2">
                {panel.suggestions.map((row) => {
                    const canAdd = panel.can_add && row.can.add_to_manifest;

                    return (
                        <li
                            key={row.id}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${row.urgent ? "border-error/40 bg-error-container/20" : "border-outline-variant/60 bg-surface-container-low/50"}`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[12px] font-bold text-on-surface">{row.item_name}</span>
                                    {row.urgent ? (
                                        <span className="shrink-0 rounded-full bg-error-container px-1.5 text-[9px] font-bold text-on-error-container">Crit low</span>
                                    ) : (
                                        <span className="shrink-0 rounded-full bg-warning-container px-1.5 text-[9px] font-bold text-on-warning-container">Refill</span>
                                    )}
                                </div>
                                <p className="text-[10px] text-on-surface-variant truncate">for {row.target?.name ?? "the shelf"}</p>
                            </div>
                            {canAdd ? (
                                <button
                                    type="button"
                                    onClick={() => send([row.id])}
                                    disabled={busyIds.includes(row.id)}
                                    aria-label={`Add ${row.item_name} to the list`}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-[12px] font-bold active:scale-95 transition-transform shrink-0 disabled:opacity-40"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    Add
                                </button>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
