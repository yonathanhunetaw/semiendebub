import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import type { DiscrepancyKind, DiscrepancyRow } from "@/types/stockkeeper";

/**
 * Receiving discrepancies: what arrived differently from what was sent, on
 * shipments and transfers.
 *
 *   Short    the missing units stay with the courier (In Delivery) until
 *            someone other than the receiver marks them found or lost
 *   Damaged  booked in and written off at once (shown for the record)
 *   Over     the extra was booked in; someone confirms it
 */

const KIND: Record<DiscrepancyKind, { label: string; tone: Tone; icon: string; line: string }> = {
    short: { label: "Short", tone: "error", icon: "remove_circle", line: "missing" },
    damaged: { label: "Damaged", tone: "warning", icon: "broken_image", line: "damaged" },
    over: { label: "Over", tone: "info", icon: "add_circle", line: "extra" },
};

const RESOLUTION: Record<string, string> = {
    found: "Found and landed",
    lost: "Lost, written off",
    written_off: "Written off",
    accepted: "Extra accepted",
};

const fmt = (n: number) => n.toLocaleString();
const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

export default function Receiving({ discrepancies = [], counts, filter }: { discrepancies: DiscrepancyRow[]; counts: { open: number; short: number; over: number; resolved: number }; filter: string }) {
    const [settling, setSettling] = React.useState<DiscrepancyRow | null>(null);
    const setFilter = (status: string) => router.get(route("stock_keeper.receiving.index"), { status }, { preserveScroll: true, replace: true });

    return (
        <>
            <Head title="Receiving" />

            <div className="mb-4 lg:mb-6">
                <h1 className="text-[22px] font-extrabold tracking-tight text-on-surface sm:text-[26px]">Receiving</h1>
                <p className="mt-0.5 max-w-[720px] text-[13px] text-on-surface-variant sm:text-[14px]">
                    When a shipment or transfer arrives different from what was sent. Count what arrived on the shipment before signing it in; differences land here.
                </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:mb-6">
                {[
                    { key: "open", label: "Open", value: counts.open, icon: "pending_actions" },
                    { key: "short", label: "Short, with courier", value: counts.short, icon: "remove_circle" },
                    { key: "over", label: "Over, to confirm", value: counts.over, icon: "add_circle" },
                    { key: "resolved", label: "Settled", value: counts.resolved, icon: "task_alt" },
                ].map((tile) => {
                    const on = filter === tile.key;
                    const target = tile.key === "short" || tile.key === "over" ? "open" : tile.key;
                    return (
                        <button
                            key={tile.key}
                            type="button"
                            onClick={() => setFilter(target)}
                            className={`rounded-[18px] border p-3 text-left shadow-sm transition-colors sm:p-4 ${on ? "border-primary bg-primary-container/50" : "border-outline-variant bg-surface-container-lowest hover:border-primary"}`}
                        >
                            <span className="material-symbols-outlined text-[22px] text-primary">{tile.icon}</span>
                            <span className="mt-1 block text-[24px] font-extrabold tabular-nums text-on-surface">{fmt(tile.value)}</span>
                            <span className="block text-[13px] font-bold text-on-surface-variant">{tile.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mb-3 flex gap-2">
                {[
                    { key: "open", label: "Open" },
                    { key: "resolved", label: "Settled" },
                    { key: "all", label: "All" },
                ].map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`rounded-[999px] border px-3.5 py-1.5 text-[13px] font-bold ${filter === f.key ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {discrepancies.length === 0 ? (
                <EmptyState icon="task_alt" title={filter === "open" ? "Nothing open" : "Nothing here"} description="Every count matched what was sent." framed />
            ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {discrepancies.map((row) => {
                        const kind = KIND[row.kind];
                        return (
                            <li key={row.id} className="flex flex-col rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <Link href={route("stock_keeper.items.show", row.item.id)} className="block truncate text-[15px] font-bold text-on-surface hover:underline">
                                            {row.item.name}
                                        </Link>
                                        <p className="truncate font-mono text-[11px] text-on-surface-variant">{row.item.sku ?? ""} · {row.reference}</p>
                                    </div>
                                    <StatusPill tone={kind.tone} label={kind.label} icon={kind.icon} />
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 rounded-[14px] bg-surface-container-low p-2.5 text-center">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase text-on-surface-variant">Sent</p>
                                        <p className="text-[18px] font-extrabold tabular-nums">{fmt(row.expected)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase text-on-surface-variant">Arrived</p>
                                        <p className="text-[18px] font-extrabold tabular-nums">{fmt(row.received)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase text-on-surface-variant">{kind.line}</p>
                                        <p className={`text-[18px] font-extrabold tabular-nums ${row.kind === "short" ? "text-error" : row.kind === "damaged" ? "text-warning" : "text-info"}`}>{fmt(row.quantity)}</p>
                                    </div>
                                </div>

                                <dl className="mt-3 space-y-1 text-[13px]">
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-on-surface-variant">{row.source.type}</dt>
                                        <dd className="truncate font-bold">{row.source.url ? <Link href={row.source.url} className="text-primary hover:underline">{row.source.reference}</Link> : row.source.reference}</dd>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-on-surface-variant">At</dt>
                                        <dd className="truncate font-bold">{row.location}</dd>
                                    </div>
                                    {row.courier && (
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-on-surface-variant">Courier</dt>
                                            <dd className="truncate font-bold">{row.courier}</dd>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-on-surface-variant">Counted by</dt>
                                        <dd className="truncate font-bold">{row.recorded_by ?? "—"} · {when(row.created_at)}</dd>
                                    </div>
                                </dl>
                                {row.note && <p className="mt-2 rounded-[10px] bg-surface-container-low px-2.5 py-1.5 text-[13px] text-on-surface-variant">“{row.note}”</p>}

                                <div className="mt-auto pt-3">
                                    {row.status === "resolved" ? (
                                        <p className="flex items-center gap-1.5 text-[13px] font-bold text-success">
                                            <span className="material-symbols-outlined text-[18px]">task_alt</span>
                                            {RESOLUTION[row.resolution ?? ""] ?? "Settled"}
                                            {row.resolved_by ? ` by ${row.resolved_by}` : ""}
                                        </p>
                                    ) : row.can_resolve ? (
                                        <button type="button" onClick={() => setSettling(row)} className="w-full rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary shadow-sm">
                                            Settle
                                        </button>
                                    ) : (
                                        <p className="text-[12px] text-on-surface-variant">Waiting for someone other than the receiver to settle it.</p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {settling && <SettleSheet row={settling} onClose={() => setSettling(null)} />}
        </>
    );
}

function SettleSheet({ row, onClose }: { row: DiscrepancyRow; onClose: () => void }) {
    const options =
        row.kind === "short"
            ? [
                  { value: "found", label: "Found", hint: `The ${fmt(row.quantity)} missing turned up; they land at ${row.location}.` },
                  { value: "lost", label: "Lost", hint: `They won't turn up; written off from the courier's custody.` },
              ]
            : [{ value: "accepted", label: "Accept the extra", hint: `Keep the ${fmt(row.quantity)} extra booked in at ${row.location}.` }];
    const form = useForm({ resolution: options[0].value, note: "" });
    const save = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route("stock_keeper.receiving.resolve", row.id), { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-surface/40" />
            <form onSubmit={save} className="relative w-full rounded-t-[24px] bg-surface-container-lowest p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[480px] sm:rounded-[24px] sm:p-6">
                <h2 className="text-[18px] font-extrabold text-on-surface">Settle {row.reference}</h2>
                <p className="mb-3 text-[13px] text-on-surface-variant">{row.item.name}</p>
                <div className="flex flex-col gap-2">
                    {options.map((o) => (
                        <label key={o.value} className={`flex cursor-pointer gap-3 rounded-[14px] border p-3 ${form.data.resolution === o.value ? "border-primary bg-primary-container/40" : "border-outline-variant"}`}>
                            <input type="radio" name="resolution" value={o.value} checked={form.data.resolution === o.value} onChange={() => form.setData("resolution", o.value)} className="mt-1 text-primary focus:ring-primary" />
                            <span>
                                <span className="block text-[14px] font-bold text-on-surface">{o.label}</span>
                                <span className="block text-[13px] text-on-surface-variant">{o.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <textarea value={form.data.note} onChange={(e) => form.setData("note", e.target.value)} rows={2} placeholder="Note (optional)" className="mt-3 w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3 py-2 text-[14px] focus:border-primary focus:ring-0" />
                <div className="mt-4 flex gap-2">
                    <button type="submit" disabled={form.processing} className="flex-1 rounded-[12px] bg-primary py-3 text-[15px] font-bold text-on-primary disabled:opacity-60">Confirm</button>
                    <button type="button" onClick={onClose} className="rounded-[12px] px-4 text-[14px] font-bold text-on-surface-variant hover:bg-surface-container">Cancel</button>
                </div>
            </form>
        </div>
    );
}

Receiving.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
