import PaymentSplitEditor, { creditWithinLimit, legsBalanced, legsToParts } from "@/Components/Seller/PaymentSplitEditor";
import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    FULFILLMENT_LABELS,
    type PaymentLeg,
    type SellerOrder,
    birr,
    countdownParts,
    groupByFulfillment,
    lineTotal,
    orderTotal,
    subtotal,
} from "@/Data/sellerOrderFlow";
import type { CreditSummary, OrderPayment, PaymentAccountOption } from "@/types/payments";
import { Head, Link, router } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

/**
 * A single unpaid order.
 *
 * The order is the real sale, served by OrderBoardController, with its
 * payment split. For each part the seller taps "Customer says paid"; the
 * account's owner then checks their account and confirms it (or answers "not
 * received yet"). Once every part is confirmed the order moves to Pick &
 * Pack. Until a part is claimed the stock is held for 48 hours; the countdown
 * is when that hold lapses. Cancelling gives the stock back.
 */

interface Props {
    reference?: string;
    order?: SellerOrder | null;
    /** The store's active collection accounts, for (re-)splitting. */
    accounts?: PaymentAccountOption[];
    /** The customer's credit, when an admin gave them some. */
    credit?: CreditSummary | null;
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
    pending: { label: "Waiting for customer", className: "border-outline/40 bg-surface-container text-on-surface-variant" },
    claimed: { label: "Owner checking", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    confirmed: { label: "Received", className: "border-success/30 bg-success-container/60 text-on-success-container" },
};

function partTitle(part: OrderPayment): string {
    if (part.method === "credit") return "On credit";

    return part.account ? `${part.account.provider_name} · ${part.account.account_number}` : "Cash";
}

/** Ticking countdown from a minute budget. */
function useCountdown(minutes: number | undefined): string | null {
    const [seconds, setSeconds] = useState(() => (minutes ?? 0) * 60);

    useEffect(() => {
        setSeconds((minutes ?? 0) * 60);
    }, [minutes]);

    useEffect(() => {
        if (!minutes) return undefined;

        const timer = window.setInterval(() => {
            setSeconds((current) => (current <= 0 ? 0 : current - 1));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [minutes]);

    return minutes ? countdownParts(seconds) : null;
}

export default function ToPay({ reference, order: served = null, accounts = [], credit = null }: Props): React.ReactElement {
    const order: SellerOrder | undefined = useMemo(() => served ?? undefined, [served]);
    const [busy, setBusy] = useState(false);
    const parts = order?.payments ?? [];
    const [editing, setEditing] = useState(parts.length === 0);
    const [legs, setLegs] = useState<PaymentLeg[]>([]);

    // Claimed and confirmed parts stay; a new split covers what they leave.
    const locked = parts.filter((part) => part.status === "claimed" || part.status === "confirmed");
    const lockedTotal = locked.reduce((sum, part) => sum + part.amount, 0);

    const saveSplit = (): void => {
        if (!order) return;
        setBusy(true);
        router.put(
            route("seller.orders.payments.update", { reference: order.reference }),
            { parts: legsToParts(legs) },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setEditing(false);
                    setLegs([]);
                },
                onFinish: () => setBusy(false),
            },
        );
    };

    const claim = (part: OrderPayment): void => {
        if (!order) return;
        setBusy(true);
        router.post(
            route("seller.orders.payments.claim", { reference: order.reference, payment: part.id }),
            {},
            { preserveScroll: true, onFinish: () => setBusy(false) },
        );
    };

    const cancelOrder = (): void => {
        if (!order || !window.confirm(`Cancel ${order.reference}? Its stock goes back on sale.`)) return;
        setBusy(true);
        router.post(route("seller.orders.cancel", { reference: order.reference }), {}, { onFinish: () => setBusy(false) });
    };

    const countdown = useCountdown(order?.expiresInMinutes);
    const [copied, setCopied] = useState(false);

    if (!order) {
        return (
            <>
                <Head title="Order not found" />
                <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
                    <span className="material-symbols-outlined text-[44px] text-outline">receipt_long</span>
                    <p className="mt-3 text-[16px] font-bold text-on-surface">
                        Order not found
                    </p>
                    <p className="mt-1 text-[12px] text-on-surface-variant">
                        {reference ? `No order matches ${reference}.` : "No reference supplied."}
                    </p>
                    <Link
                        href={`${route("seller.orders.index")}?tab=to_pay`}
                        className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-on-primary active:scale-95 bg-primary"
                    >
                        Back to orders
                    </Link>
                </div>
            </>
        );
    }

    const groups = groupByFulfillment(order.lines);
    const total = orderTotal(order);
    const splitTotal = Math.round((total - lockedTotal) * 100) / 100;
    const refNumber = `${order.reference.replace("-", "")}${order.id}0083`;

    const copyRef = async () => {
        try {
            await navigator.clipboard.writeText(refNumber);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    return (
        <>
            <Head title={`To pay · ${order.reference}`} />

            <div className="min-h-screen bg-background pb-[190px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-40 flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={() =>
                                window.history.length > 1
                                    ? window.history.back()
                                    : router.visit(`${route("seller.orders.index")}?tab=to_pay`)
                            }
                            aria-label="Back"
                            className="-ml-1 p-1 text-on-surface"
                        >
                            <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                        </button>
                        <h1 className="text-lg font-bold tracking-tight text-on-surface">
                            To pay
                        </h1>
                    </div>
                    <span className="font-mono text-[11px] text-outline">{order.reference}</span>
                </header>

                {/* ── Countdown ── */}
                {countdown ? (
                    <section className="mb-2.5 bg-surface-container-lowest px-4 pb-4 pt-3.5 shadow-sm">
                        <p className="text-[13px] font-normal leading-snug text-on-surface-variant">
                            Until the customer says they paid, this order&apos;s stock is held for
                        </p>
                        <div className="mt-1 flex items-center">
                            <span className="font-mono text-[19px] font-bold tracking-tight text-on-surface">
                                {countdown}
                            </span>
                        </div>
                    </section>
                ) : null}

                {/* ── Delivery address ── */}
                <section className="mb-2.5 bg-surface-container-lowest px-4 py-3.5 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-on-surface">
                            <span className="material-symbols-outlined text-[17px] text-on-surface-variant">
                                location_on
                            </span>
                            <h2 className="text-base font-bold">Delivery address</h2>
                            <span className="rounded border border-info/30 bg-info-container/60 px-1.5 py-0.5 text-[10px] font-semibold text-on-info-container">
                                Carrier delivery
                            </span>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 rounded-[999px] border border-outline/50 px-3.5 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-low"
                        >
                            Edit address
                        </button>
                    </div>
                    <div className="space-y-1 text-[13px] leading-tight text-on-surface">
                        <span className="font-bold text-on-surface">
                            {order.destination.name} ({order.destination.kind})
                        </span>
                        <p className="font-normal leading-normal text-on-surface">
                            {order.destination.vehicle} | Driver: {order.destination.driver}
                        </p>
                        <p className="text-xs text-on-surface-variant">{order.destination.address}</p>
                    </div>
                </section>

                {/* ── Order details ── */}
                <main className="mb-2.5 bg-surface-container-lowest shadow-sm">
                    {groups.map(([key, lines]) => {
                        const meta = FULFILLMENT_LABELS[key];

                        return (
                            <div key={key} className="border-b border-outline-variant/60 pb-3">
                                <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-low/50 px-4 pb-2 pt-3.5">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-[13px] font-bold text-on-surface">
                                            {meta.title}
                                        </span>
                                        <span
                                            className={`rounded px-1.5 text-[10px] font-semibold ${
                                                key === "local"
                                                    ? "border border-warning/30 bg-warning-container/60 text-on-warning-container"
                                                    : "border border-info/30 bg-info-container/60 text-on-info-container"
                                            }`}
                                        >
                                            {meta.badge}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-on-surface-variant">
                                        {lines.length} line{lines.length === 1 ? "" : "s"}
                                    </span>
                                </div>

                                {key === "local" ? (
                                    <div className="flex items-center space-x-2 px-4 py-1.5 text-[11px] text-on-surface-variant">
                                        <span className="font-medium text-success">Express Ready</span>
                                        <span>•</span>
                                        <span>Direct Dispatch</span>
                                        <span>•</span>
                                        <span>Free shipping</span>
                                    </div>
                                ) : (
                                    <div className="mx-4 my-2 flex items-start space-x-2 rounded border border-info/20 bg-info-container/60 px-3 py-2 text-[11.5px] text-on-info-container">
                                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-info">
                                            local_shipping
                                        </span>
                                        <div className="leading-tight">
                                            <p className="font-medium">
                                                To be delivered by the latest scheduled shipment
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-info">
                                                Consolidated at the hub before dispatch
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {lines.map((line) => (
                                    <div key={line.id} className="flex space-x-3 px-4 py-2.5">
                                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-outline-variant/60 bg-surface-container-low">
                                            <span className="material-symbols-outlined text-[26px] text-outline">
                                                inventory_2
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-1 pr-1 text-[13px] font-medium text-on-surface">
                                                {line.name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-on-surface-variant">{line.variant}</p>
                                            <p className="mt-0.5 text-[10px] text-outline">{line.supplier}</p>
                                            <div className="mt-2 flex items-baseline justify-between">
                                                <span className="text-base font-bold text-on-surface">
                                                    {birr(line.unitPrice)}
                                                </span>
                                                <span className="text-xs font-medium text-on-surface-variant">
                                                    ×{line.quantity}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-right font-mono text-[11px] text-on-surface-variant">
                                                {birr(lineTotal(line))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}

                    {/* Cost breakdown */}
                    <div className="space-y-2 border-t border-outline-variant/60 px-4 pb-3.5 pt-2 text-[13px]">
                        <div className="flex items-center justify-between text-on-surface-variant">
                            <span>Subtotal</span>
                            <span className="font-normal text-on-surface">{birr(subtotal(order))}</span>
                        </div>
                        <div className="flex items-center justify-between text-on-surface-variant">
                            <span>Shipping</span>
                            <span className="font-normal text-on-surface">
                                {order.shippingFee > 0 ? birr(order.shippingFee) : "Free shipping"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-on-surface-variant">
                            <span>Additional charges</span>
                            <span className="font-normal text-on-surface">
                                {birr(order.additionalCharges)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-outline-variant/60 pt-2">
                            <span className="text-base font-bold text-on-surface">Total</span>
                            <span className="text-lg font-bold text-on-surface">{birr(total)}</span>
                        </div>
                    </div>
                </main>

                {/* ── Payment ── */}
                <section className="mb-3 bg-surface-container-lowest px-4 py-3.5 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-on-surface">Payment</h2>
                        {!editing && parts.some((part) => part.status === "pending") ? (
                            <button
                                type="button"
                                onClick={() => setEditing(true)}
                                className="rounded-[999px] border border-outline/50 px-3 py-1 text-[11px] font-semibold text-on-surface hover:bg-surface-container-low"
                            >
                                Change split
                            </button>
                        ) : null}
                    </div>

                    {parts.length > 0 ? (
                        <div className="space-y-2">
                            {parts.map((part) => {
                                const chip =
                                    part.method === "credit"
                                        ? { label: "On credit", className: STATUS_CHIP.claimed.className }
                                        : (STATUS_CHIP[part.status] ?? STATUS_CHIP.pending);

                                return (
                                    <div
                                        key={part.id}
                                        className="rounded-[10px] border border-outline-variant p-2.5"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-on-surface">{partTitle(part)}</p>
                                                {part.account ? (
                                                    <p className="truncate text-[10px] text-on-surface-variant">
                                                        {part.account.account_name}
                                                        {part.account.owner ? ` · confirmed by ${part.account.owner}` : ""}
                                                    </p>
                                                ) : null}
                                                {part.reference ? (
                                                    <p className="font-mono text-[10px] text-outline">Ref. {part.reference}</p>
                                                ) : null}
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-sm font-bold text-on-surface">{birr(part.amount)}</p>
                                                <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${chip.className}`}>
                                                    {chip.label}
                                                </span>
                                            </div>
                                        </div>

                                        {part.not_received_at ? (
                                            <p className="mt-2 flex items-start gap-1.5 rounded-[8px] border border-warning/30 bg-warning-container/60 px-2 py-1.5 text-[11px] text-on-warning-container">
                                                <span className="material-symbols-outlined text-[14px]">warning</span>
                                                Not received yet: {part.account?.owner ?? "the owner"} found no deposit. Check with
                                                the customer, then mark it again.
                                            </p>
                                        ) : null}

                                        {part.status === "pending" && part.account ? (
                                            <button
                                                type="button"
                                                onClick={() => claim(part)}
                                                disabled={busy}
                                                className="mt-2 w-full rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary active:scale-[0.98] disabled:opacity-40"
                                            >
                                                Customer says paid
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[11px] text-on-surface-variant">
                            No payment split yet. Choose how the customer pays below.
                        </p>
                    )}

                    {editing ? (
                        <div className="mt-3 space-y-3 border-t border-outline-variant/60 pt-3">
                            <p className="text-[11px] text-on-surface-variant">
                                {locked.length > 0
                                    ? `Split the ${birr(splitTotal)} not yet claimed. This replaces the parts still waiting for the customer.`
                                    : `Split the ${birr(splitTotal)} total.`}
                            </p>
                            <PaymentSplitEditor
                                accounts={accounts}
                                total={splitTotal}
                                legs={legs}
                                onChange={setLegs}
                                order={{ reference: order.reference, customer: order.customer }}
                                credit={credit}
                            />
                            <div className="flex justify-end gap-2">
                                {parts.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditing(false);
                                            setLegs([]);
                                        }}
                                        className="rounded-[999px] border border-outline/50 px-4 py-2 text-xs font-semibold text-on-surface"
                                    >
                                        Keep current split
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={saveSplit}
                                    disabled={busy || !legsBalanced(legs, splitTotal) || !creditWithinLimit(legs, credit)}
                                    className="rounded-[999px] bg-primary px-5 py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                                >
                                    Save split
                                </button>
                            </div>
                        </div>
                    ) : null}
                </section>

                {/* ── Order info ── */}
                <section className="mb-3 bg-surface-container-lowest px-4 py-3.5 shadow-sm">
                    <h2 className="mb-1.5 text-sm font-bold text-on-surface">Order info</h2>
                    <div className="flex items-center justify-between text-xs text-on-surface-variant">
                        <div className="space-x-1">
                            <span>Ref. number</span>
                            <span className="font-mono font-medium text-on-surface">{refNumber}</span>
                        </div>
                        <button
                            type="button"
                            onClick={copyRef}
                            className="font-medium text-info hover:text-info"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-on-surface-variant">
                        <p>Customer: <span className="text-on-surface">{order.customer}</span></p>
                        <p>Placed: <span className="text-on-surface">{order.placed}</span></p>
                    </div>
                </section>
            </div>

            {/* ── Sticky CTA ── */}
            <nav
                className="fixed inset-x-0 z-50 mx-auto flex max-w-[480px] items-center justify-end space-x-3 rounded-t-[16px] border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] dark:shadow-none"
                style={{ bottom: ABOVE_NAV }}
            >
                <button
                    type="button"
                    onClick={cancelOrder}
                    disabled={busy}
                    className="rounded-[999px] border border-outline/50 bg-surface-container-lowest px-5 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                >
                    Cancel order
                </button>
                <Link
                    href={`${route("seller.orders.index")}?tab=to_pay`}
                    className="rounded-[999px] bg-primary px-7 py-2.5 text-xs font-bold text-on-primary shadow-sm active:scale-95"
                >
                    Done
                </Link>
            </nav>
        </>
    );
}

ToPay.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
