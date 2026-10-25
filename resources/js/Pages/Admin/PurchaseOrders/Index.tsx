import React from "react";
import { Head, router } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money, termsLabel } from "@/Components/Procurement/procurementUi";
import type { PurchaseDetail } from "@/types/procurement";

interface Props {
    orders?: PurchaseDetail[];
    adminLimit: number;
    canSetLimit?: boolean;
}

/**
 * Purchase orders waiting for approval. Procurement raises and submits them
 * in its own app; from the limit only a global admin approves, here.
 */
export default function AdminPurchaseOrders({ orders = [], adminLimit, canSetLimit = false }: Props) {
    const [limit, setLimit] = React.useState(String(adminLimit));
    const [sendingBack, setSendingBack] = React.useState<PurchaseDetail | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const post = (name: "approve" | "send_back", order: PurchaseDetail, payload: Record<string, string> = {}) => {
        setBusy(true);
        router.post(route(`admin.purchase_orders.${name}`, order.id), payload, {
            preserveScroll: true,
            onSuccess: () => {
                setSendingBack(null);
                setReason("");
            },
            onFinish: () => setBusy(false),
        });
    };

    return (
        <>
            <Head title="Purchase orders" />

            <SkHeader
                title="Purchase orders to approve"
                subtitle={`Raised and submitted by procurement. From ${money(adminLimit)} only a global admin approves; below it another procurement user can too. Whoever raised or submitted an order never approves it.`}
            />

            {canSetLimit ? (
                <SkCard className="mb-4">
                    <div className="flex flex-wrap items-end gap-3 p-4">
                        <SkField label="Global admin approves from (ETB)">
                            <input
                                className={inputClass}
                                type="number"
                                min={1}
                                step="any"
                                inputMode="decimal"
                                value={limit}
                                onChange={(e) => setLimit(e.target.value)}
                            />
                        </SkField>
                        <SkButton
                            disabled={busy || !(Number(limit) > 0) || Number(limit) === adminLimit}
                            onClick={() => {
                                setBusy(true);
                                router.put(route("admin.purchase_orders.limit"), { limit }, { preserveScroll: true, onFinish: () => setBusy(false) });
                            }}
                        >
                            Save limit
                        </SkButton>
                    </div>
                </SkCard>
            ) : null}

            {orders.length === 0 ? (
                <EmptyState framed icon="task_alt" title="Nothing waiting" description="Submitted purchase orders show up here." />
            ) : (
                <div className="space-y-4">
                    {orders.map((o) => (
                        <SkCard key={o.id}>
                            <SkCardHeader
                                icon="receipt_long"
                                title={
                                    <span>
                                        <span className="font-mono">{o.reference_number}</span>
                                        <span className="font-normal text-on-surface-variant"> · {o.supplier}</span>
                                    </span>
                                }
                                right={o.needs_admin ? <span className="text-[12px] font-bold text-warning">Needs a global admin</span> : null}
                            />
                            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
                                <div className="md:col-span-2">
                                    <ul className="divide-y divide-outline-variant/60 text-[14px]">
                                        {o.lines.map((l) => (
                                            <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                                                <span className="min-w-0">
                                                    <span className="block truncate font-bold">{l.variant?.name}</span>
                                                    <span className="block font-mono text-[12px] text-on-surface-variant">{l.variant?.sku}</span>
                                                </span>
                                                <span className="shrink-0 text-right tabular-nums">
                                                    {l.quantity.toLocaleString()} {l.variant?.unit} × {money(l.unit_price, o.currency)}
                                                    <span className="block font-bold">{money(l.line_total, o.currency)}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    {o.notes ? <p className="mt-2 whitespace-pre-line text-[13px] text-on-surface-variant">{o.notes}</p> : null}
                                </div>
                                <div className="space-y-1.5 text-[14px]">
                                    <p className="flex justify-between">
                                        <span className="text-on-surface-variant">Total</span>
                                        <span className="font-bold tabular-nums">{money(o.subtotal_foreign, o.currency)}</span>
                                    </p>
                                    {o.currency !== "ETB" ? (
                                        <p className="flex justify-between">
                                            <span className="text-on-surface-variant">In ETB @ {o.exchange_rate}</span>
                                            <span className="font-bold tabular-nums">{money(o.total_amount)}</span>
                                        </p>
                                    ) : null}
                                    <p className="flex justify-between">
                                        <span className="text-on-surface-variant">Payment</span>
                                        <span className="font-bold">{termsLabel(o.payment_terms, o.payment_days)}</span>
                                    </p>
                                    <p className="text-[12px] text-on-surface-variant">
                                        Raised by {o.raised_by ?? "—"}, submitted {when(o.steps.find((s) => s.key === "submitted")?.at)}
                                    </p>
                                    {o.review_refusal ? <p className="text-[12px] text-on-surface-variant">{o.review_refusal}</p> : null}
                                    {o.can.review ? (
                                        <div className="flex gap-2 pt-2">
                                            <SkButton variant="outline" icon="undo" disabled={busy} onClick={() => setSendingBack(o)}>
                                                Send back
                                            </SkButton>
                                            <SkButton variant="success" icon="check" disabled={busy} onClick={() => post("approve", o)}>
                                                Approve
                                            </SkButton>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </SkCard>
                    ))}
                </div>
            )}

            <SkSheet
                open={sendingBack !== null}
                onClose={() => setSendingBack(null)}
                title={`Send ${sendingBack?.reference_number ?? ""} back`}
                subtitle="Procurement can change it and submit again. Say what to fix."
                footer={
                    <>
                        <SkButton variant="ghost" onClick={() => setSendingBack(null)}>
                            Keep it
                        </SkButton>
                        <SkButton disabled={busy || reason.trim().length < 3} onClick={() => sendingBack && post("send_back", sendingBack, { reason })}>
                            Send back
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

AdminPurchaseOrders.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
