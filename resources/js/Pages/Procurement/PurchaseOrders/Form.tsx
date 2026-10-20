import React from "react";
import { calendarPrefill } from "@/Components/Calendar/calendarPrefill";
import { Head, Link, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, inputClass } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import type { DueRule, PaymentTerms, PurchaseDetail, Supplier, VariantOption, WarehouseOption } from "@/types/procurement";

interface Props {
    order: PurchaseDetail | null;
    preselectedSupplier: number | null;
    suppliers?: Supplier[];
    warehouses?: WarehouseOption[];
    currencies?: string[];
    homeCurrency: string;
    paymentTerms?: Record<PaymentTerms, string>;
    adminLimit: number;
}

interface LineRow {
    key: string;
    variant: VariantOption;
    quantity: string;
    unit_price: string;
    cbm: string;
    weight_kg: string;
    supplier_sku: string;
}

interface ScheduleRow {
    key: string;
    label: string;
    /** "percent" or "amount": which of the two the row is given in. */
    by: "percent" | "amount";
    value: string;
    due: DueRule;
    days: string;
    date: string;
}

interface OrderForm {
    supplier_id: string;
    currency: string;
    exchange_rate: string;
    payment_terms: PaymentTerms;
    payment_days: string;
    payment_anchor: "order" | "shipping";
    payment_schedule: ScheduleRow[];
    incoterm: string;
    expected_at: string;
    warehouse_id: string;
    notes: string;
    lines: LineRow[];
}

const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"];

const DUE_OPTIONS: Array<{ value: DueRule; label: string }> = [
    { value: "on_order", label: "On order" },
    { value: "after_order", label: "Days after order" },
    { value: "after_shipping", label: "Days after shipping" },
    { value: "after_arrival", label: "Days after arrival" },
    { value: "on_date", label: "On a date" },
];

/** A common start: 30% deposit on order, 70% before shipping. */
const DEFAULT_SCHEDULE: ScheduleRow[] = [
    { key: "s1", label: "Deposit", by: "percent", value: "30", due: "on_order", days: "", date: "" },
    { key: "s2", label: "Balance", by: "percent", value: "70", due: "after_shipping", days: "0", date: "" },
];
const num = (v: string): number => (v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
const orNull = (v: string): number | null => (v === "" ? null : Number(v));

/** Type a SKU or product name; the server sends back up to 25 matches. */
function VariantSearch({ onPick, exclude }: { onPick: (v: VariantOption) => void; exclude: number[] }) {
    const [q, setQ] = React.useState("");
    const [results, setResults] = React.useState<VariantOption[]>([]);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const t = window.setTimeout(() => {
            fetch(route("procurement.purchase_orders.variants", { q }), {
                headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
                signal: controller.signal,
            })
                .then((r) => r.json())
                .then((body: { variants: VariantOption[] }) => setResults(body.variants))
                .catch(() => undefined);
        }, 250);
        return () => {
            window.clearTimeout(t);
            controller.abort();
        };
    }, [q, open]);

    const shown = results.filter((v) => !exclude.includes(v.id));

    return (
        <div className="relative">
            <div className="flex items-center gap-2 rounded-[12px] border border-outline-variant bg-surface-container-low px-3 py-2 focus-within:border-primary">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">add_shopping_cart</span>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setOpen(true)}
                    onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                    placeholder="Add a line: type a SKU, barcode or product…"
                    aria-label="Find a SKU to add"
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-[15px] focus:ring-0"
                />
            </div>
            {open ? (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[12px] border border-outline-variant bg-surface-container-lowest py-1 shadow-xl">
                    {shown.length === 0 ? (
                        <li className="px-3 py-2 text-[13px] text-on-surface-variant">Nothing matches.</li>
                    ) : (
                        shown.map((v) => (
                            <li key={v.id}>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        onPick(v);
                                        setQ("");
                                    }}
                                    className="block w-full px-3 py-2 text-left hover:bg-surface-container-low"
                                >
                                    <span className="block truncate text-[14px] font-bold">
                                        {v.name}
                                        {v.detail ? <span className="font-normal text-on-surface-variant"> · {v.detail}</span> : null}
                                    </span>
                                    <span className="block truncate font-mono text-[12px] text-on-surface-variant">
                                        {v.sku} · per {v.unit}
                                    </span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            ) : null}
        </div>
    );
}

/** Raise a purchase order, or change a draft. */
export default function PurchaseOrderForm({ order, preselectedSupplier, suppliers = [], warehouses = [], currencies = [], homeCurrency, paymentTerms = {} as Record<PaymentTerms, string>, adminLimit }: Props) {
    const startSupplier = suppliers.find((s) => s.id === (order?.supplier_id ?? preselectedSupplier)) ?? null;

    const { data, setData, post, put, processing, errors, transform } = useForm<OrderForm>({
        supplier_id: startSupplier ? String(startSupplier.id) : "",
        currency: order?.currency ?? startSupplier?.currency ?? homeCurrency,
        exchange_rate: order && order.currency !== homeCurrency ? String(order.exchange_rate) : "",
        payment_terms: order?.payment_terms ?? startSupplier?.default_payment_terms ?? "immediate",
        payment_days: String(order?.payment_days ?? startSupplier?.default_payment_days ?? ""),
        payment_anchor: order?.payment_anchor ?? "order",
        payment_schedule:
            order && order.payment_schedule.length > 0
                ? order.payment_schedule.map((r, i) => ({
                      key: `s${i}`,
                      label: r.label ?? "",
                      by: r.percent != null ? "percent" : "amount",
                      value: String(r.percent ?? r.amount ?? ""),
                      due: r.due,
                      days: r.days != null ? String(r.days) : "",
                      date: r.date ?? "",
                  }))
                : DEFAULT_SCHEDULE,
        incoterm: order?.incoterm ?? "",
        // A new order started from a day on the calendar expects its goods that day.
        expected_at: order?.expected_at ? order.expected_at.slice(0, 10) : order ? "" : (calendarPrefill().date ?? ""),
        warehouse_id: order?.warehouse_id ? String(order.warehouse_id) : "",
        notes: order?.notes ?? "",
        lines: (order?.lines ?? [])
            .filter((l) => l.variant !== null)
            .map((l) => ({
                key: `l${l.id}`,
                variant: l.variant as VariantOption,
                quantity: String(l.quantity),
                unit_price: String(l.unit_price),
                cbm: l.cbm != null ? String(l.cbm) : "",
                weight_kg: l.weight_kg != null ? String(l.weight_kg) : "",
                supplier_sku: l.supplier_sku ?? "",
            })),
    });
    const err = errors as Record<string, string | undefined>;
    const foreign = data.currency !== homeCurrency;

    // A supplier being in the list means it is active; an inactive one stays on its old drafts.
    const supplierMissing = order !== null && order.supplier_id !== null && !suppliers.some((s) => s.id === order.supplier_id);

    const pickSupplier = (id: string) => {
        const s = suppliers.find((x) => String(x.id) === id);
        setData((d) => ({
            ...d,
            supplier_id: id,
            currency: s?.currency ?? d.currency,
            payment_terms: s?.default_payment_terms ?? d.payment_terms,
            payment_days: s?.default_payment_days != null ? String(s.default_payment_days) : "",
        }));
    };

    const setLine = (key: string, patch: Partial<LineRow>) => setData("lines", data.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    const addLine = (v: VariantOption) =>
        setData("lines", [...data.lines, { key: `n${Date.now()}${v.id}`, variant: v, quantity: "1", unit_price: "", cbm: "", weight_kg: "", supplier_sku: "" }]);

    const setRow = (key: string, patch: Partial<ScheduleRow>) => setData("payment_schedule", data.payment_schedule.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const scheduleError = Object.entries(err).find(([k]) => k.startsWith("payment_schedule"))?.[1];

    const subtotal = data.lines.reduce((sum, l) => sum + Math.round(num(l.quantity) * num(l.unit_price) * 100) / 100, 0);
    const rate = foreign ? num(data.exchange_rate) : 1;
    const totalEtb = Math.round(subtotal * rate * 100) / 100;
    const cbm = data.lines.reduce((sum, l) => sum + num(l.cbm), 0);
    const weight = data.lines.reduce((sum, l) => sum + num(l.weight_kg), 0);

    transform((d) => ({
        supplier_id: Number(d.supplier_id) || null,
        currency: d.currency,
        exchange_rate: d.currency === homeCurrency ? null : orNull(d.exchange_rate),
        payment_terms: d.payment_terms,
        payment_days: d.payment_terms === "fixed_date" ? orNull(d.payment_days) : null,
        payment_anchor: d.payment_terms === "fixed_date" ? d.payment_anchor : null,
        payment_schedule:
            d.payment_terms === "installments"
                ? d.payment_schedule.map((r) => ({
                      label: r.label || null,
                      percent: r.by === "percent" ? orNull(r.value) : null,
                      amount: r.by === "amount" ? orNull(r.value) : null,
                      due: r.due,
                      days: ["after_order", "after_shipping", "after_arrival"].includes(r.due) ? orNull(r.days) : null,
                      date: r.due === "on_date" ? r.date || null : null,
                  }))
                : null,
        incoterm: d.incoterm || null,
        expected_at: d.expected_at || null,
        warehouse_id: d.warehouse_id ? Number(d.warehouse_id) : null,
        notes: d.notes || null,
        lines: d.lines.map((l) => ({
            item_variant_id: l.variant.id,
            quantity: num(l.quantity),
            unit_price: num(l.unit_price),
            cbm: orNull(l.cbm),
            weight_kg: orNull(l.weight_kg),
            supplier_sku: l.supplier_sku || null,
        })),
    }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (order) put(route("procurement.purchase_orders.update", order.id));
        else post(route("procurement.purchase_orders.store"));
    };

    return (
        <>
            <Head title={order ? `Edit ${order.reference_number}` : "New purchase order"} />

            <SkHeader
                title={order ? `Edit ${order.reference_number}` : "New purchase order"}
                subtitle="Saved as a draft. Quantities are in each SKU's own packaging unit; prices in the supplier's currency."
            />

            {suppliers.length === 0 ? (
                <EmptyState
                    framed
                    icon="storefront"
                    title="Add a supplier first"
                    description="An order is always raised with a supplier."
                    action={
                        <Link href={route("procurement.suppliers.create")} className="rounded-[12px] bg-primary px-4 py-2 text-[14px] font-bold text-on-primary">
                            Add supplier
                        </Link>
                    }
                />
            ) : (
                <form onSubmit={submit} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="space-y-4 xl:col-span-2">
                        <SkCard>
                            <SkCardHeader icon="list_alt" title="Lines" right={<span className="text-[13px] font-bold text-on-surface-variant">{data.lines.length}</span>} />
                            <div className="space-y-3 p-4">
                                <VariantSearch onPick={addLine} exclude={data.lines.map((l) => l.variant.id)} />
                                {err.lines ? <p className="text-[12px] text-error">{err.lines}</p> : null}

                                {data.lines.length === 0 ? <p className="py-4 text-center text-[13px] text-on-surface-variant">No lines yet. Find a SKU above to add it.</p> : null}

                                {data.lines.map((l, i) => {
                                    const lineError = ["item_variant_id", "quantity", "unit_price", "cbm", "weight_kg"].map((f) => err[`lines.${i}.${f}`]).find(Boolean);
                                    return (
                                        <div key={l.key} className="rounded-[14px] border border-outline-variant/70 p-3">
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[14px] font-bold">
                                                        {l.variant.name}
                                                        {l.variant.detail ? <span className="font-normal text-on-surface-variant"> · {l.variant.detail}</span> : null}
                                                    </p>
                                                    <p className="truncate font-mono text-[12px] text-on-surface-variant">{l.variant.sku}</p>
                                                </div>
                                                <SkButton variant="danger" icon="delete" aria-label={`Remove ${l.variant.sku}`} className="px-2 py-1.5" onClick={() => setData("lines", data.lines.filter((x) => x.key !== l.key))} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                                <SkField label={`Qty (${l.variant.unit})`}>
                                                    <input type="number" min={1} step={1} className={inputClass} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                                                </SkField>
                                                <SkField label={`Unit price (${data.currency})`}>
                                                    <input type="number" min={0} step="0.0001" className={inputClass} value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} />
                                                </SkField>
                                                <SkField label="CBM (line)">
                                                    <input type="number" min={0} step="0.0001" className={inputClass} value={l.cbm} onChange={(e) => setLine(l.key, { cbm: e.target.value })} />
                                                </SkField>
                                                <SkField label="Weight kg (line)">
                                                    <input type="number" min={0} step="0.001" className={inputClass} value={l.weight_kg} onChange={(e) => setLine(l.key, { weight_kg: e.target.value })} />
                                                </SkField>
                                                <SkField label="Supplier's code">
                                                    <input className={inputClass} value={l.supplier_sku} onChange={(e) => setLine(l.key, { supplier_sku: e.target.value })} />
                                                </SkField>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between text-[13px]">
                                                {lineError ? <span className="text-error">{lineError}</span> : <span />}
                                                <span className="font-bold tabular-nums">{money(num(l.quantity) * num(l.unit_price), data.currency)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </SkCard>

                        {data.payment_terms === "installments" ? (
                            <SkCard>
                                <SkCardHeader
                                    icon="event_repeat"
                                    title="Installments"
                                    right={
                                        <SkButton
                                            variant="ghost"
                                            icon="add"
                                            disabled={data.payment_schedule.length >= 12}
                                            onClick={() => setData("payment_schedule", [...data.payment_schedule, { key: `s${Date.now()}`, label: "", by: "percent", value: "", due: "after_order", days: "30", date: "" }])}
                                        >
                                            Add
                                        </SkButton>
                                    }
                                />
                                <div className="space-y-3 p-4">
                                    {data.payment_schedule.map((r, i) => (
                                        <div key={r.key} className="grid grid-cols-2 gap-2 rounded-[14px] border border-outline-variant/70 p-3 sm:grid-cols-[1.3fr_0.8fr_1fr_1.3fr_0.9fr_auto]">
                                            <input className={inputClass} placeholder={i === 0 ? "Deposit" : `Installment ${i + 1}`} value={r.label} onChange={(e) => setRow(r.key, { label: e.target.value })} aria-label={`Installment ${i + 1} name`} />
                                            <select className={inputClass} value={r.by} onChange={(e) => setRow(r.key, { by: e.target.value as "percent" | "amount" })} aria-label={`Installment ${i + 1} given as`}>
                                                <option value="percent">%</option>
                                                <option value="amount">{data.currency}</option>
                                            </select>
                                            <input type="number" min={0} step="0.01" className={inputClass} placeholder={r.by === "percent" ? "30" : "1000"} value={r.value} onChange={(e) => setRow(r.key, { value: e.target.value })} aria-label={`Installment ${i + 1} ${r.by}`} />
                                            <select className={inputClass} value={r.due} onChange={(e) => setRow(r.key, { due: e.target.value as DueRule })} aria-label={`Installment ${i + 1} due`}>
                                                {DUE_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {r.due === "on_date" ? (
                                                <input type="date" className={inputClass} value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} aria-label={`Installment ${i + 1} date`} />
                                            ) : r.due === "on_order" ? (
                                                <span />
                                            ) : (
                                                <input type="number" min={0} className={inputClass} placeholder="days" value={r.days} onChange={(e) => setRow(r.key, { days: e.target.value })} aria-label={`Installment ${i + 1} days`} />
                                            )}
                                            <SkButton variant="danger" icon="delete" aria-label={`Remove installment ${i + 1}`} className="px-2 py-1.5" disabled={data.payment_schedule.length <= 1} onClick={() => setData("payment_schedule", data.payment_schedule.filter((x) => x.key !== r.key))} />
                                        </div>
                                    ))}
                                    {(() => {
                                        const percent = data.payment_schedule.filter((r) => r.by === "percent").reduce((a, r) => a + num(r.value), 0);
                                        const fixed = data.payment_schedule.filter((r) => r.by === "amount").reduce((a, r) => a + num(r.value), 0);
                                        const planned = Math.round((fixed + (subtotal * percent) / 100) * 100) / 100;
                                        const off = Math.abs(planned - subtotal) > 0.01 * data.payment_schedule.length;
                                        return (
                                            <p className={`text-[13px] ${off ? "font-bold text-warning" : "text-on-surface-variant"}`}>
                                                Planned {money(planned, data.currency)} of {money(subtotal, data.currency)}
                                                {off ? ": the installments must add up to the order before it can be submitted." : ". Days after shipping or arrival get their date when that happens."}
                                            </p>
                                        );
                                    })()}
                                    {scheduleError ? <p className="text-[12px] text-error">{scheduleError}</p> : null}
                                </div>
                            </SkCard>
                        ) : null}

                        <SkCard>
                            <SkCardHeader icon="notes" title="Notes" />
                            <div className="p-4">
                                <textarea className={inputClass} rows={3} value={data.notes} onChange={(e) => setData("notes", e.target.value)} aria-label="Notes" placeholder="Anything the approver or the supplier should know" />
                            </div>
                        </SkCard>
                    </div>

                    <div className="space-y-4">
                        <SkCard>
                            <SkCardHeader icon="storefront" title="Supplier and terms" />
                            <div className="space-y-4 p-4">
                                <SkField label="Supplier" error={err.supplier_id} hint={supplierMissing ? "This order's supplier is inactive: pick an active one to save." : undefined}>
                                    <select className={inputClass} value={data.supplier_id} onChange={(e) => pickSupplier(e.target.value)} required>
                                        <option value="">Choose…</option>
                                        {suppliers.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                                {s.country ? ` (${s.country})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </SkField>
                                <div className="grid grid-cols-2 gap-3">
                                    <SkField label="Currency" error={err.currency}>
                                        <select className={inputClass} value={data.currency} onChange={(e) => setData("currency", e.target.value)}>
                                            {currencies.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </select>
                                    </SkField>
                                    <SkField label={`1 ${data.currency} = ? ${homeCurrency}`} error={err.exchange_rate}>
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.000001"
                                            className={inputClass}
                                            value={foreign ? data.exchange_rate : "1"}
                                            disabled={!foreign}
                                            onChange={(e) => setData("exchange_rate", e.target.value)}
                                        />
                                    </SkField>
                                </div>
                                <SkField label="Payment terms" error={err.payment_terms}>
                                    <select className={inputClass} value={data.payment_terms} onChange={(e) => setData("payment_terms", e.target.value as PaymentTerms)}>
                                        {(Object.keys(paymentTerms) as PaymentTerms[]).map((k) => (
                                            <option key={k} value={k}>
                                                {paymentTerms[k]}
                                            </option>
                                        ))}
                                    </select>
                                </SkField>
                                {data.payment_terms === "fixed_date" ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <SkField label="Days" error={err.payment_days}>
                                            <input type="number" min={0} className={inputClass} value={data.payment_days} onChange={(e) => setData("payment_days", e.target.value)} />
                                        </SkField>
                                        <SkField label="Counted from" error={err.payment_anchor}>
                                            <select className={inputClass} value={data.payment_anchor} onChange={(e) => setData("payment_anchor", e.target.value as "order" | "shipping")}>
                                                <option value="order">The order</option>
                                                <option value="shipping">Shipping (B/L)</option>
                                            </select>
                                        </SkField>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 gap-3">
                                    <SkField label="Incoterm" error={err.incoterm}>
                                        <select className={inputClass} value={data.incoterm} onChange={(e) => setData("incoterm", e.target.value)}>
                                            <option value="">—</option>
                                            {INCOTERMS.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </SkField>
                                    <SkField label="Expected" error={err.expected_at}>
                                        <input type="date" className={inputClass} value={data.expected_at} onChange={(e) => setData("expected_at", e.target.value)} />
                                    </SkField>
                                </div>
                                <SkField label="For hub" error={err.warehouse_id} hint="Where the goods should end up. Can be decided later.">
                                    <select className={inputClass} value={data.warehouse_id} onChange={(e) => setData("warehouse_id", e.target.value)}>
                                        <option value="">Decide later</option>
                                        {warehouses.map((w) => (
                                            <option key={w.id} value={w.id}>
                                                {w.name}
                                                {w.code ? ` (${w.code})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </SkField>
                            </div>
                        </SkCard>

                        <SkCard>
                            <SkCardHeader icon="calculate" title="Total" />
                            <dl className="space-y-1.5 p-4 text-[14px]">
                                <div className="flex justify-between">
                                    <dt className="text-on-surface-variant">Lines</dt>
                                    <dd className="font-bold tabular-nums">{money(subtotal, data.currency)}</dd>
                                </div>
                                {foreign ? (
                                    <div className="flex justify-between">
                                        <dt className="text-on-surface-variant">In {homeCurrency}</dt>
                                        <dd className="font-bold tabular-nums">{rate > 0 ? money(totalEtb, homeCurrency) : "set the rate"}</dd>
                                    </div>
                                ) : null}
                                <div className="flex justify-between text-[13px] text-on-surface-variant">
                                    <dt>Volume · weight</dt>
                                    <dd className="tabular-nums">
                                        {cbm.toFixed(2)} m³ · {weight.toLocaleString()} kg
                                    </dd>
                                </div>
                                <p className={`pt-2 text-[12px] ${totalEtb >= adminLimit ? "font-bold text-warning" : "text-on-surface-variant"}`}>
                                    {totalEtb >= adminLimit
                                        ? `From ${money(adminLimit, homeCurrency)} a global admin approves this order.`
                                        : "Another procurement user or an admin approves this order."}
                                </p>
                            </dl>
                        </SkCard>

                        <div className="flex flex-col gap-2">
                            <SkButton type="submit" icon="save" disabled={processing || data.lines.length === 0}>
                                Save draft
                            </SkButton>
                            <Link
                                href={order ? route("procurement.purchase_orders.show", order.id) : route("procurement.purchase_orders.index")}
                                className="text-center text-[14px] font-bold text-on-surface-variant hover:text-primary"
                            >
                                Cancel
                            </Link>
                        </div>
                    </div>
                </form>
            )}
        </>
    );
}

PurchaseOrderForm.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
