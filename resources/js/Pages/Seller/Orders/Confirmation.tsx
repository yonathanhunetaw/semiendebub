import PaymentSplitEditor, { creditWithinLimit, legsBalanced, legsToParts } from "@/Components/Seller/PaymentSplitEditor";
import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    FULFILLMENT_LABELS,
    type PaymentLeg,
    type SellerOrder,
    birr,
    groupByFulfillment,
    lineTotal,
    orderTotal,
    savings,
    subtotal,
} from "@/Data/sellerOrderFlow";
import type { CreditSummary, PaymentAccountOption } from "@/types/payments";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Order confirmation: the cart priced the way checkout will price it, where
 * it ships from, and how the customer pays.
 *
 * Pay now splits the total across the store's payment accounts (set up by
 * the admin), cash and, when an admin gave the customer credit, their
 * credit. Account parts wait in To pay until each account's owner confirms
 * the money arrived; an order paid fully in cash or credit goes straight to
 * Pick & pack. Pay later places the order in To pay with no split yet.
 */

type PayTab = "now" | "later";

interface Props {
    /** The cart being turned into an order; null when none was chosen. */
    cart_id?: number | null;
    /** The cart, priced and checked against the store's stock (OrderBoardController::preview). */
    order?: SellerOrder | null;
    /** The store's active collection accounts. */
    accounts?: PaymentAccountOption[];
    /** The customer's credit; null for a walk-in or a customer without any. */
    credit?: CreditSummary | null;
}

export default function Confirmation({ cart_id = null, order = null, accounts = [], credit = null }: Props): React.ReactElement {
    if (!order || cart_id === null) {
        return (
            <>
                <Head title="Order confirmation" />
                <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
                    <span className="material-symbols-outlined text-[44px] text-outline">shopping_cart</span>
                    <p className="mt-3 text-[16px] font-bold text-on-surface">Pick a cart to check out</p>
                    <p className="mt-1 text-[12px] text-on-surface-variant">Open one of your carts and tap Checkout.</p>
                    <Link
                        href={route("seller.carts.index")}
                        className="mt-4 rounded-[999px] bg-primary px-5 py-2 text-[13px] font-bold text-on-primary"
                    >
                        My carts
                    </Link>
                </div>
            </>
        );
    }

    return <ConfirmationForm cartId={cart_id} order={order} accounts={accounts} credit={credit} />;
}

function ConfirmationForm({
    cartId,
    order,
    accounts,
    credit,
}: {
    cartId: number;
    order: SellerOrder;
    accounts: PaymentAccountOption[];
    credit: CreditSummary | null;
}): React.ReactElement {

    const [tab, setTab] = useState<PayTab>("now");
    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [placed, setPlaced] = useState(false);
    const [delivery, setDelivery] = useState<"standard" | "express" | "later">("standard");

    const [address, setAddress] = useState(order.destination.address ?? "");
    const [recipient, setRecipient] = useState(order.destination.name ?? "");
    const [phone, setPhone] = useState("");

    const groups = useMemo(() => groupByFulfillment(order.lines), [order]);
    const total = orderTotal(order);
    // The delivery fee is quoted when the run is dispatched, not charged here:
    // adding it to this total would show an amount nobody collects.
    const deliveryFee = 0;
    const grandTotal = total + deliveryFee;
    // Lines the store cannot cover today come from a hub: the buyer must accept the wait.
    const needsDelay = order.lines.some((line) => !line.inStore);

    const balanced = legsBalanced(legs, grandTotal);
    const creditOk = creditWithinLimit(legs, credit);
    const canPlace = tab === "later" || (balanced && creditOk);
    // Cash and credit are settled on the spot; only account parts wait.
    const settledNow = legs.length > 0 && legs.every((leg) => leg.credit || leg.accountId === null);

    const place = () => {
        setPlaced(true);

        router.post(
            route("seller.orders.store"),
            {
                cart_id: cartId,
                parts: tab === "now" ? legsToParts(legs) : [],
                delivery_address: address || null,
                recipient_name: recipient || null,
                recipient_phone: phone || null,
                delay_agreed: needsDelay,
            },
            { onFinish: () => setPlaced(false) },
        );
    };

    const cta = tab === "later" ? "Place order (To pay)" : settledNow ? "Place order" : "Place order & request payment";

    return (
        <>
            <Head title="Order confirmation" />

            <div className="min-h-screen bg-background pb-[200px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest px-4 shadow-sm">
                    <button
                        type="button"
                        onClick={() =>
                            window.history.length > 1
                                ? window.history.back()
                                : router.visit(route("seller.carts.index"))
                        }
                        aria-label="Back"
                        className="-ml-1 p-1 text-on-surface"
                    >
                        <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                    </button>
                    <h1 className="text-base font-bold tracking-tight text-on-surface">
                        Order confirmation
                    </h1>
                    <span className="w-6" />
                </header>

                {needsDelay ? (
                    <p className="mx-4 mt-3 rounded-[10px] border border-warning/30 bg-warning-container/60 px-3 py-2 text-[11px] text-on-warning-container">
                        Some lines are not on hand at this store. Placing the order tells the buyer they will
                        arrive later, from a hub.
                    </p>
                ) : null}

                <main className="mx-auto max-w-md space-y-2.5 px-0 pt-2 sm:px-2">
                    {/* ── Items, banded by fulfillment ── */}
                    <section className="bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        {groups.map(([key, lines], index) => {
                            const meta = FULFILLMENT_LABELS[key];

                            return (
                                <div
                                    key={key}
                                    className={index === 0 ? "border-b border-outline-variant/60 pb-4" : "pt-4"}
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 pb-2">
                                        <span
                                            className={`flex h-4 items-center rounded px-2 text-[10px] font-bold leading-none ${meta.badgeClass}`}
                                        >
                                            {meta.badge}
                                        </span>
                                        <span className="text-sm font-bold tracking-tight text-on-surface">
                                            {meta.title}
                                        </span>
                                    </div>

                                    {key === "local" ? (
                                        <div className="mb-3 flex flex-wrap items-center gap-1.5">
                                            <span className="rounded bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-on-surface">
                                                Express Ready
                                            </span>
                                            <span className="rounded bg-primary-container/60 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                Direct Dispatch
                                            </span>
                                            <span className="ml-1 text-[11px] font-medium text-on-surface-variant">
                                                Free shipping
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="mb-3 mt-1 flex flex-col space-y-0.5 rounded border border-warning/25 bg-warning-container/50 px-2.5 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="material-symbols-outlined text-[14px] text-primary"
                                                >
                                                    schedule
                                                </span>
                                                <span className="text-[11px] font-bold text-on-surface">
                                                    To be delivered by the latest scheduled shipment
                                                </span>
                                            </div>
                                            <span className="pl-5 text-[10px] text-on-surface-variant">
                                                Consolidated at the hub before dispatch
                                            </span>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {lines.map((line) => (
                                            <div key={line.id} className="flex gap-3 pt-1">
                                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-outline-variant/60 bg-surface-container">
                                                    <span className="material-symbols-outlined text-[28px] text-outline">
                                                        inventory_2
                                                    </span>
                                                </div>

                                                <div className="flex min-w-0 flex-1 flex-col justify-between">
                                                    <div>
                                                        <p className="truncate text-xs font-medium text-on-surface">
                                                            {line.name}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-xs text-outline">
                                                            {line.variant}
                                                        </p>
                                                    </div>

                                                    <div className="mt-2 flex items-center justify-between">
                                                        <div className="flex items-baseline gap-1.5">
                                                            <span className="text-base font-bold tracking-tight text-on-surface">
                                                                {birr(line.unitPrice)}
                                                            </span>
                                                            {line.wasPrice ? (
                                                                <span className="text-[11px] text-outline line-through">
                                                                    {birr(line.wasPrice)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <span className="rounded-[999px] border border-outline-variant px-2 py-0.5 text-xs font-semibold">
                                                            ×{line.quantity}
                                                        </span>
                                                    </div>

                                                    <div className="mt-1 flex items-center justify-between text-[10px] text-outline">
                                                        <span className="truncate">{line.supplier}</span>
                                                        <span className="font-mono">{birr(lineTotal(line))}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    {/* ── Payment method ── */}
                    <section className="bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-on-surface">Payment method</h2>
                                <p className="mt-0.5 text-xs text-on-surface-variant">
                                    Split across the store&apos;s accounts and cash
                                </p>
                            </div>
                            <span className="rounded border border-success/30 bg-success-container/60 px-2 py-0.5 text-[11px] font-semibold text-on-success-container">
                                ET Birr
                            </span>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] bg-surface-container p-1">
                            {([
                                { id: "now", label: "Pay now" },
                                { id: "later", label: "Pay later" },
                            ] as Array<{ id: PayTab; label: string }>).map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => setTab(entry.id)}
                                    className={`rounded-[8px] py-2 text-center text-[11px] transition-colors ${
                                        tab === entry.id
                                            ? "bg-surface-container-lowest font-bold text-on-surface shadow-sm"
                                            : "font-medium text-on-surface-variant hover:text-on-surface"
                                    }`}
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </div>

                        {tab === "now" ? (
                            <PaymentSplitEditor
                                accounts={accounts}
                                total={grandTotal}
                                legs={legs}
                                onChange={setLegs}
                                order={{ reference: order.reference, customer: order.customer }}
                                credit={credit}
                            />
                        ) : (
                            <div className="rounded-[10px] border-2 border-primary bg-primary-container/20 p-3">
                                <div className="flex items-start gap-2.5">
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-primary-container text-primary">
                                        <span className="material-symbols-outlined text-[20px]">schedule</span>
                                    </span>
                                    <div>
                                        <p className="text-xs font-bold text-on-surface">Pay later</p>
                                        <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
                                            The order is placed under <strong className="text-on-surface">To pay</strong>{" "}
                                            and its stock is held for 48 hours. Split the payment there when the
                                            customer is ready.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── Delivery address ── */}
                    <section className="bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-base font-bold text-on-surface">Delivery address</h2>
                            <span className="rounded bg-info-container px-2 py-0.5 text-[10px] font-bold leading-none text-on-info-container">
                                Carrier delivery
                            </span>
                        </div>
                        <div className="space-y-2">
                            <input
                                value={recipient}
                                onChange={(event) => setRecipient(event.target.value)}
                                placeholder="Recipient name"
                                className="w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
                            />
                            <input
                                value={phone}
                                onChange={(event) => setPhone(event.target.value)}
                                placeholder="Recipient phone"
                                inputMode="tel"
                                className="w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
                            />
                            <textarea
                                value={address}
                                onChange={(event) => setAddress(event.target.value)}
                                placeholder="Delivery address (sub-city, woreda, house no.)"
                                rows={2}
                                className="w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
                            />
                            <p className="text-[11px] text-outline">
                                A courier is assigned once the order has been picked and packed.
                            </p>
                        </div>
                    </section>

                    {/* ── Delivery fee & schedule ── */}
                    <section className="space-y-3 bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-bold text-on-surface">Delivery fee &amp; schedule</h2>
                        </div>

                        <div className="flex items-start gap-2 rounded-[10px] border border-warning/25 bg-warning-container/50 p-2.5">
                            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-on-warning-container">
                                info
                            </span>
                            <p className="text-[11px] leading-snug text-on-warning-container">
                                <strong className="font-bold">Optional for 'To Pay' orders:</strong> address,
                                fee and schedule can be set later, before final payment.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            {([
                                { id: "standard", label: "Standard delivery", hint: "3 – 5 business days", fee: "Quoted at dispatch" },
                                { id: "express", label: "Express delivery", hint: "Next-day delivery", fee: "Quoted at dispatch" },
                                { id: "later", label: "Calculate later", hint: "Confirm destination & slot before paying", fee: "Pending" },
                            ] as const).map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setDelivery(option.id)}
                                    className={`flex w-full items-center justify-between rounded-[10px] border p-2.5 text-left transition-colors ${
                                        delivery === option.id
                                            ? "border-primary bg-primary-container/25"
                                            : "border-outline-variant hover:bg-surface-container-low/60"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span
                                            aria-hidden="true"
                                            className={`flex h-4 w-4 items-center justify-center rounded-[999px] border ${
                                                delivery === option.id ? "border-primary" : "border-outline/50"
                                            } ${delivery === option.id ? "bg-primary" : ""}`}
                                        >
                                            {delivery === option.id ? (
                                                <span className="h-1.5 w-1.5 rounded-[999px] bg-surface-container-lowest" />
                                            ) : null}
                                        </span>
                                        <span>
                                            <span className="block text-xs font-bold text-on-surface">
                                                {option.label}
                                            </span>
                                            <span className="block text-[10px] text-on-surface-variant">{option.hint}</span>
                                        </span>
                                    </span>
                                    <span
                                        className={`text-xs font-bold ${
                                            option.id === "later" ? "text-on-success-container" : "text-on-surface"
                                        }`}
                                    >
                                        {option.fee}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* ── Summary ── */}
                    <section className="space-y-3 bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        <h3 className="text-base font-bold text-on-surface">Summary</h3>

                        <div className="flex items-center justify-between pt-1 text-sm">
                            <span className="font-medium text-on-surface">Subtotal</span>
                            <span className="font-bold text-on-surface">{birr(subtotal(order))}</span>
                        </div>

                        {savings(order) > 0 ? (
                            <div className="ml-0.5 space-y-2 border-l-2 border-outline-variant/60 pl-2 text-xs">
                                <div className="flex items-center justify-between text-on-surface-variant">
                                    <span>Items discount</span>
                                    <span className="font-semibold text-error">
                                        -{birr(savings(order))}
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center justify-between text-sm text-on-surface">
                            <span className="font-medium">Shipping fee</span>
                            <span className="font-bold">
                                {order.shippingFee > 0 ? birr(order.shippingFee) : "Free"}
                            </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-on-surface">
                            <span className="font-medium">Delivery</span>
                            <span className="font-bold">
                                {delivery === "later" ? "Pending" : "Quoted at dispatch"}
                            </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-on-surface">
                            <span className="font-medium">Additional charges</span>
                            <span className="font-bold">{birr(order.additionalCharges)}</span>
                        </div>

                        <div className="flex items-center justify-between border-t border-outline-variant/60 pt-3">
                            <span className="text-base font-bold text-on-surface">Total</span>
                            <span className="text-lg font-bold text-on-surface">{birr(grandTotal)}</span>
                        </div>
                    </section>
                </main>
            </div>

            {/* ── Sticky action bar ── */}
            <aside
                className="fixed inset-x-0 z-40 mx-auto max-w-[480px] rounded-t-[16px] border-t border-outline-variant bg-surface-container-lowest p-3 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] dark:shadow-none"
                style={{ bottom: ABOVE_NAV }}
            >
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                        <span className="block text-xs font-bold text-on-surface sm:inline">Total: </span>
                        <span className="text-lg font-bold tracking-tight text-on-surface">
                            {birr(grandTotal)}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={place}
                        disabled={!canPlace || placed}
                        className="max-w-[220px] flex-1 rounded-[999px] px-6 py-3 text-center text-sm font-bold text-on-primary shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 bg-primary"
                    >
                        {cta}
                    </button>
                </div>
                {tab === "now" && !balanced ? (
                    <p className="mx-auto mt-1.5 max-w-md text-center text-[10px] text-error">
                        Add payment parts that add up to the total to continue.
                    </p>
                ) : null}
            </aside>
        </>
    );
}

Confirmation.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
