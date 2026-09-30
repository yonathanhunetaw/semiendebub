import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    BRAND,
    FULFILLMENT_LABELS,
    INK,
    type SellerOrder,
    birr,
    countdownParts,
    findOrder,
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
 * Layout preview over sample data. "Pay now" marks the order paid in local
 * state and drops the seller into pick & pack, which is the next real step in
 * the flow; nothing is persisted.
 */

interface Props {
    reference?: string;
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

export default function ToPay({ reference }: Props): React.ReactElement {
    // Fall back to the first unpaid order so the screen is never empty in
    // preview, whichever reference the URL carries.
    const order: SellerOrder | undefined = useMemo(() => {
        const fromUrl = reference ? findOrder(reference) : undefined;
        return fromUrl;
    }, [reference]);

    const countdown = useCountdown(order?.expiresInMinutes);
    const [copied, setCopied] = useState(false);

    if (!order) {
        return (
            <>
                <Head title="Order not found" />
                <div className="flex min-h-screen flex-col items-center justify-center bg-[#f2f2f2] px-6 text-center">
                    <span className="material-symbols-outlined text-[44px] text-slate-300">receipt_long</span>
                    <p className="mt-3 text-[16px] font-bold" style={{ color: INK }}>
                        Order not found
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500">
                        {reference ? `No sample order matches ${reference}.` : "No reference supplied."}
                    </p>
                    <Link
                        href={`${route("seller.orders.index")}?tab=to_pay`}
                        className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-white active:scale-95"
                        style={{ backgroundColor: BRAND }}
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
            <Head title={`To pay · ${order.reference}`}>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen bg-[#f2f2f2] pb-[190px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={() =>
                                window.history.length > 1
                                    ? window.history.back()
                                    : router.visit(`${route("seller.orders.index")}?tab=to_pay`)
                            }
                            aria-label="Back"
                            className="-ml-1 p-1 text-gray-800"
                        >
                            <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                        </button>
                        <h1 className="text-lg font-bold tracking-tight" style={{ color: INK }}>
                            To pay
                        </h1>
                    </div>
                    <span className="font-mono text-[11px] text-gray-400">{order.reference}</span>
                </header>

                <p className="bg-white px-4 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Sample data · layout preview
                </p>

                {/* ── Countdown ── */}
                {countdown ? (
                    <section className="mb-2.5 bg-white px-4 pb-4 pt-3.5 shadow-sm">
                        <p className="text-[13px] font-normal leading-snug text-gray-700">
                            Without payment, this order will close automatically in
                        </p>
                        <div className="mt-1 flex items-center">
                            <span className="font-mono text-[19px] font-bold tracking-tight text-black">
                                {countdown}
                            </span>
                        </div>
                    </section>
                ) : null}

                {/* ── Delivery address ── */}
                <section className="mb-2.5 bg-white px-4 py-3.5 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-900">
                            <span className="material-symbols-outlined text-[17px] text-gray-700">
                                location_on
                            </span>
                            <h2 className="text-base font-bold">Delivery address</h2>
                            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                Carrier delivery
                            </span>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 rounded-[999px] border border-gray-300 px-3.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                        >
                            Edit address
                        </button>
                    </div>
                    <div className="space-y-1 text-[13px] leading-tight text-gray-800">
                        <span className="font-bold text-gray-950">
                            {order.destination.name} ({order.destination.kind})
                        </span>
                        <p className="font-normal leading-normal text-gray-900">
                            {order.destination.vehicle} | Driver: {order.destination.driver}
                        </p>
                        <p className="text-xs text-gray-500">{order.destination.address}</p>
                    </div>
                </section>

                {/* ── Order details ── */}
                <main className="mb-2.5 bg-white shadow-sm">
                    {groups.map(([key, lines]) => {
                        const meta = FULFILLMENT_LABELS[key];

                        return (
                            <div key={key} className="border-b border-gray-100 pb-3">
                                <div className="flex items-center justify-between border-b border-gray-50 bg-gray-50/50 px-4 pb-2 pt-3.5">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-[13px] font-bold text-gray-950">
                                            {meta.title}
                                        </span>
                                        <span
                                            className={`rounded px-1.5 text-[10px] font-semibold ${
                                                key === "local"
                                                    ? "border border-amber-200 bg-amber-50 text-amber-700"
                                                    : "border border-blue-200 bg-blue-50 text-blue-700"
                                            }`}
                                        >
                                            {meta.badge}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-gray-500">
                                        {lines.length} line{lines.length === 1 ? "" : "s"}
                                    </span>
                                </div>

                                {key === "local" ? (
                                    <div className="flex items-center space-x-2 px-4 py-1.5 text-[11px] text-gray-500">
                                        <span className="font-medium text-emerald-700">Express Ready</span>
                                        <span>•</span>
                                        <span>Direct Dispatch</span>
                                        <span>•</span>
                                        <span>Free shipping</span>
                                    </div>
                                ) : (
                                    <div className="mx-4 my-2 flex items-start space-x-2 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-[11.5px] text-blue-900">
                                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-blue-700">
                                            local_shipping
                                        </span>
                                        <div className="leading-tight">
                                            <p className="font-medium">
                                                To be delivered by the latest scheduled shipment
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-blue-700">
                                                Consolidated at the hub before dispatch
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {lines.map((line) => (
                                    <div key={line.id} className="flex space-x-3 px-4 py-2.5">
                                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50">
                                            <span className="material-symbols-outlined text-[26px] text-gray-400">
                                                inventory_2
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-1 pr-1 text-[13px] font-medium text-gray-900">
                                                {line.name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-gray-500">{line.variant}</p>
                                            <p className="mt-0.5 text-[10px] text-gray-400">{line.supplier}</p>
                                            <div className="mt-2 flex items-baseline justify-between">
                                                <span className="text-base font-bold text-gray-950">
                                                    {birr(line.unitPrice)}
                                                </span>
                                                <span className="text-xs font-medium text-gray-500">
                                                    ×{line.quantity}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-right font-mono text-[11px] text-gray-500">
                                                {birr(lineTotal(line))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}

                    {/* Cost breakdown */}
                    <div className="space-y-2 border-t border-gray-50 px-4 pb-3.5 pt-2 text-[13px]">
                        <div className="flex items-center justify-between text-gray-600">
                            <span>Subtotal</span>
                            <span className="font-normal text-gray-900">{birr(subtotal(order))}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                            <span>Shipping</span>
                            <span className="font-normal text-gray-900">
                                {order.shippingFee > 0 ? birr(order.shippingFee) : "Free shipping"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                            <span>Additional charges</span>
                            <span className="font-normal text-gray-900">
                                {birr(order.additionalCharges)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                            <span className="text-base font-bold text-gray-950">Total</span>
                            <span className="text-lg font-bold text-gray-950">{birr(total)}</span>
                        </div>
                    </div>
                </main>

                {/* ── Order info ── */}
                <section className="mb-3 bg-white px-4 py-3.5 shadow-sm">
                    <h2 className="mb-1.5 text-sm font-bold text-gray-900">Order info</h2>
                    <div className="flex items-center justify-between text-xs text-gray-600">
                        <div className="space-x-1">
                            <span>Ref. number</span>
                            <span className="font-mono font-medium text-gray-900">{refNumber}</span>
                        </div>
                        <button
                            type="button"
                            onClick={copyRef}
                            className="font-medium text-blue-600 hover:text-blue-700"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                        <p>Customer: <span className="text-gray-900">{order.customer}</span></p>
                        <p>Placed: <span className="text-gray-900">{order.placed}</span></p>
                    </div>
                </section>
            </div>

            {/* ── Sticky CTA ── */}
            <nav
                className="fixed inset-x-0 z-50 mx-auto flex max-w-[480px] items-center justify-end space-x-3 rounded-t-[16px] border-t border-gray-200 bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
                style={{ bottom: ABOVE_NAV }}
            >
                <button
                    type="button"
                    onClick={() => router.visit(`${route("seller.orders.index")}?tab=to_pay`)}
                    className="rounded-[999px] border border-gray-300 bg-white px-5 py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <Link
                    href={route("seller.orders.pickpack", { reference: order.reference })}
                    className="rounded-[999px] px-7 py-2.5 text-xs font-bold text-white shadow-sm active:scale-95"
                    style={{ backgroundColor: BRAND }}
                >
                    Confirm payment
                </Link>
            </nav>
        </>
    );
}

ToPay.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
