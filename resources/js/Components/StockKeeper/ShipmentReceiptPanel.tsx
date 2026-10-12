import { router } from "@inertiajs/react";
import React from "react";
import ScanSheet from "@/Components/StockKeeper/ScanSheet";
import type { ShipmentLine } from "@/types/shipment";

/**
 * Count what arrived, line by line, before signing a shipment in.
 *
 * Arrived starts at what was sent; change it, or count by scanning (each scan
 * adds one to its line). Damaged units are part of what arrived. On signing,
 * what arrived lands, damage is written off, and any shortfall stays with the
 * courier as a discrepancy under Receiving.
 */
export default function ShipmentReceiptPanel({ shipmentId, lines }: { shipmentId: number; lines: ShipmentLine[] }) {
    const sent = (line: ShipmentLine) => (line.picked_quantity > 0 ? line.picked_quantity : line.quantity);
    const initial = () =>
        Object.fromEntries(
            lines.map((line) => [
                line.variant_id,
                {
                    received: String(line.received_quantity ?? sent(line)),
                    damaged: String(line.damaged_quantity ?? 0),
                    note: line.receipt_note ?? "",
                },
            ]),
        ) as Record<number, { received: string; damaged: string; note: string }>;

    const [counts, setCounts] = React.useState(initial);
    const [scanning, setScanning] = React.useState(false);
    const [lastScan, setLastScan] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const saved = lines.some((line) => line.received_quantity !== null && line.received_quantity !== undefined);

    const set = (id: number, key: "received" | "damaged" | "note", value: string) => setCounts((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));

    const startScanning = () => {
        // Scanning counts from zero.
        setCounts((all) => Object.fromEntries(Object.entries(all).map(([id, c]) => [id, { ...c, received: "0" }])));
        setLastScan(null);
        setScanning(true);
    };

    const onScan = (code: string) => {
        const line = lines.find((l) => l.barcode === code || l.sku === code);
        if (!line) {
            setLastScan(`${code} is not on this shipment`);
            return;
        }
        setCounts((all) => {
            const next = Number(all[line.variant_id]?.received || 0) + 1;
            setLastScan(`${line.name}: ${next}`);
            return { ...all, [line.variant_id]: { ...all[line.variant_id], received: String(next) } };
        });
    };

    const save = () => {
        setSaving(true);
        router.post(
            route("stock_keeper.shipments.receipt", shipmentId),
            {
                lines: lines.map((line) => ({
                    item_variant_id: line.variant_id,
                    received: Number(counts[line.variant_id]?.received || 0),
                    damaged: Number(counts[line.variant_id]?.damaged || 0),
                    note: counts[line.variant_id]?.note || null,
                })),
            },
            { preserveScroll: true, onFinish: () => setSaving(false) },
        );
    };

    const short = lines.reduce((sum, line) => sum + Math.max(0, sent(line) - Number(counts[line.variant_id]?.received || 0)), 0);
    const damaged = lines.reduce((sum, line) => sum + Number(counts[line.variant_id]?.damaged || 0), 0);

    return (
        <section className="mb-5 overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
            <header className="flex flex-col gap-2 border-b border-outline-variant/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-on-surface">
                        <span className="material-symbols-outlined text-[22px] text-primary">move_to_inbox</span>
                        Count what arrived
                    </h2>
                    <p className="text-[13px] text-on-surface-variant">Before signing in. Any difference is logged under Receiving.</p>
                </div>
                <button type="button" onClick={startScanning} className="flex items-center justify-center gap-1.5 rounded-[12px] border border-primary px-3 py-2 text-[13px] font-bold text-primary hover:bg-primary-container/40">
                    <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                    Count by scanning
                </button>
            </header>

            <ul className="divide-y divide-outline-variant/60">
                {lines.map((line) => {
                    const c = counts[line.variant_id];
                    const diff = Number(c?.received || 0) - sent(line);
                    return (
                        <li key={line.id} className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <div className="min-w-0">
                                <p className="truncate text-[14px] font-bold text-on-surface">{line.name}</p>
                                <p className="truncate text-[12px] text-on-surface-variant">
                                    <span className="font-mono">{line.sku ?? "—"}</span> · sent {sent(line)} {line.unit ?? ""}
                                    {diff !== 0 && <b className={diff < 0 ? "text-error" : "text-info"}> · {diff > 0 ? `+${diff}` : diff}</b>}
                                </p>
                            </div>
                            <div className="flex items-end gap-2">
                                {(["received", "damaged"] as const).map((key) => (
                                    <label key={key} className="block">
                                        <span className="mb-0.5 block text-[11px] font-bold uppercase text-on-surface-variant">{key === "received" ? "Arrived" : "Damaged"}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            inputMode="numeric"
                                            value={c?.received !== undefined ? c[key] : ""}
                                            onChange={(e) => set(line.variant_id, key, e.target.value)}
                                            className={`h-10 w-20 rounded-[10px] border bg-surface-container-low px-2 text-center text-[16px] font-extrabold tabular-nums focus:ring-0 ${key === "damaged" && Number(c?.damaged) > 0 ? "border-warning" : "border-outline-variant focus:border-primary"}`}
                                        />
                                    </label>
                                ))}
                                <input
                                    value={c?.note ?? ""}
                                    onChange={(e) => set(line.variant_id, "note", e.target.value)}
                                    placeholder="Note"
                                    aria-label={`Note for ${line.name}`}
                                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 text-[13px] focus:border-primary focus:ring-0 sm:w-36 sm:flex-none"
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>

            <footer className="flex flex-col gap-2 border-t border-outline-variant/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-on-surface-variant">
                    {short === 0 && damaged === 0 ? "Everything sent has arrived." : `${short} missing · ${damaged} damaged`}
                    {saved ? " · count saved" : ""}
                </p>
                <button type="button" onClick={save} disabled={saving} className="rounded-[12px] bg-primary px-5 py-2.5 text-[14px] font-bold text-on-primary shadow-sm disabled:opacity-60">
                    Save count
                </button>
            </footer>

            <ScanSheet open={scanning} onClose={() => setScanning(false)} onCode={onScan} continuous title="Count what arrived" hint="Each scan adds one to that line. Close when done, then save.">
                {lastScan && <p className="mt-3 rounded-[12px] bg-surface-container-low px-3 py-2 text-[14px] font-bold text-on-surface">{lastScan}</p>}
            </ScanSheet>
        </section>
    );
}
