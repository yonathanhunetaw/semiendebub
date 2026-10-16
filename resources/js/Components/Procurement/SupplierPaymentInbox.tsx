import React from "react";
import { Head, router } from "@inertiajs/react";
import { EmptyState } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import { METHOD_LABEL, PaymentPill, day, money } from "@/Components/Procurement/procurementUi";
import type { SupplierPayment } from "@/types/procurement";

export interface SupplierPaymentInboxProps {
    waiting?: SupplierPayment[];
    recent?: SupplierPayment[];
    /** "admin.supplier_payments" or "finance.supplier_payments". */
    routePrefix: string;
}

/**
 * Supplier payments procurement recorded, waiting for a second person to
 * check the money left the account. Shared by the admin and finance apps.
 */
export default function SupplierPaymentInbox({ waiting = [], recent = [], routePrefix }: SupplierPaymentInboxProps) {
    const [rejecting, setRejecting] = React.useState<SupplierPayment | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const post = (action: "confirm" | "reject", p: SupplierPayment, payload: Record<string, string> = {}) => {
        setBusy(true);
        router.post(route(`${routePrefix}.${action}`, p.id), payload, {
            preserveScroll: true,
            onSuccess: () => {
                setRejecting(null);
                setReason("");
            },
            onFinish: () => setBusy(false),
        });
    };

    const line = (p: SupplierPayment) => (
        <>
            <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-bold">{p.reference_number ?? "—"}</span>
                <span className="text-[14px] font-bold">{p.supplier ?? "—"}</span>
                <PaymentPill status={p.status} />
            </span>
            <span className="block text-[12px] text-on-surface-variant">
                {p.installment} · {METHOD_LABEL[p.method] ?? p.method} · paid {day(p.paid_on)}
                {p.reference ? ` · ref ${p.reference}` : ""}
                {p.account ? ` · from ${p.account}` : ""} · recorded by {p.claimed_by ?? "—"} {when(p.claimed_at)}
            </span>
            {p.notes ? <span className="block text-[12px] text-on-surface-variant">{p.notes}</span> : null}
        </>
    );

    const amount = (p: SupplierPayment) => (
        <span className="text-right tabular-nums">
            <span className="block text-[15px] font-extrabold">{money(p.amount, p.currency)}</span>
            {p.currency !== "ETB" ? (
                <span className="block text-[12px] text-on-surface-variant">
                    {money(p.amount_etb)} @ {p.exchange_rate}
                </span>
            ) : null}
        </span>
    );

    return (
        <>
            <Head title="Supplier payments" />

            <SkHeader
                title="Supplier payments to confirm"
                subtitle="Procurement recorded these as paid. Check each one left the account, then confirm it, or reject it if it did not. Whoever recorded a payment never confirms it."
            />

            <SkCard className="mb-4">
                <SkCardHeader icon="pending_actions" title="Waiting" right={<span className="text-[13px] font-bold text-on-surface-variant">{waiting.length}</span>} />
                {waiting.length === 0 ? (
                    <EmptyState className="px-4 py-6" icon="task_alt" title="Nothing to confirm" description="Payments procurement records show up here." />
                ) : (
                    <ul className="divide-y divide-outline-variant/60">
                        {waiting.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <span className="min-w-0">{line(p)}</span>
                                <span className="flex items-center gap-3">
                                    {amount(p)}
                                    {p.can_confirm ? (
                                        <>
                                            <SkButton variant="outline" icon="close" disabled={busy} onClick={() => setRejecting(p)}>
                                                Reject
                                            </SkButton>
                                            <SkButton variant="success" icon="check" disabled={busy} onClick={() => post("confirm", p)}>
                                                Confirm
                                            </SkButton>
                                        </>
                                    ) : (
                                        <span className="max-w-[160px] text-[12px] text-on-surface-variant">You recorded it: someone else confirms.</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </SkCard>

            {recent.length > 0 ? (
                <SkCard>
                    <SkCardHeader icon="history" title="Recently checked" />
                    <ul className="divide-y divide-outline-variant/60">
                        {recent.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <span className="min-w-0">
                                    {line(p)}
                                    <span className="block text-[12px] text-on-surface-variant">
                                        {p.status === "confirmed" ? `Confirmed by ${p.confirmed_by ?? "—"}` : `Rejected by ${p.rejected_by ?? "—"}: ${p.reject_reason ?? ""}`}
                                    </span>
                                </span>
                                {amount(p)}
                            </li>
                        ))}
                    </ul>
                </SkCard>
            ) : null}

            <SkSheet
                open={rejecting !== null}
                onClose={() => setRejecting(null)}
                title="Reject this payment?"
                subtitle="It will not count as paid. Procurement can record it again correctly."
                footer={
                    <>
                        <SkButton variant="ghost" onClick={() => setRejecting(null)}>
                            Keep it
                        </SkButton>
                        <SkButton variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => rejecting && post("reject", rejecting, { reason })}>
                            Reject
                        </SkButton>
                    </>
                }
            >
                <SkField label="Reason">
                    <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </SkField>
            </SkSheet>
        </>
    );
}
