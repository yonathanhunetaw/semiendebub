import React from "react";
import { Link, router, useForm } from "@inertiajs/react";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkSheet, SkStats, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import { IDEA_STATUS } from "@/Components/Procurement/IdeaBoard";
import type { FreightRoute, Margin, QuoteBoardProps, RouteFigure, SupplierQuote } from "@/types/procurement";

/**
 * An idea's supplier quotes and what each costs on the shelf, on the
 * procurement app (editable) and the admin app (read-only, for the global
 * admin who approves). Every figure comes from the server's saved estimate
 * (SupplierQuoteService); the page never does the sum itself.
 */

const FIGURE_LABEL: Record<RouteFigure, string> = {
    overseas_storage_per_cbm: "Overseas storage / CBM",
    sea_freight_per_cbm: "Sea freight / CBM",
    insurance_pct: "Insurance %",
    port_clearing_per_cbm: "Port & clearing / CBM (ETB)",
    land_transport_per_cbm: "Land transport / CBM (ETB)",
    to_store_per_cbm: "To the store / CBM (ETB)",
};

function MarginText({ margin, against }: { margin: Margin | null; against: string }) {
    if (!margin) return <span className="text-on-surface-variant">— vs {against}</span>;
    const tone = margin.amount < 0 ? "text-error" : margin.pct < 15 ? "text-warning" : "text-success";
    return (
        <span>
            <span className={`font-bold ${tone}`}>
                {money(margin.amount)} ({margin.pct}%)
            </span>
            <span className="text-on-surface-variant"> vs {against}</span>
        </span>
    );
}

export default function QuoteBoard({ idea, board, canQuote, suppliers = [], routes = [], currencies = [], rates = {} }: QuoteBoardProps) {
    const [editing, setEditing] = React.useState<SupplierQuote | "new" | null>(null);
    const status = IDEA_STATUS[idea.status];

    return (
        <div className="space-y-4">
            <SkCard>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1 text-[14px]">
                        <p className="text-[16px] font-bold">{idea.name}</p>
                        <p className="text-on-surface-variant">{idea.store ? idea.store.name : "Every store"}</p>
                        {idea.spec ? <p className="whitespace-pre-line">{idea.spec}</p> : null}
                    </div>
                    <StatusPill label={status.label} tone={status.tone} size="sm" />
                </div>
                <div className="px-4 pb-4">
                    <SkStats
                        cols={3}
                        items={[
                            { label: "We would sell one for", value: money(board.target) },
                            { label: "Other shops, median", value: money(board.market.median), hint: board.market.prices ? `${board.market.prices} verified prices` : "No verified prices" },
                            { label: "Other shops, lowest", value: money(board.market.lowest) },
                        ]}
                    />
                </div>
            </SkCard>

            <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-bold">Quotes</h2>
                {canQuote ? (
                    <SkButton icon="add" onClick={() => setEditing("new")}>
                        Add a quote
                    </SkButton>
                ) : null}
            </div>

            {board.quotes.length === 0 ? (
                <EmptyState
                    framed
                    icon="request_quote"
                    title="No quotes yet"
                    description={canQuote ? "Ask suppliers what they would charge, and add each answer here." : "Procurement adds quotes while the idea is with them."}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {board.quotes.map((q) => (
                        <QuoteCard key={q.id} quote={q} best={board.best === q.id} canQuote={canQuote} onEdit={() => setEditing(q)} />
                    ))}
                </div>
            )}

            {canQuote ? (
                <QuoteSheet
                    quote={editing}
                    onClose={() => setEditing(null)}
                    ideaId={idea.id}
                    suppliers={suppliers}
                    routes={routes}
                    currencies={currencies}
                    rates={rates}
                    lastHsCode={board.quotes.find((q) => q.hs_code)?.hs_code ?? ""}
                />
            ) : null}
        </div>
    );
}

function QuoteCard({ quote, best, canQuote, onEdit }: { quote: SupplierQuote; best: boolean; canQuote: boolean; onEdit: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const e = quote.estimate;

    const act = (method: "post" | "delete", name: string) => {
        setBusy(true);
        const options = { preserveScroll: true, onFinish: () => setBusy(false) };
        if (method === "post") router.post(route(name, quote.id), {}, options);
        else router.delete(route(name, quote.id), options);
    };

    return (
        <SkCard className="flex flex-col">
            <SkCardHeader
                icon="request_quote"
                title={
                    <span>
                        {quote.supplier.name}
                        <span className="font-normal text-on-surface-variant">
                            {" "}
                            · {quote.currency} {quote.unit_price} a piece
                        </span>
                    </span>
                }
                right={best ? <StatusPill label="Cheapest" tone="success" size="xs" icon="star" /> : null}
            />
            <div className="flex-1 space-y-3 p-4 text-[13px]">
                <p className="text-on-surface-variant">
                    MOQ {quote.moq} · {quote.pieces_per_carton} a carton{quote.cbm_per_carton !== null ? ` · ${quote.cbm_per_carton} CBM` : ""}
                    {quote.lead_days !== null ? ` · ${quote.lead_days} days` : ""}
                    {quote.valid_until ? ` · valid to ${when(quote.valid_until)}` : ""}
                    {quote.hs_code ? ` · HS ${quote.hs_code}` : ""}
                </p>

                {e ? (
                    <>
                        <div className="rounded-[12px] bg-surface-container-low p-3">
                            <p className="text-[12px] text-on-surface-variant">
                                Cost on the shelf, per piece, for {e.quantity} pieces ({e.cartons} cartons, {e.cbm} CBM)
                            </p>
                            <p className="text-[24px] font-extrabold text-on-surface">{money(e.cost_per_piece)}</p>
                            <p>
                                <MarginText margin={quote.margin} against="our price" />
                            </p>
                            <p>
                                <MarginText margin={quote.margin_vs_market} against="other shops" />
                            </p>
                        </div>

                        {e.warnings.length > 0 ? (
                            <ul className="space-y-1 rounded-[12px] border border-warning/40 bg-warning-container/40 p-3 text-on-warning-container">
                                {e.warnings.map((w) => (
                                    <li key={w} className="flex gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">warning</span>
                                        {w}
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        <table className="w-full">
                            <tbody>
                                {e.lines
                                    .filter((l) => l.amount !== 0)
                                    .map((l) => (
                                        <tr key={l.key} className="border-b border-outline-variant/50 last:border-0">
                                            <td className={`py-1 ${l.cost ? "" : "text-on-surface-variant"}`}>{l.label}</td>
                                            <td className={`py-1 text-right ${l.cost ? "" : "text-on-surface-variant"}`}>{money(l.amount)}</td>
                                        </tr>
                                    ))}
                                <tr className="font-bold">
                                    <td className="pt-2">Cost</td>
                                    <td className="pt-2 text-right">{money(e.cost_total)}</td>
                                </tr>
                                <tr className="text-on-surface-variant">
                                    <td>Cash out (with VAT and withholding)</td>
                                    <td className="text-right">{money(e.cash_total)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-[12px] text-on-surface-variant">
                            1 {quote.currency} = ETB {e.exchange_rate}
                            {e.route ? ` · ${e.route.name}` : ""}
                            {e.tariff ? ` · duty ${e.tariff.duty_pct}%` : ""} · worked out {when(e.calculated_at)}
                        </p>
                    </>
                ) : null}
                {quote.notes ? <p className="whitespace-pre-line">{quote.notes}</p> : null}
            </div>
            {canQuote ? (
                <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/60 px-4 py-3">
                    <SkButton variant="danger" disabled={busy} onClick={() => act("delete", "procurement.quotes.destroy")}>
                        Remove
                    </SkButton>
                    <SkButton variant="outline" icon="refresh" disabled={busy} onClick={() => act("post", "procurement.quotes.recalculate")}>
                        Recalculate
                    </SkButton>
                    <SkButton variant="outline" icon="edit" disabled={busy} onClick={onEdit}>
                        Edit
                    </SkButton>
                </div>
            ) : null}
        </SkCard>
    );
}

type QuoteFields = {
    supplier_id: string;
    currency: string;
    exchange_rate: string;
    unit_price: string;
    moq: string;
    quantity: string;
    pieces_per_carton: string;
    cbm_per_carton: string;
    kg_per_carton: string;
    lead_days: string;
    valid_until: string;
    hs_code: string;
    freight_route_id: string;
    overrides: Partial<Record<RouteFigure, string>>;
    notes: string;
};

const str = (v: number | string | null | undefined): string => (v === null || v === undefined ? "" : String(v));

function QuoteSheet({
    quote,
    onClose,
    ideaId,
    suppliers,
    routes,
    currencies,
    rates,
    lastHsCode,
}: {
    quote: SupplierQuote | "new" | null;
    onClose: () => void;
    ideaId: number;
    suppliers: Array<{ id: number; name: string; currency: string }>;
    routes: FreightRoute[];
    currencies: string[];
    rates: Record<string, number | null>;
    lastHsCode: string;
}) {
    const existing = quote !== null && quote !== "new" ? quote : null;
    const [showOverrides, setShowOverrides] = React.useState(false);
    const form = useForm<QuoteFields>({
        supplier_id: "",
        currency: "USD",
        exchange_rate: "",
        unit_price: "",
        moq: "",
        quantity: "",
        pieces_per_carton: "1",
        cbm_per_carton: "",
        kg_per_carton: "",
        lead_days: "",
        valid_until: "",
        hs_code: "",
        freight_route_id: "",
        overrides: {},
        notes: "",
    });

    React.useEffect(() => {
        if (quote === null) return;
        form.clearErrors();
        form.setData({
            supplier_id: str(existing?.supplier.id ?? suppliers[0]?.id),
            currency: existing?.currency ?? suppliers[0]?.currency ?? "USD",
            exchange_rate: existing ? str(existing.exchange_rate) : "",
            unit_price: str(existing?.unit_price),
            moq: str(existing?.moq),
            quantity: str(existing?.quantity),
            pieces_per_carton: str(existing?.pieces_per_carton ?? 1),
            cbm_per_carton: str(existing?.cbm_per_carton),
            kg_per_carton: str(existing?.kg_per_carton),
            lead_days: str(existing?.lead_days),
            valid_until: existing?.valid_until ?? "",
            hs_code: existing?.hs_code ?? lastHsCode,
            freight_route_id: str(existing?.freight_route_id ?? routes[0]?.id),
            overrides: Object.fromEntries(Object.entries(existing?.overrides ?? {}).map(([k, v]) => [k, str(v)])),
            notes: existing?.notes ?? "",
        });
        setShowOverrides(Object.keys(existing?.overrides ?? {}).length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quote]);

    const route_ = routes.find((r) => String(r.id) === form.data.freight_route_id);
    const latest = rates[form.data.currency];

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (existing) form.put(route("procurement.quotes.update", existing.id), options);
        else form.post(route("procurement.quotes.store", ideaId), options);
    };

    const field = (key: keyof QuoteFields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
        <SkField label={label} hint={hint} error={form.errors[key]}>
            <input className={inputClass} value={form.data[key] as string} onChange={(e) => form.setData(key, e.target.value as never)} {...props} />
        </SkField>
    );

    return (
        <SkSheet
            open={quote !== null}
            onClose={onClose}
            wide
            title={existing ? `Edit the quote from ${existing.supplier.name}` : "Add a quote"}
            subtitle="Saving works out what it would cost on the shelf, from the route and the tariff."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="quote-form" disabled={form.processing}>
                        Save and estimate
                    </SkButton>
                </div>
            }
        >
            <form id="quote-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SkField label="Supplier" error={form.errors.supplier_id}>
                    {suppliers.length === 0 ? (
                        <p className="text-[13px] text-on-surface-variant">
                            Add a supplier first under{" "}
                            <Link href={route("procurement.suppliers.index")} className="font-semibold text-primary">
                                Suppliers
                            </Link>
                            .
                        </p>
                    ) : (
                        <select
                            className={inputClass}
                            value={form.data.supplier_id}
                            onChange={(e) => {
                                const s = suppliers.find((x) => String(x.id) === e.target.value);
                                form.setData({ ...form.data, supplier_id: e.target.value, currency: s?.currency ?? form.data.currency });
                            }}
                        >
                            {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    )}
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="Currency" error={form.errors.currency}>
                        <select className={inputClass} value={form.data.currency} onChange={(e) => form.setData("currency", e.target.value)}>
                            {currencies.map((c) => (
                                <option key={c}>{c}</option>
                            ))}
                        </select>
                    </SkField>
                    {field("exchange_rate", "ETB per 1", { type: "number", step: "0.0001", min: 0, placeholder: latest ? String(latest) : "not set" }, latest ? "Empty: today's rate" : "No rate set: type one")}
                </div>
                {field("unit_price", `Price a piece (${form.data.currency})`, { type: "number", step: "0.0001", min: 0 })}
                <div className="grid grid-cols-2 gap-3">
                    {field("moq", "MOQ (pieces)", { type: "number", min: 1 })}
                    {field("quantity", "Estimate for", { type: "number", min: 1, placeholder: form.data.moq || "MOQ" }, "Pieces; empty: the MOQ")}
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {field("pieces_per_carton", "Pieces / carton", { type: "number", min: 1 })}
                    {field("cbm_per_carton", "CBM / carton", { type: "number", step: "0.0001", min: 0 })}
                    {field("kg_per_carton", "kg / carton", { type: "number", step: "0.001", min: 0 })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field("lead_days", "Lead time (days)", { type: "number", min: 0 })}
                    {field("valid_until", "Price valid until", { type: "date" })}
                </div>
                {field("hs_code", "HS code", { inputMode: "numeric", placeholder: "8523.51.00" }, "Finds the tariff (Procurement → Tariffs)")}
                <SkField label="Route" error={form.errors.freight_route_id}>
                    <select className={inputClass} value={form.data.freight_route_id} onChange={(e) => form.setData("freight_route_id", e.target.value)}>
                        <option value="">No route (shipping not counted)</option>
                        {routes.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </SkField>
                {route_ ? (
                    <div className="sm:col-span-2">
                        <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => setShowOverrides((v) => !v)}>
                            {showOverrides ? "Hide the route's figures" : "Change a route figure for this quote"}
                        </button>
                        {showOverrides ? (
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {(Object.keys(FIGURE_LABEL) as RouteFigure[]).map((k) => (
                                    <SkField key={k} label={FIGURE_LABEL[k].replace("/ CBM", `/ CBM${["overseas_storage_per_cbm", "sea_freight_per_cbm"].includes(k) ? ` (${route_.currency})` : ""}`)}>
                                        <input
                                            className={inputClass}
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            placeholder={String(route_[k])}
                                            value={form.data.overrides[k] ?? ""}
                                            onChange={(e) => form.setData("overrides", { ...form.data.overrides, [k]: e.target.value })}
                                        />
                                    </SkField>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <div className="sm:col-span-2">
                    <SkField label="Notes" error={form.errors.notes}>
                        <textarea className={inputClass} rows={2} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} />
                    </SkField>
                </div>
            </form>
        </SkSheet>
    );
}
