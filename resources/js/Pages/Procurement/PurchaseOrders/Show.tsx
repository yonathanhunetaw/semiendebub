import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import { InstallmentPill, METHOD_LABEL, PaymentPill, PurchaseStatusPill, day, dueText, money, termsLabel } from "@/Components/Procurement/procurementUi";
import type { Installment, PurchaseDetail } from "@/types/procurement";

interface Props {
    order: PurchaseDetail;
    adminLimit: number;
    homeCurrency: string;
    accounts?: Array<{ id: number; label: string }>;
    methods?: string[];
}

type Sheet = null | "send_back" | "cancel" | "ordered";

interface PayForm {
    installment: Installment;
    amount: string;
    rate: string;
    paid_on: string;
    method: string;
    account: string;
    reference: string;
    notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The schedule, what was paid on it, and recording a new payment. */
function PaymentsCard({ order, homeCurrency, accounts, methods }: { order: PurchaseDetail; homeCurrency: string; accounts: Array<{ id: number; label: string }>; methods: string[] }) {
    const { payable, preview, preview_problem, payments, can_pay } = order.money;
    const foreign = order.currency !== homeCurrency;
    const [pay, setPay] = React.useState<PayForm | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const openPay = (i: Installment) => {
        setErrors({});
        setPay({ installment: i, amount: String(i.payable_now), rate: foreign ? String(order.exchange_rate) : "1", paid_on: today(), method: foreign ? "swift" : "bank_transfer", account: "", reference: "", notes: "" });
    };

    const submit = () => {
        if (!pay) return;
        setBusy(true);
        router.post(
            route("procurement.purchase_orders.payments.store", order.id),
            {
                payable_installment_id: pay.installment.id,
                amount: pay.amount,
                exchange_rate: foreign ? pay.rate : null,
                paid_on: pay.paid_on,
                method: pay.method,
                payment_account_id: pay.account || null,
                reference: pay.reference || null,
                notes: pay.notes || null,
            },
            { preserveScroll: true, onSuccess: () => setPay(null), onError: (e) => setErrors(e), onFinish: () => setBusy(false) },
        );
    };

    return (
        <SkCard>
            <SkCardHeader
                icon="payments"
                title="Payments"
                right={payable ? <span className="text-[13px] font-bold tabular-nums text-on-surface-variant">{money(payable.remaining, payable.currency)} left</span> : <span className="text-[12px] text-on-surface-variant">Schedule fixed on approval</span>}
            />

            {payable ? (
                <>
                    <ul className="divide-y divide-outline-variant/60">
                        {payable.installments.map((i) => (
                            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="text-[14px] font-bold">{i.label}</span>
                                        <InstallmentPill state={i.state} />
                                    </span>
                                    <span className="block text-[12px] text-on-surface-variant">
                                        Due {dueText(i.due_rule, i.due_days, i.due_on)}
                                        {i.percent != null ? ` · ${i.percent}%` : ""}
                                        {i.waiting > 0 ? ` · ${money(i.waiting, payable.currency)} to confirm` : ""}
                                    </span>
                                </span>
                                <span className="flex items-center gap-3">
                                    <span className="text-right tabular-nums">
                                        <span className="block text-[14px] font-bold">{money(i.amount, payable.currency)}</span>
                                        <span className="block text-[12px] text-on-surface-variant">paid {money(i.paid, payable.currency)}</span>
                                    </span>
                                    {can_pay && i.payable_now > 0 ? (
                                        <SkButton variant="outline" icon="add_card" className="px-3 py-2" onClick={() => openPay(i)}>
                                            Record payment
                                        </SkButton>
                                    ) : null}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap justify-between gap-2 border-t border-outline-variant/70 px-4 py-2.5 text-[12px] text-on-surface-variant">
                        <span>
                            Paid {money(payable.paid, payable.currency)}
                            {foreign ? ` (${money(payable.paid_etb)} at the rates paid)` : ""}
                        </span>
                        {foreign && payable.remaining > 0 ? <span>Left ≈ {money(payable.remaining_etb_estimate)} at the order's rate</span> : null}
                        {payable.cancelled ? <span className="font-bold">Order cancelled: nothing more is owed.</span> : null}
                    </div>
                </>
            ) : preview_problem ? (
                <p className="px-4 py-3 text-[13px] font-bold text-warning">{preview_problem}</p>
            ) : (
                <ul className="divide-y divide-outline-variant/60">
                    {preview.map((r) => (
                        <li key={r.sequence} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]">
                            <span>
                                <span className="font-bold">{r.label}</span>
                                <span className="block text-[12px] text-on-surface-variant">Due {dueText(r.due_rule, r.due_days, r.due_date)}</span>
                            </span>
                            <span className="font-bold tabular-nums">{money(r.amount, order.currency)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {payments.length > 0 ? (
                <div className="border-t border-outline-variant/70">
                    <p className="px-4 pt-3 text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">Recorded</p>
                    <ul className="divide-y divide-outline-variant/60">
                        {payments.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="font-bold tabular-nums">{money(p.amount, p.currency)}</span>
                                        <PaymentPill status={p.status} />
                                    </span>
                                    <span className="block text-[12px] text-on-surface-variant">
                                        {p.installment} · {METHOD_LABEL[p.method] ?? p.method} · {day(p.paid_on)}
                                        {p.reference ? ` · ${p.reference}` : ""} · by {p.claimed_by ?? "—"}
                                        {p.confirmed_by ? `, confirmed by ${p.confirmed_by}` : ""}
                                        {p.status === "rejected" ? `, rejected by ${p.rejected_by ?? "—"}: ${p.reject_reason ?? ""}` : ""}
                                    </span>
                                </span>
                                {p.currency !== homeCurrency ? <span className="text-right text-[12px] tabular-nums text-on-surface-variant">{money(p.amount_etb)} @ {p.exchange_rate}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <SkSheet
                open={pay !== null}
                onClose={() => setPay(null)}
                title={`Record payment · ${pay?.installment.label ?? ""}`}
                subtitle="Money you already sent. Finance or a global admin checks it left the account and confirms it."
                footer={
                    <>
                        <SkButton variant="ghost" onClick={() => setPay(null)}>
                            Cancel
                        </SkButton>
                        <SkButton disabled={busy || !pay || Number(pay.amount) <= 0} onClick={submit}>
                            Record payment
                        </SkButton>
                    </>
                }
            >
                {pay ? (
                    <div className="grid grid-cols-2 gap-3">
                        <SkField label={`Amount (${order.currency})`} error={errors.amount} hint={`Up to ${money(pay.installment.payable_now, order.currency)}`}>
                            <input type="number" min={0} step="0.01" className={inputClass} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                        </SkField>
                        {foreign ? (
                            <SkField label={`Rate paid (1 ${order.currency} = ? ${homeCurrency})`} error={errors.exchange_rate}>
                                <input type="number" min={0} step="0.000001" className={inputClass} value={pay.rate} onChange={(e) => setPay({ ...pay, rate: e.target.value })} />
                            </SkField>
                        ) : (
                            <span />
                        )}
                        <SkField label="Paid on" error={errors.paid_on}>
                            <input type="date" max={today()} className={inputClass} value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
                        </SkField>
                        <SkField label="How" error={errors.method}>
                            <select className={inputClass} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                                {methods.map((m) => (
                                    <option key={m} value={m}>
                                        {METHOD_LABEL[m] ?? m}
                                    </option>
                                ))}
                            </select>
                        </SkField>
                        <div className="col-span-2">
                            <SkField label="From account" error={errors.payment_account_id}>
                                <select className={inputClass} value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>
                                    <option value="">Not one of ours / not listed</option>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.label}
                                        </option>
                                    ))}
                                </select>
                            </SkField>
                        </div>
                        <div className="col-span-2">
                            <SkField label="Bank reference" error={errors.reference}>
                                <input className={inputClass} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="SWIFT / TT number" />
                            </SkField>
                        </div>
                        <div className="col-span-2">
                            <SkField label="Notes" error={errors.notes}>
                                <input className={inputClass} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
                            </SkField>
                        </div>
                        {foreign && Number(pay.rate) > 0 ? <p className="col-span-2 text-[13px] text-on-surface-variant">= {money(Math.round(Number(pay.amount) * Number(pay.rate) * 100) / 100)} left the bank</p> : null}
                    </div>
                ) : null}
            </SkSheet>
        </SkCard>
    );
}

/** One purchase order: its lines, who signed each step, and the next step. */
export default function PurchaseOrderShow({ order, adminLimit, homeCurrency, accounts = [], methods = [] }: Props) {
    const [sheet, setSheet] = React.useState<Sheet>(null);
    const [reason, setReason] = React.useState("");
    const [orderedAt, setOrderedAt] = React.useState(new Date().toISOString().slice(0, 10));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const step = (name: string, payload: Record<string, string> = {}) => {
        setBusy(true);
        setError(null);
        router.post(route(`procurement.purchase_orders.${name}`, order.id), payload, {
            preserveScroll: true,
            onSuccess: () => {
                setSheet(null);
                setReason("");
            },
            onError: (errors) => setError(Object.values(errors)[0] ?? "Something went wrong."),
            onFinish: () => setBusy(false),
        });
    };

    const open = (s: Sheet) => {
        setError(null);
        setReason("");
        setSheet(s);
    };

    const foreign = order.currency !== "ETB";
    const steps = order.steps.filter((s) => s.at !== null || (s.key !== "cancelled" && s.key !== "closed" && order.status !== "cancelled"));

    return (
        <>
            <Head title={order.reference_number} />

            <SkHeader
                title={order.reference_number}
                subtitle={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        <PurchaseStatusPill status={order.status} size="md" />
                        <span>
                            {order.supplier ?? "—"}
                            {order.supplier_country ? ` · ${order.supplier_country}` : ""}
                        </span>
                    </span>
                }
                actions={
                    <>
                        {order.can.edit ? (
                            <Link href={route("procurement.purchase_orders.edit", order.id)} className="inline-flex items-center gap-1.5 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-[14px] font-bold text-primary hover:bg-surface-container-low">
                                <span className="material-symbols-outlined text-[19px]">edit</span>
                                Edit
                            </Link>
                        ) : null}
                        {order.can.submit ? (
                            <SkButton icon="send" disabled={busy} onClick={() => step("submit")}>
                                Submit for approval
                            </SkButton>
                        ) : null}
                        {order.can.review ? (
                            <>
                                <SkButton variant="outline" icon="undo" disabled={busy} onClick={() => open("send_back")}>
                                    Send back
                                </SkButton>
                                <SkButton variant="success" icon="check" disabled={busy} onClick={() => step("approve")}>
                                    Approve
                                </SkButton>
                            </>
                        ) : null}
                        {order.can.order ? (
                            <SkButton icon="local_mall" disabled={busy} onClick={() => open("ordered")}>
                                Mark ordered
                            </SkButton>
                        ) : null}
                        {order.can.close ? (
                            <SkButton variant="outline" icon="inventory" disabled={busy} onClick={() => step("close")}>
                                Close
                            </SkButton>
                        ) : null}
                        {order.can.cancel ? (
                            <SkButton variant="danger" icon="block" disabled={busy} onClick={() => open("cancel")}>
                                Cancel order
                            </SkButton>
                        ) : null}
                    </>
                }
            />

            {order.status === "draft" && order.review_note ? (
                <p className="mb-4 rounded-[14px] border border-warning/40 bg-warning-container px-4 py-3 text-[14px] text-on-warning-container">
                    <span className="font-bold">Sent back: </span>
                    {order.review_note}
                </p>
            ) : null}
            {order.status === "submitted" && order.review_refusal ? (
                <p className="mb-4 rounded-[14px] border border-outline-variant bg-surface-container px-4 py-3 text-[14px] text-on-surface-variant">
                    <span className="font-bold text-on-surface">Waiting for approval. </span>
                    {order.review_refusal}
                </p>
            ) : null}
            {order.status === "cancelled" && order.cancel_reason ? (
                <p className="mb-4 rounded-[14px] border border-error/40 bg-error-container px-4 py-3 text-[14px] text-on-error-container">
                    <span className="font-bold">Cancelled: </span>
                    {order.cancel_reason}
                </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                    <SkCard>
                        <SkCardHeader icon="list_alt" title="Lines" right={<span className="text-[13px] font-bold text-on-surface-variant">{order.lines.length}</span>} />
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[14px]">
                                <thead className="bg-surface-container-low text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">
                                    <tr>
                                        <th className="px-4 py-2.5">SKU</th>
                                        <th className="px-4 py-2.5 text-right">Qty</th>
                                        <th className="px-4 py-2.5 text-right">Unit price</th>
                                        <th className="px-4 py-2.5 text-right">Total</th>
                                        <th className="hidden px-4 py-2.5 text-right md:table-cell">CBM · kg</th>
                                        <th className="px-4 py-2.5 text-right">Received</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.lines.map((l) => (
                                        <tr key={l.id} className="border-b border-outline-variant/60 last:border-0">
                                            <td className="px-4 py-3">
                                                <span className="block max-w-[260px] truncate font-bold">
                                                    {l.variant?.name ?? "Unknown"}
                                                    {l.variant?.detail ? <span className="font-normal text-on-surface-variant"> · {l.variant.detail}</span> : null}
                                                </span>
                                                <span className="block font-mono text-[12px] text-on-surface-variant">
                                                    {l.variant?.sku}
                                                    {l.supplier_sku ? ` · supplier ${l.supplier_sku}` : ""}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                                                {l.quantity.toLocaleString()} <span className="text-[12px] text-on-surface-variant">{l.variant?.unit}</span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(l.unit_price, order.currency)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums">{money(l.line_total, order.currency)}</td>
                                            <td className="hidden whitespace-nowrap px-4 py-3 text-right text-[13px] text-on-surface-variant tabular-nums md:table-cell">
                                                {l.cbm ?? "—"} · {l.weight_kg ?? "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                                                {l.received_quantity} / {l.quantity}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SkCard>

                    <PaymentsCard order={order} homeCurrency={homeCurrency} accounts={accounts} methods={methods} />

                    {order.notes ? (
                        <SkCard>
                            <SkCardHeader icon="notes" title="Notes" />
                            <p className="whitespace-pre-line p-4 text-[14px]">{order.notes}</p>
                        </SkCard>
                    ) : null}
                </div>

                <div className="space-y-4">
                    <SkCard>
                        <SkCardHeader icon="calculate" title="Total" />
                        <dl className="space-y-1.5 p-4 text-[14px]">
                            <div className="flex justify-between">
                                <dt className="text-on-surface-variant">Lines</dt>
                                <dd className="font-bold tabular-nums">{money(order.subtotal_foreign, order.currency)}</dd>
                            </div>
                            {foreign ? (
                                <>
                                    <div className="flex justify-between text-[13px] text-on-surface-variant">
                                        <dt>Rate</dt>
                                        <dd className="tabular-nums">
                                            1 {order.currency} = {order.exchange_rate} ETB
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-on-surface-variant">In ETB</dt>
                                        <dd className="font-bold tabular-nums">{money(order.total_amount)}</dd>
                                    </div>
                                </>
                            ) : null}
                            <div className="flex justify-between text-[13px] text-on-surface-variant">
                                <dt>Volume · weight</dt>
                                <dd className="tabular-nums">
                                    {order.total_cbm} m³ · {order.total_weight_kg.toLocaleString()} kg
                                </dd>
                            </div>
                            <p className="pt-2 text-[12px] text-on-surface-variant">
                                {order.needs_admin ? `${money(adminLimit)} or more: a global admin approves.` : "Below the admin limit: another procurement user can approve."}
                            </p>
                        </dl>
                    </SkCard>

                    <SkCard>
                        <SkCardHeader icon="handshake" title="Terms" />
                        <dl className="space-y-1.5 p-4 text-[14px]">
                            <div className="flex justify-between gap-3">
                                <dt className="text-on-surface-variant">Payment</dt>
                                <dd className="text-right font-bold">{termsLabel(order.payment_terms, order.payment_days)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-on-surface-variant">Incoterm</dt>
                                <dd className="font-bold">{order.incoterm ?? "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-on-surface-variant">Expected</dt>
                                <dd className="font-bold">{day(order.expected_at)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-on-surface-variant">For hub</dt>
                                <dd className="text-right font-bold">{order.warehouse ?? "Not decided"}</dd>
                            </div>
                        </dl>
                    </SkCard>

                    <SkCard>
                        <SkCardHeader icon="timeline" title="Steps" />
                        <ol className="space-y-3 p-4">
                            {steps.map((s) => (
                                <li key={s.key} className="flex gap-3">
                                    <span className={`material-symbols-outlined mt-0.5 text-[20px] ${s.at ? "text-primary [font-variation-settings:'FILL'_1]" : "text-on-surface-variant/40"}`}>
                                        {s.at ? "check_circle" : "radio_button_unchecked"}
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block text-[14px] font-bold ${s.at ? "" : "text-on-surface-variant"}`}>{s.label}</span>
                                        <span className="block text-[12px] text-on-surface-variant">{s.at ? `${when(s.at)}${s.by ? ` · ${s.by}` : ""}` : "Not yet"}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </SkCard>
                </div>
            </div>

            <SkSheet
                open={sheet === "send_back" || sheet === "cancel"}
                onClose={() => setSheet(null)}
                title={sheet === "cancel" ? "Cancel this order?" : "Send back to draft"}
                subtitle={sheet === "cancel" ? "The order stops for good. Say why." : "The buyer can change it and submit again. Say what to fix."}
                footer={
                    <>
                        <SkButton variant="ghost" onClick={() => setSheet(null)}>
                            Keep it
                        </SkButton>
                        <SkButton variant={sheet === "cancel" ? "danger" : "primary"} disabled={busy || reason.trim().length < 3} onClick={() => step(sheet === "cancel" ? "cancel" : "send_back", { reason })}>
                            {sheet === "cancel" ? "Cancel order" : "Send back"}
                        </SkButton>
                    </>
                }
            >
                <SkField label="Reason" error={error ?? undefined}>
                    <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </SkField>
            </SkSheet>

            <SkSheet
                open={sheet === "ordered"}
                onClose={() => setSheet(null)}
                title="Placed with the supplier"
                subtitle="The approved order went to the supplier. Payment and receiving follow from here."
                footer={
                    <>
                        <SkButton variant="ghost" onClick={() => setSheet(null)}>
                            Not yet
                        </SkButton>
                        <SkButton disabled={busy} onClick={() => step("ordered", { ordered_at: orderedAt })}>
                            Mark ordered
                        </SkButton>
                    </>
                }
            >
                <SkField label="Ordered on" error={error ?? undefined}>
                    <input type="date" className={inputClass} value={orderedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOrderedAt(e.target.value)} />
                </SkField>
            </SkSheet>
        </>
    );
}

PurchaseOrderShow.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
