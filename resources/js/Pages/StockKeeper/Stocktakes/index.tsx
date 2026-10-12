import { Head, Link, useForm } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { STOCKTAKE_STATUS } from "@/Components/StockKeeper/stocktakeStatus";
import type { StocktakeStatus } from "@/types/stockkeeper";

/** Stocktakes: start a count of a place, and every count so far. */

interface Row {
    id: number;
    reference: string;
    status: StocktakeStatus;
    location: string;
    lines: number;
    counted: number;
    started_by: string | null;
    submitted_by: string | null;
    approved_by: string | null;
    created_at: string | null;
    posted_at: string | null;
}

const KIND_LABEL: Record<string, string> = { main_hub: "Main Hub", remote_hub: "Remote Hub", backroom: "Store floor", shelf: "Store Shelf" };
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "");

export default function Stocktakes({ stocktakes = [], locations = [] }: { stocktakes: Row[]; locations: Array<{ id: number; name: string; kind: string; store: string | null }> }) {
    const form = useForm({ stock_location_id: locations[0] ? String(locations[0].id) : "", note: "" });
    const start = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route("stock_keeper.stocktakes.store"));
    };
    const open = stocktakes.filter((t) => t.status === "counting" || t.status === "submitted");
    const done = stocktakes.filter((t) => t.status === "posted" || t.status === "voided");

    return (
        <>
            <Head title="Stocktake" />

            <div className="mb-4 lg:mb-6">
                <h1 className="text-[22px] font-extrabold tracking-tight text-on-surface sm:text-[26px]">Stocktake</h1>
                <p className="mt-0.5 max-w-[720px] text-[13px] text-on-surface-variant sm:text-[14px]">
                    Count a place, by hand or by scanning. Someone other than the person who submits the count approves it, then the differences are booked.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6">
                <form onSubmit={start} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm lg:sticky lg:top-6">
                    <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-on-surface">
                        <span className="material-symbols-outlined text-[22px] text-primary">add_task</span>
                        Start a count
                    </h2>
                    <label className="mt-3 block">
                        <span className="mb-1 block text-[13px] font-bold text-on-surface">Place</span>
                        <select value={form.data.stock_location_id} onChange={(e) => form.setData("stock_location_id", e.target.value)} className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3 py-2.5 text-[15px] focus:border-primary focus:ring-0">
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name} · {KIND_LABEL[l.kind] ?? l.kind}
                                    {l.store ? ` · ${l.store}` : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="mt-3 block">
                        <span className="mb-1 block text-[13px] font-bold text-on-surface">Note (optional)</span>
                        <input value={form.data.note} onChange={(e) => form.setData("note", e.target.value)} placeholder="e.g. Monthly count, aisle A" className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3 py-2.5 text-[15px] focus:border-primary focus:ring-0" />
                    </label>
                    <p className="mt-2 text-[12px] text-on-surface-variant">The ledger's figures are frozen when you start; anything moved during the count is kept.</p>
                    <button type="submit" disabled={form.processing || !form.data.stock_location_id} className="mt-4 w-full rounded-[12px] bg-primary py-3 text-[15px] font-bold text-on-primary shadow-sm disabled:opacity-60">
                        Start counting
                    </button>
                </form>

                <div className="flex min-w-0 flex-col gap-4">
                    <Section title="Open" rows={open} empty="No count is open." />
                    <Section title="Finished" rows={done} empty="No finished counts yet." />
                </div>
            </div>
        </>
    );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
    return (
        <section>
            <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-on-surface-variant">{title}</h2>
            {rows.length === 0 ? (
                <EmptyState icon="fact_check" title={empty} framed />
            ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {rows.map((t) => {
                        const status = STOCKTAKE_STATUS[t.status];
                        const pct = t.lines > 0 ? Math.round((t.counted / t.lines) * 100) : 0;
                        return (
                            <li key={t.id}>
                                <Link href={route("stock_keeper.stocktakes.show", t.id)} className="block rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm hover:border-primary">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-bold text-on-surface">{t.location}</p>
                                            <p className="font-mono text-[12px] text-on-surface-variant">{t.reference}</p>
                                        </div>
                                        <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
                                    </div>
                                    <div className="mt-3 h-2 overflow-hidden rounded-[999px] bg-surface-container">
                                        <div className="h-full rounded-[999px] bg-primary" style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className="mt-1.5 text-[12px] text-on-surface-variant">
                                        {t.counted} of {t.lines} lines counted · started by {t.started_by ?? "—"} {when(t.created_at)}
                                        {t.approved_by ? ` · approved by ${t.approved_by}` : ""}
                                    </p>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

Stocktakes.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
