import React from "react";
import { Head, Link, router, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, SkStats, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import { CostRow } from "@/Components/Procurement/ImportCostInbox";
import type { ConsignmentCostRow, ConsignmentDetail } from "@/types/procurement";

interface Available {
    id: number;
    purchase: { id: number; reference: string; supplier: string | null };
    variant: { name: string; detail: string | null; unit: string; sku: string } | null;
    remaining: number;
    quantity: number;
}

interface Props {
    consignment: ConsignmentDetail;
    available?: Available[];
    routes?: Array<{ id: number; name: string }>;
    kinds?: Array<{ key: string; label: string; allocation: string; recoverable: boolean }>;
    currencies?: string[];
    rates?: Record<string, number | null>;
}

const ALLOCATION_LABEL: Record<string, string> = { cbm: "by size (CBM)", value: "by value", weight: "by weight" };

/**
 * One consignment: where the goods are, what is on it, what each stage cost,
 * each line's landed cost so far, and the estimate beside what was paid.
 */
export default function ProcurementConsignment({ consignment: c, available = [], kinds = [], currencies = [], rates = {} }: Props) {
    const [adding, setAdding] = React.useState(false);
    const [costing, setCosting] = React.useState(false);
    const [moving, setMoving] = React.useState<{ stage: string; label: string } | null>(null);
    const forming = c.stage === "forming";

    return (
        <>
            <Head title={`Consignment ${c.reference}`} />
            <SkHeader
                title={c.reference}
                subtitle={[c.route, c.container_number, c.bill_of_lading ? `B/L ${c.bill_of_lading}` : null, c.eta ? `ETA ${when(c.eta)}` : null].filter(Boolean).join(" · ") || "No route yet"}
                actions={
                    <Link href={route("procurement.consignments.index")} className="text-[14px] font-semibold text-primary">
                        All shipments in
                    </Link>
                }
            />

            <SkCard className="mb-4">
                <ol className="flex flex-wrap gap-2 p-4">
                    {c.timeline.map((t) => (
                        <li
                            key={t.stage}
                            className={`flex items-center gap-1.5 rounded-[999px] border px-3 py-1.5 text-[13px] ${
                                t.state === "current" ? "border-primary bg-primary text-on-primary" : t.state === "done" ? "border-success/40 bg-success-container/50" : "border-outline-variant text-on-surface-variant"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">{t.state === "done" ? "check_circle" : t.state === "current" ? "radio_button_checked" : "radio_button_unchecked"}</span>
                            {t.label}
                            {t.date ? <span className="opacity-80">· {when(t.date)}</span> : null}
                        </li>
                    ))}
                </ol>
                {c.can_manage && c.next_stages.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/60 px-4 py-3">
                        <span className="text-[13px] text-on-surface-variant">Goods have got to:</span>
                        {c.next_stages.map((s) => (
                            <SkButton key={s.stage} variant="outline" disabled={c.lines_detail.length === 0} onClick={() => setMoving(s)}>
                                {s.label}
                            </SkButton>
                        ))}
                        {forming ? (
                            <SkButton variant="danger" onClick={() => router.post(route("procurement.consignments.cancel", c.id), {}, { preserveScroll: true })}>
                                Cancel it
                            </SkButton>
                        ) : null}
                    </div>
                ) : null}
                {c.stock_location ? <p className="border-t border-outline-variant/60 px-4 py-2 text-[12px] text-on-surface-variant">In stock at “{c.stock_location}”: ours, on its way, not sellable yet.</p> : null}
                {!c.received && c.stage !== "forming" && c.stage !== "cancelled" ? (
                    <p className="border-t border-outline-variant/60 px-4 py-2 text-[12px] text-on-surface-variant">The Main Hub's stock keepers count it in under Arrivals when it gets there.</p>
                ) : null}
            </SkCard>

            {c.received ? (
                <SkCard className="mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[14px]">
                        <div>
                            <p className="font-semibold">
                                Received at {c.received.location} · {when(c.received.at)}
                                {c.received.by ? ` · ${c.received.by}` : ""}
                            </p>
                            {c.received.open_discrepancies > 0 ? (
                                <p className="text-[13px] text-warning">{c.received.open_discrepancies} short or over still to settle (stock keeper → Receiving).</p>
                            ) : null}
                            <p className="text-[13px] text-on-surface-variant">
                                {c.costs_finalised_at
                                    ? `Costs finalised ${when(c.costs_finalised_at)}: each item's cost is written.`
                                    : c.finalise_blocker ?? "Every cost is confirmed: finalise to write each item's cost."}
                            </p>
                        </div>
                        {c.can_finalise ? (
                            <SkButton icon="task_alt" onClick={() => router.post(route("procurement.consignments.finalise", c.id), {}, { preserveScroll: true })}>
                                Finalise costs
                            </SkButton>
                        ) : null}
                    </div>
                </SkCard>
            ) : null}

            <SkStats
                cols={4}
                items={[
                    { label: "Goods", value: money(c.goods_value_etb), hint: `${c.units} units · ${c.cbm} CBM` },
                    { label: "Costs confirmed", value: money(c.costs_confirmed_etb), hint: c.costs_pending > 0 ? `${c.costs_pending} waiting to be confirmed` : undefined },
                    { label: "Landed so far", value: money(c.goods_value_etb + c.lines_detail.reduce((s, l) => s + l.costs_etb, 0)) },
                    { label: "Lines", value: c.lines },
                ]}
            />

            <SkCard className="my-4">
                <SkCardHeader
                    icon="inventory_2"
                    title="Goods on it"
                    right={
                        forming && c.can_manage ? (
                            <SkButton variant="outline" icon="add" disabled={available.length === 0} onClick={() => setAdding(true)}>
                                From an order
                            </SkButton>
                        ) : null
                    }
                />
                {c.lines_detail.length === 0 ? (
                    <div className="p-4">
                        <EmptyState icon="inventory_2" title="Nothing on it yet" description={available.length > 0 ? "Put lines of placed orders on it." : "No placed order has goods left to send."} />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                                    <th className="px-4 py-2 font-semibold">Item</th>
                                    <th className="px-4 py-2 font-semibold">Order</th>
                                    <th className="px-4 py-2 text-right font-semibold">Qty</th>
                                    <th className="px-4 py-2 text-right font-semibold">CBM</th>
                                    {c.received ? <th className="px-4 py-2 text-right font-semibold">Arrived / broken</th> : null}
                                    <th className="px-4 py-2 text-right font-semibold">Goods</th>
                                    <th className="px-4 py-2 text-right font-semibold">Its costs</th>
                                    <th className="px-4 py-2 text-right font-semibold">Landed / unit</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {c.lines_detail.map((l) => (
                                    <tr key={l.id} className="border-b border-outline-variant/60 last:border-0">
                                        <td className="px-4 py-2">
                                            <span className="font-semibold">{l.variant?.name}</span>
                                            {l.variant?.detail ? <span className="text-on-surface-variant"> · {l.variant.detail}</span> : null}
                                        </td>
                                        <td className="px-4 py-2 font-mono">{l.purchase?.reference}</td>
                                        <td className="px-4 py-2 text-right">
                                            {l.quantity} {l.variant?.unit}
                                        </td>
                                        <td className="px-4 py-2 text-right">{l.cbm ?? "—"}</td>
                                        {c.received ? (
                                            <td className={`px-4 py-2 text-right ${l.received_quantity !== null && l.received_quantity !== l.quantity ? "text-warning" : ""}`}>
                                                {l.received_quantity ?? "—"} / {l.damaged_quantity ?? 0}
                                            </td>
                                        ) : null}
                                        <td className="px-4 py-2 text-right">{money(l.goods_value_etb)}</td>
                                        <td className="px-4 py-2 text-right">{money(l.costs_etb)}</td>
                                        <td className="px-4 py-2 text-right font-bold" title={l.final_unit_etb !== null ? "Final: per unit that arrived whole" : "So far, per unit sent"}>
                                            {money(l.final_unit_etb ?? l.landed_unit_etb)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {forming && c.can_manage ? (
                                                <button type="button" className="font-semibold text-error" onClick={() => router.delete(route("procurement.consignments.lines.destroy", l.id), { preserveScroll: true })}>
                                                    Take off
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {c.allocation_warnings.length > 0 ? (
                    <ul className="border-t border-outline-variant/60 px-4 py-2 text-[12px] text-warning">
                        {c.allocation_warnings.map((w) => (
                            <li key={w}>{w}</li>
                        ))}
                    </ul>
                ) : null}
            </SkCard>

            <SkCard className="mb-4">
                <SkCardHeader
                    icon="payments"
                    title="Costs on the way"
                    right={
                        c.can_record_costs ? (
                            <SkButton variant="outline" icon="add" onClick={() => setCosting(true)}>
                                Record a cost
                            </SkButton>
                        ) : null
                    }
                />
                {c.costs_detail.length === 0 ? (
                    <p className="p-4 text-[13px] text-on-surface-variant">No costs yet. Record each payment (freight, customs, port…) with its receipt.</p>
                ) : (
                    <div className="space-y-2 p-4">
                        {c.costs_detail.map((x) => (
                            <CostLine key={x.id} cost={x} consignmentRef={c.reference} consignmentId={c.id} />
                        ))}
                    </div>
                )}
            </SkCard>

            {c.comparison.length > 0 ? (
                <SkCard>
                    <SkCardHeader icon="compare_arrows" title="Estimate and what was paid" />
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                                <th className="px-4 py-2 font-semibold">Cost</th>
                                <th className="px-4 py-2 text-right font-semibold">Estimated</th>
                                <th className="px-4 py-2 text-right font-semibold">Confirmed</th>
                                <th className="px-4 py-2 text-right font-semibold">Waiting</th>
                            </tr>
                        </thead>
                        <tbody>
                            {c.comparison.map((r) => (
                                <tr key={r.kind} className="border-b border-outline-variant/60 last:border-0">
                                    <td className="px-4 py-2">{r.label}</td>
                                    <td className="px-4 py-2 text-right">{money(r.estimated)}</td>
                                    <td className={`px-4 py-2 text-right font-semibold ${r.estimated > 0 && r.actual > r.estimated * 1.1 ? "text-error" : ""}`}>{money(r.actual)}</td>
                                    <td className="px-4 py-2 text-right text-on-surface-variant">{r.pending ? money(r.pending) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="px-4 py-2 text-[12px] text-on-surface-variant">The estimate uses the route and each item's tariff (its HS code) as they are today.</p>
                </SkCard>
            ) : null}

            <AddLineSheet open={adding} onClose={() => setAdding(false)} consignmentId={c.id} available={available} />
            <CostSheet open={costing} onClose={() => setCosting(false)} consignmentId={c.id} stage={c.timeline.some((t) => t.stage === c.stage) ? c.stage : "dry_port"} timeline={c.timeline} kinds={kinds} currencies={currencies} rates={rates} />
            <SkSheet
                open={moving !== null}
                onClose={() => setMoving(null)}
                title={moving ? `Goods are ${moving.label.toLowerCase()}?` : ""}
                subtitle={forming ? "From now on we own them: they go into stock at this stage, and the lines can no longer change." : "Their stock moves to this stage."}
                footer={
                    <div className="flex justify-end gap-2">
                        <SkButton variant="ghost" onClick={() => setMoving(null)}>
                            Not yet
                        </SkButton>
                        <SkButton
                            onClick={() => moving && router.post(route("procurement.consignments.advance", c.id), { to: moving.stage }, { preserveScroll: true, onFinish: () => setMoving(null) })}
                        >
                            Yes, move them
                        </SkButton>
                    </div>
                }
            >
                <p className="text-[14px]">
                    {c.units} units on {c.lines} lines.
                </p>
            </SkSheet>
        </>
    );
}

function CostLine({ cost, consignmentRef, consignmentId }: { cost: ConsignmentCostRow; consignmentRef: string; consignmentId: number }) {
    if (cost.state === "pending" && cost.can_confirm) {
        return (
            <CostRow
                routePrefix="procurement.import_costs"
                cost={{ ...cost, consignment: { id: consignmentId, reference: consignmentRef } }}
            />
        );
    }

    return (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-outline-variant p-3 text-[13px]">
            <div className="min-w-0">
                <p className="font-semibold">
                    {cost.label}
                    {cost.description ? <span className="font-normal text-on-surface-variant"> · {cost.description}</span> : null}
                </p>
                <p className="text-[12px] text-on-surface-variant">
                    {cost.stage_label} · spread {ALLOCATION_LABEL[cost.allocation]}
                    {cost.recoverable ? " · claimed back" : ""}
                    {cost.reference ? ` · receipt ${cost.reference}` : ""}
                    {cost.recorded_by ? ` · ${cost.recorded_by}` : ""}
                    {cost.confirmed_by ? `, confirmed by ${cost.confirmed_by}` : ""}
                </p>
                {cost.reject_reason ? <p className="text-[12px] italic text-error">{cost.reject_reason}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-right">
                    <span className="block font-bold">
                        {cost.currency} {cost.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {cost.currency !== "ETB" ? <span className="block text-[12px] text-on-surface-variant">{money(cost.amount_etb)}</span> : null}
                </span>
                <StatusPill label={cost.state === "pending" ? "Waiting" : cost.state === "confirmed" ? "Confirmed" : "Rejected"} tone={cost.state === "pending" ? "warning" : cost.state === "confirmed" ? "success" : "error"} size="xs" />
                {cost.can_delete ? (
                    <button type="button" className="text-[12px] font-semibold text-error" onClick={() => router.delete(route("procurement.consignments.costs.destroy", cost.id), { preserveScroll: true })}>
                        Take back
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function AddLineSheet({ open, onClose, consignmentId, available }: { open: boolean; onClose: () => void; consignmentId: number; available: Available[] }) {
    const form = useForm({ purchase_line_id: "", quantity: "", cbm: "", weight_kg: "" });
    const picked = available.find((a) => String(a.id) === form.data.purchase_line_id);

    React.useEffect(() => {
        if (open && available[0]) form.setData({ purchase_line_id: String(available[0].id), quantity: String(available[0].remaining), cbm: "", weight_kg: "" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            title="Put goods on it"
            subtitle="All of an order line, or part of it. Size and weight default to the line's share."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton disabled={form.processing || !picked} onClick={() => form.post(route("procurement.consignments.lines.store", consignmentId), { preserveScroll: true, onSuccess: onClose })}>
                        Put on
                    </SkButton>
                </div>
            }
        >
            <div className="space-y-4">
                <SkField label="Order line" error={form.errors.purchase_line_id}>
                    <select
                        className={inputClass}
                        value={form.data.purchase_line_id}
                        onChange={(e) => {
                            const a = available.find((x) => String(x.id) === e.target.value);
                            form.setData({ ...form.data, purchase_line_id: e.target.value, quantity: a ? String(a.remaining) : "" });
                        }}
                    >
                        {available.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.purchase.reference} · {a.variant?.name}
                                {a.variant?.detail ? ` (${a.variant.detail})` : ""} · {a.remaining} left
                            </option>
                        ))}
                    </select>
                </SkField>
                <SkField label={`How many${picked?.variant ? ` (${picked.variant.unit})` : ""}`} hint={picked ? `Up to ${picked.remaining}` : undefined} error={form.errors.quantity}>
                    <input className={inputClass} type="number" min={1} max={picked?.remaining} value={form.data.quantity} onChange={(e) => form.setData("quantity", e.target.value)} />
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="CBM (optional)" error={form.errors.cbm}>
                        <input className={inputClass} type="number" step="0.0001" min={0} value={form.data.cbm} onChange={(e) => form.setData("cbm", e.target.value)} placeholder="the line's share" />
                    </SkField>
                    <SkField label="kg (optional)" error={form.errors.weight_kg}>
                        <input className={inputClass} type="number" step="0.001" min={0} value={form.data.weight_kg} onChange={(e) => form.setData("weight_kg", e.target.value)} placeholder="the line's share" />
                    </SkField>
                </div>
            </div>
        </SkSheet>
    );
}

function CostSheet({
    open,
    onClose,
    consignmentId,
    stage,
    timeline,
    kinds,
    currencies,
    rates,
}: {
    open: boolean;
    onClose: () => void;
    consignmentId: number;
    stage: string;
    timeline: ConsignmentDetail["timeline"];
    kinds: NonNullable<Props["kinds"]>;
    currencies: string[];
    rates: Record<string, number | null>;
}) {
    const first = kinds[0];
    const form = useForm({
        stage,
        kind: first?.key ?? "freight",
        description: "",
        currency: "ETB",
        exchange_rate: "",
        amount: "",
        allocation: first?.allocation ?? "cbm",
        recoverable: first?.recoverable ?? false,
        reference: "",
        paid_on: "",
    });

    React.useEffect(() => {
        if (open) form.setData("stage", stage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, stage]);

    const latest = rates[form.data.currency];

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            wide
            title="Record a cost"
            subtitle="Finance or a global admin confirms it against the receipt; until then it does not count."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton
                        disabled={form.processing || form.data.amount === ""}
                        onClick={() =>
                            form.post(route("procurement.consignments.costs.store", consignmentId), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    form.reset("amount", "description", "reference", "exchange_rate");
                                    onClose();
                                },
                            })
                        }
                    >
                        Record
                    </SkButton>
                </div>
            }
        >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SkField label="What for" error={form.errors.kind}>
                    <select
                        className={inputClass}
                        value={form.data.kind}
                        onChange={(e) => {
                            const k = kinds.find((x) => x.key === e.target.value);
                            form.setData({ ...form.data, kind: e.target.value, allocation: k?.allocation ?? form.data.allocation, recoverable: k?.recoverable ?? false });
                        }}
                    >
                        {kinds.map((k) => (
                            <option key={k.key} value={k.key}>
                                {k.label}
                            </option>
                        ))}
                    </select>
                </SkField>
                <SkField label="At which stage" error={form.errors.stage}>
                    <select className={inputClass} value={form.data.stage} onChange={(e) => form.setData("stage", e.target.value)}>
                        {timeline.map((t) => (
                            <option key={t.stage} value={t.stage}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </SkField>
                {form.data.kind === "misc" ? (
                    <div className="sm:col-span-2">
                        <SkField label="Description" error={form.errors.description}>
                            <input className={inputClass} value={form.data.description} onChange={(e) => form.setData("description", e.target.value)} placeholder="Fumigation certificate" />
                        </SkField>
                    </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="Currency" error={form.errors.currency}>
                        <select className={inputClass} value={form.data.currency} onChange={(e) => form.setData("currency", e.target.value)}>
                            {currencies.map((cur) => (
                                <option key={cur}>{cur}</option>
                            ))}
                        </select>
                    </SkField>
                    <SkField label="Amount" error={form.errors.amount}>
                        <input className={inputClass} type="number" step="0.01" min={0} value={form.data.amount} onChange={(e) => form.setData("amount", e.target.value)} />
                    </SkField>
                </div>
                {form.data.currency !== "ETB" ? (
                    <SkField label="ETB per 1" hint={latest ? "Empty: today's rate" : "No rate set: type one"} error={form.errors.exchange_rate}>
                        <input className={inputClass} type="number" step="0.0001" min={0} value={form.data.exchange_rate} onChange={(e) => form.setData("exchange_rate", e.target.value)} placeholder={latest ? String(latest) : ""} />
                    </SkField>
                ) : (
                    <span />
                )}
                <SkField label="Spread over the goods" error={form.errors.allocation}>
                    <select className={inputClass} value={form.data.allocation} onChange={(e) => form.setData("allocation", e.target.value)}>
                        <option value="cbm">By size (CBM)</option>
                        <option value="value">By value</option>
                        <option value="weight">By weight</option>
                    </select>
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="Receipt no." error={form.errors.reference}>
                        <input className={inputClass} value={form.data.reference} onChange={(e) => form.setData("reference", e.target.value)} />
                    </SkField>
                    <SkField label="Paid on" error={form.errors.paid_on}>
                        <input className={inputClass} type="date" value={form.data.paid_on} onChange={(e) => form.setData("paid_on", e.target.value)} />
                    </SkField>
                </div>
                <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                    <input type="checkbox" checked={Boolean(form.data.recoverable)} onChange={(e) => form.setData("recoverable", e.target.checked)} />
                    Claimed back (VAT, withholding): paid, but not part of the goods' cost
                </label>
            </div>
        </SkSheet>
    );
}

ProcurementConsignment.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
