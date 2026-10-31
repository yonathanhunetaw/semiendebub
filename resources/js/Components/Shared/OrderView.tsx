import React from "react";
import { router } from "@inertiajs/react";
import { StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, inputClass, when } from "@/Components/StockKeeper/skKit";
import type { SharedOrder } from "@/types/sharedCart";

export const birr = (n: number) => `ETB ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const STEPS: Array<{ key: SharedOrder["stage"][]; label: string }> = [
    { key: ["to_pay"], label: "Pay" },
    { key: ["paid", "packing"], label: "Packing" },
    { key: ["to_deliver"], label: "On the way" },
    { key: ["delivered"], label: "Done" },
];

/** "I've sent it" with the reference from the receipt. */
function ClaimForm({ url }: { url: string }) {
    const [reference, setReference] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    return (
        <div className="mt-3">
            <div className="flex gap-2">
                <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference on your receipt" aria-label="Transfer reference" />
                <SkButton
                    disabled={busy || reference.trim().length < 3}
                    onClick={() => {
                        setBusy(true);
                        router.post(url, { reference }, { preserveScroll: true, onError: (e) => setError(Object.values(e)[0] ?? null), onFinish: () => setBusy(false) });
                    }}
                >
                    I've sent it
                </SkButton>
            </div>
            {error ? <p className="mt-1 text-[12px] text-error">{error}</p> : null}
        </div>
    );
}

interface Props {
    order: SharedOrder;
    /** Where "I've sent it" posts for one payment part. */
    claimUrl: (paymentId: number) => string;
    /** Under the progress bar: a hold notice, a cancel button. */
    children?: React.ReactNode;
}

/**
 * An order as its customer follows it: pay each part, then watch it move.
 * Used by a shared-cart link (Shared/Cart/Order) and by My orders in the
 * online shop (User/Orders/Show); only where "I've sent it" posts differs.
 */
export default function OrderView({ order, claimUrl, children }: Props) {
    const current = order.stage === "canceled" ? -1 : STEPS.findIndex((s) => s.key.includes(order.stage));
    const toPay = order.payments.filter((p) => p.can_claim);

    return (
        <>
            <h1 className="text-[22px] font-extrabold tracking-tight">Order {order.reference}</h1>
            <p className="mb-4 text-[13px] text-on-surface-variant">
                Placed {when(order.placed_at)} · {birr(order.total)}
            </p>

            {order.stage === "canceled" ? (
                <p className="mb-4 rounded-[14px] border border-error/40 bg-error-container px-4 py-3 text-[14px] text-on-error-container">This order was cancelled. Contact the store if that is a surprise.</p>
            ) : (
                <ol className="mb-4 grid grid-cols-4 gap-1" aria-label="Progress">
                    {STEPS.map((s, i) => (
                        <li key={s.label} className="text-center">
                            <span className={`mx-auto mb-1 block h-1.5 rounded-[999px] ${i <= current ? "bg-primary" : "bg-outline-variant"}`} />
                            <span className={`text-[12px] font-bold ${i === current ? "text-primary" : "text-on-surface-variant"}`}>{s.label}</span>
                        </li>
                    ))}
                </ol>
            )}

            {children}

            {order.payments.length > 0 ? (
                <SkCard className="mb-4">
                    <SkCardHeader icon="account_balance" title={toPay.length > 0 ? "Send your payment" : "Payment"} />
                    <ul className="divide-y divide-outline-variant/60">
                        {order.payments.map((p) => (
                            <li key={p.id} className="px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[16px] font-extrabold tabular-nums">{birr(p.amount)}</span>
                                    {p.status === "pending" ? (
                                        <StatusPill label="Waiting for you" tone="warning" size="sm" />
                                    ) : p.status === "claimed" ? (
                                        <StatusPill label="The store is checking" tone="info" size="sm" />
                                    ) : p.status === "confirmed" ? (
                                        <StatusPill label="Received" tone="success" size="sm" />
                                    ) : (
                                        <StatusPill status={p.status} size="sm" />
                                    )}
                                </div>
                                {p.account ? (
                                    <p className="mt-1 text-[14px]">
                                        To <span className="font-bold">{p.account.provider}</span> · {p.account.account_name} ·{" "}
                                        <span className="font-mono font-bold">{p.account.account_number}</span>
                                    </p>
                                ) : null}
                                {p.reference ? <p className="text-[12px] text-on-surface-variant">Your reference: {p.reference}</p> : null}
                                {p.can_claim ? <ClaimForm url={claimUrl(p.id)} /> : null}
                            </li>
                        ))}
                    </ul>
                </SkCard>
            ) : null}

            <SkCard className="mb-4">
                <SkCardHeader icon="receipt_long" title="Items" />
                <ul className="divide-y divide-outline-variant/60">
                    {order.lines.map((l, i) => (
                        <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]">
                            <span className="min-w-0 truncate">
                                {l.quantity} × {l.title}
                                {l.unit ? <span className="text-on-surface-variant"> ({l.unit})</span> : null}
                            </span>
                            <span className="font-bold tabular-nums">{birr(l.line_total)}</span>
                        </li>
                    ))}
                </ul>
                {order.delivery ? (
                    <p className="border-t border-outline-variant/70 px-4 py-2.5 text-[13px] text-on-surface-variant">
                        {order.delivery.method === "store" ? `Pick it up at ${order.store ?? "the store"}.` : `Delivery to ${order.delivery.address ?? "your address"}.`}
                    </p>
                ) : null}
            </SkCard>

            {order.events.length > 0 ? (
                <SkCard>
                    <SkCardHeader icon="timeline" title="What happened" />
                    <ol className="space-y-3 p-4">
                        {order.events.map((e, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="material-symbols-outlined mt-0.5 text-[20px] text-primary">{e.icon}</span>
                                <span>
                                    <span className="block text-[14px] font-bold">{e.title}</span>
                                    <span className="block text-[12px] text-on-surface-variant">{when(e.at)}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </SkCard>
            ) : null}
        </>
    );
}
