import React from "react";
import { Head, Link, router, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import type { FreightRoute, RouteFigure } from "@/types/procurement";

interface RateRow {
    currency: string;
    rate: number | null;
    history: Array<{ rate: number; at: string | null; by: string | null }>;
}

interface Props {
    rates?: RateRow[];
    routes?: FreightRoute[];
    currencies?: string[];
    tariffCount: number;
}

const FIGURES: Array<{ key: RouteFigure; label: string; local: boolean }> = [
    { key: "overseas_storage_per_cbm", label: "Overseas storage / CBM", local: false },
    { key: "sea_freight_per_cbm", label: "Sea freight / CBM", local: false },
    { key: "insurance_pct", label: "Insurance (% of goods)", local: false },
    { key: "port_clearing_per_cbm", label: "Port & clearing / CBM", local: true },
    { key: "land_transport_per_cbm", label: "Transport to the land port / CBM", local: true },
    { key: "to_store_per_cbm", label: "Main store to store / CBM", local: true },
];

/**
 * What estimates are made from: today's exchange rates, and what each way of
 * bringing goods in costs per CBM. Changing them never rewrites a saved
 * quote; a quote takes them when it is recalculated.
 */
export default function ProcurementCosts({ rates = [], routes = [], currencies = [], tariffCount }: Props) {
    const [editing, setEditing] = React.useState<FreightRoute | "new" | null>(null);

    return (
        <>
            <Head title="Costs" />
            <SkHeader
                title="Costs"
                subtitle="Exchange rates and freight routes, for estimating what a quote costs on the shelf. Saved quotes keep their figures until recalculated."
                actions={
                    <Link href={route("procurement.tariffs.index")} className="text-[14px] font-semibold text-primary">
                        Tariffs ({tariffCount})
                    </Link>
                }
            />

            <SkCard className="mb-4">
                <SkCardHeader icon="currency_exchange" title="Exchange rates (ETB for one)" />
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rates.map((r) => (
                        <RateCard key={r.currency} row={r} />
                    ))}
                </div>
            </SkCard>

            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold">Freight routes</h2>
                <SkButton icon="add" onClick={() => setEditing("new")}>
                    Add a route
                </SkButton>
            </div>

            {routes.length === 0 ? (
                <EmptyState framed icon="sailing" title="No routes yet" description="Add the way goods usually come in, e.g. Guangzhou → Djibouti → Modjo → Addis." />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {routes.map((r) => (
                        <SkCard key={r.id}>
                            <SkCardHeader
                                icon="sailing"
                                title={r.name}
                                right={
                                    <span className="flex items-center gap-2">
                                        {!r.is_active ? <StatusPill label="Not used" tone="neutral" size="xs" /> : null}
                                        <button type="button" className="text-[12px] font-semibold text-primary" onClick={() => setEditing(r)}>
                                            Edit
                                        </button>
                                    </span>
                                }
                            />
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-[13px]">
                                {FIGURES.map((f) => (
                                    <React.Fragment key={f.key}>
                                        <dt className="text-on-surface-variant">{f.label}</dt>
                                        <dd className="text-right font-semibold">
                                            {f.key === "insurance_pct" ? `${r[f.key]}%` : `${f.local ? "ETB" : r.currency} ${r[f.key]}`}
                                        </dd>
                                    </React.Fragment>
                                ))}
                                {r.transit_days ? (
                                    <>
                                        <dt className="text-on-surface-variant">Transit</dt>
                                        <dd className="text-right font-semibold">{r.transit_days} days</dd>
                                    </>
                                ) : null}
                            </dl>
                        </SkCard>
                    ))}
                </div>
            )}

            <RouteSheet value={editing} onClose={() => setEditing(null)} currencies={currencies} />
        </>
    );
}

function RateCard({ row }: { row: RateRow }) {
    const [rate, setRate] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        router.post(route("procurement.costs.rates.store"), { currency: row.currency, rate }, { preserveScroll: true, onSuccess: () => setRate(""), onFinish: () => setBusy(false) });
    };

    return (
        <form onSubmit={save} className="rounded-[14px] border border-outline-variant p-3">
            <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-bold">1 {row.currency}</span>
                <span className="text-[16px] font-extrabold">{row.rate !== null ? `ETB ${row.rate}` : "not set"}</span>
            </div>
            {row.history[0]?.at ? (
                <p className="text-[11px] text-on-surface-variant">
                    {when(row.history[0].at)}
                    {row.history[0].by ? ` · ${row.history[0].by}` : ""}
                </p>
            ) : null}
            <div className="mt-2 flex gap-2">
                <input className={inputClass} type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="New rate" aria-label={`New ETB rate for ${row.currency}`} />
                <SkButton type="submit" disabled={busy || rate === ""}>
                    Set
                </SkButton>
            </div>
        </form>
    );
}

function RouteSheet({ value, onClose, currencies }: { value: FreightRoute | "new" | null; onClose: () => void; currencies: string[] }) {
    const existing = value !== null && value !== "new" ? value : null;
    const blank = { name: "", origin: "", currency: "USD", transit_days: "", notes: "", is_active: true, ...Object.fromEntries(FIGURES.map((f) => [f.key, "0"])) };
    const form = useForm<Record<string, string | boolean>>(blank);

    React.useEffect(() => {
        if (value === null) return;
        form.clearErrors();
        form.setData(
            existing
                ? {
                      name: existing.name,
                      origin: existing.origin ?? "",
                      currency: existing.currency,
                      transit_days: existing.transit_days ? String(existing.transit_days) : "",
                      notes: existing.notes ?? "",
                      is_active: existing.is_active ?? true,
                      ...Object.fromEntries(FIGURES.map((f) => [f.key, String(existing[f.key])])),
                  }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (existing) form.put(route("procurement.costs.routes.update", existing.id), options);
        else form.post(route("procurement.costs.routes.store"), options);
    };

    const text = (key: string) => String(form.data[key] ?? "");

    return (
        <SkSheet
            open={value !== null}
            onClose={onClose}
            wide
            title={existing ? `Edit ${existing.name}` : "Add a route"}
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="route-form" disabled={form.processing}>
                        Save
                    </SkButton>
                </div>
            }
        >
            <form id="route-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SkField label="Name" error={form.errors.name}>
                    <input className={inputClass} value={text("name")} onChange={(e) => form.setData("name", e.target.value)} placeholder="Guangzhou → Djibouti → Modjo" />
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="From" error={form.errors.origin}>
                        <input className={inputClass} value={text("origin")} onChange={(e) => form.setData("origin", e.target.value)} placeholder="Guangzhou" />
                    </SkField>
                    <SkField label="Foreign legs in" error={form.errors.currency}>
                        <select className={inputClass} value={text("currency")} onChange={(e) => form.setData("currency", e.target.value)}>
                            {currencies.map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </SkField>
                </div>
                {FIGURES.map((f) => (
                    <SkField key={f.key} label={f.key === "insurance_pct" ? f.label : `${f.label} (${f.local ? "ETB" : text("currency")})`} error={form.errors[f.key]}>
                        <input className={inputClass} type="number" step="0.01" min={0} value={text(f.key)} onChange={(e) => form.setData(f.key, e.target.value)} />
                    </SkField>
                ))}
                <SkField label="Transit (days)" error={form.errors.transit_days}>
                    <input className={inputClass} type="number" min={0} value={text("transit_days")} onChange={(e) => form.setData("transit_days", e.target.value)} />
                </SkField>
                <SkField label="Notes" error={form.errors.notes}>
                    <input className={inputClass} value={text("notes")} onChange={(e) => form.setData("notes", e.target.value)} />
                </SkField>
                <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                    <input type="checkbox" checked={Boolean(form.data.is_active)} onChange={(e) => form.setData("is_active", e.target.checked)} />
                    In use (offered on new quotes)
                </label>
            </form>
        </SkSheet>
    );
}

ProcurementCosts.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
