import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    FULFILLMENT_LABELS,
    type SellerOrder,
    birr,
    countdownParts,
    groupByFulfillment,
    lineTotal,
    orderTotal,
    subtotal,
} from "@/Data/sellerOrderFlow";
import { Head, Link, router } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

/**
 * A single unpaid order.
 *
 * The order is the real sale, served by OrderBoardController. Its stock is
 * held while it waits; the countdown is when that hold lapses. Confirming the
 * payment records it and moves the order into Pick & Pack; cancelling gives
 * the stock back.
 */

/** How a payment can be taken at the counter. */
const PAY_METHODS = [
    { id: "cash", label: "Cash" },
    { id: "telebirr", label: "Telebirr" },
    { id: "cbe_birr", label: "CBE Birr" },
    { id: "bank_transfer", label: "Bank transfer" },
] as const;

interface Props {
    reference?: string;
    order?: SellerOrder | null;
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

export default function ToPay({ reference, order: served = null }: Props): React.ReactElement {
    const order: SellerOrder | undefined = useMemo(() => served ?? undefined, [served]);
    const [method, setMethod] = useState<string>("cash");
    const [txRef, setTxRef] = useState("");
    const [busy, setBusy] = useState(false);

    const confirmPayment = (): void => {
        if (!order) return;
        setBusy(true);
        router.post(
            route("seller.orders.payment", { reference: order.reference }),
            { payment_method: method, transaction_reference: txRef || null },
            { onFinish: () => setBusy(false) },
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

                <p className="bg-surface-container-lowest px-4 pt-2 text-[10px] font-medium uppercase tracking-wide text-outline">
                    Sample data · layout preview
                </p>

                {/* ── Countdown ── */}
                {countdown ? (
                    <section className="mb-2.5 bg-surface-container-lowest px-4 pb-4 pt-3.5 shadow-sm">
                        <p className="text-[13px] font-normal leading-snug text-on-surface-variant">
                            Without payment, this order will close automatically in
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
                    <h2 className="mb-2 text-sm font-bold text-on-surface">Payment received by</h2>
                    <div className="grid grid-cols-2 gap-1.5">
                        {PAY_METHODS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setMethod(option.id)}
                                className={`rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                                    method === option.id
                                        ? "border-primary bg-primary-container/60 text-primary"
                                        : "border-outline-variant text-on-surface-variant"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {method !== "cash" ? (
                        <input
                            value={txRef}
                            onChange={(event) => setTxRef(event.target.value)}
                            placeholder="Transaction reference"
                            className="mt-2 w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-3 py-2 font-mono text-xs"
                        />
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
                <button
                    type="button"
                    onClick={confirmPayment}
                    disabled={busy}
                    className="rounded-[999px] bg-primary px-7 py-2.5 text-xs font-bold text-on-primary shadow-sm active:scale-95 disabled:opacity-40"
                >
                    Confirm payment
                </button>
            </nav>
        </>
    );
}

ToPay.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
