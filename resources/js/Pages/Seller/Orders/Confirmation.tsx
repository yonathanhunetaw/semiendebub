import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    ACCOUNT_HOLDER,
    allocateSplit,
    BANKS,
    FULFILLMENT_LABELS,
    type PaymentLeg,
    type SellerOrder,
    type Provider,
    type SplitPreset,
    WALLETS,
    birr,
    findProvider,
    formatLegsForCopy,
    groupByFulfillment,
    lineTotal,
    orderTotal,
    savings,
    subtotal,
} from "@/Data/sellerOrderFlow";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Order confirmation.
 *
 * Layout preview: the order below is sample data and nothing is submitted.
 * "Place order" moves the order into the To pay queue client-side so the rest
 * of the flow can be walked through.
 *
 * The four payment routes are Bank transfer, Mobile wallet, Pay later and
 * Credit. Bank and wallet both support splitting a total across several
 * destinations — see the `split` state below.
 */

type PayTab = "bank" | "wallet" | "later" | "credit";

const TABS: Array<{ id: PayTab; label: string; cta: (total: string) => string }> = [
    { id: "bank", label: "Bank Transfers", cta: () => "Request payment" },
    { id: "wallet", label: "Mobile Wallets", cta: () => "Request payment" },
    { id: "later", label: "Pay Later", cta: () => "Place order (To Pay)" },
    { id: "credit", label: "Add to Credit", cta: (total) => `Place order on credit (${total})` },
];

let legSeq = 0;
const nextLegKey = () => `leg-${++legSeq}`;

/** One selectable provider row. */
function ProviderRow({
    provider,
    checked,
    onSelect,
    multi,
}: {
    provider: Provider;
    checked: boolean;
    onSelect: () => void;
    multi: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`flex w-full items-center justify-between rounded-[10px] border p-2.5 text-left transition-colors ${
                checked ? "border-primary bg-primary-container/25" : "border-outline-variant hover:bg-surface-container-low/60"
            }`}
        >
            <span className="flex min-w-0 items-center gap-2.5">
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] text-xs font-bold ${provider.tone}`}
                >
                    {provider.initials}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-on-surface">{provider.name}</span>
                    {provider.note ? (
                        <span className="block text-[10px] text-on-surface-variant">{provider.note}</span>
                    ) : null}
                </span>
            </span>

            <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    multi ? "rounded-[4px]" : "rounded-[999px]"
                } ${checked ? "border-primary" : "border-outline/50"} ${checked ? "bg-primary" : ""}`}
            >
                {checked ? (
                    <span className="material-symbols-outlined text-[11px] text-on-primary">check</span>
                ) : null}
            </span>
        </button>
    );
}

interface Props {
    /** The cart being turned into an order; null when none was chosen. */
    cart_id?: number | null;
    /** The cart, priced and checked against the store's stock (OrderBoardController::preview). */
    order?: SellerOrder | null;
}

export default function Confirmation({ cart_id = null, order = null }: Props): React.ReactElement {
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

    return <ConfirmationForm cartId={cart_id} order={order} />;
}

function ConfirmationForm({ cartId, order }: { cartId: number; order: SellerOrder }): React.ReactElement {

    const [tab, setTab] = useState<PayTab>("bank");
    const [single, setSingle] = useState<string>("cbe");
    const [split, setSplit] = useState(false);
    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [copied, setCopied] = useState(false);
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

    const providers = tab === "wallet" ? WALLETS : BANKS;
    const splitAllocated = legs.reduce((sum, leg) => sum + leg.amount, 0);
    const remaining = Math.round((grandTotal - splitAllocated) * 100) / 100;

    /**
     * Add a leg for a provider.
     *
     * The destination details are the store's own receiving account, so they
     * are filled in from the provider rather than typed per order — the seller
     * can still correct them. Amounts are re-spread evenly across the legs so
     * the split always starts balanced.
     */
    const addLeg = (providerId: string) => {
        const provider = findProvider(providerId);

        setLegs((current) =>
            allocateSplit(
                [
                    ...current,
                    {
                        key: nextLegKey(),
                        providerId,
                        reference: provider?.account ?? "",
                        accountName: ACCOUNT_HOLDER,
                        amount: 0,
                    },
                ],
                grandTotal,
                "equal",
            ),
        );
        setCopied(false);
    };

    /** Re-spread the total across the current legs. */
    const applyPreset = (preset: SplitPreset) => {
        setLegs((current) => allocateSplit(current, grandTotal, preset));
        setCopied(false);
    };

    const updateLeg = (key: string, patch: Partial<PaymentLeg>) => {
        setLegs((current) => current.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg)));
        setCopied(false);
    };

    const removeLeg = (key: string) =>
        setLegs((current) =>
            allocateSplit(current.filter((leg) => leg.key !== key), grandTotal, "equal"),
        );

    const copyBlock = async () => {
        const text = formatLegsForCopy(legs, order);

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            // Clipboard is blocked in some embedded webviews; the block stays
            // on screen and selectable, so the seller can copy it by hand.
            setCopied(false);
        }
    };

    const legsComplete =
        legs.length > 0 &&
        legs.every((leg) => leg.reference.trim() && leg.accountName.trim() && leg.amount > 0) &&
        Math.abs(remaining) < 0.01;

    const canPlace = split ? legsComplete : tab === "later" || tab === "credit" || Boolean(single);

    const payNow = tab !== "later";

    const place = () => {
        setPlaced(true);

        const method = split
            ? "split"
            : tab === "credit"
              ? "credit_account"
              : tab === "later"
                ? null
                : single;

        router.post(
            route("seller.orders.store"),
            {
                cart_id: cartId,
                pay_now: payNow,
                payment_method: method,
                transaction_reference: split
                    ? legs.map((leg) => `${leg.providerId}:${leg.reference}:${leg.amount}`).join(" | ")
                    : null,
                delivery_address: address || null,
                recipient_name: recipient || null,
                recipient_phone: phone || null,
                delay_agreed: needsDelay,
            },
            { onFinish: () => setPlaced(false) },
        );
    };

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
                                    Ethiopian bank or mobile wallet
                                </p>
                            </div>
                            <span className="rounded border border-success/30 bg-success-container/60 px-2 py-0.5 text-[11px] font-semibold text-on-success-container">
                                ET Birr
                            </span>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] bg-surface-container p-1 sm:grid-cols-4">
                            {TABS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => {
                                        setTab(entry.id);
                                        setSplit(false);
                                        setLegs([]);
                                    }}
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

                        {/* Bank / wallet panels share the provider list + split UI. */}
                        {tab === "bank" || tab === "wallet" ? (
                            <div className="space-y-3">
                                {/* Pay separately toggle */}
                                <div className="flex items-start justify-between gap-2 rounded-[10px] border border-outline-variant bg-surface-container-low/70 p-2.5">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-on-surface">Pay separately</p>
                                        <p className="mt-0.5 text-[10px] leading-snug text-on-surface-variant">
                                            Split the total across several of the shop's accounts,
                                            then share the details with the customer.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={split}
                                        aria-label="Pay separately"
                                        onClick={() => {
                                            setSplit((on) => !on);
                                            setLegs([]);
                                            setCopied(false);
                                        }}
                                        className={`relative h-5 w-9 shrink-0 rounded-[999px] transition-colors ${
                                            split ? "" : "bg-surface-container-highest"
                                        } ${split ? "bg-primary" : ""}`}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-4 w-4 rounded-[999px] bg-surface-container-lowest transition-all ${
                                                split ? "left-[18px]" : "left-0.5"
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                    {providers.map((provider) => (
                                        <ProviderRow
                                            key={provider.id}
                                            provider={provider}
                                            multi={split}
                                            checked={
                                                split
                                                    ? legs.some((leg) => leg.providerId === provider.id)
                                                    : single === provider.id
                                            }
                                            onSelect={() => {
                                                if (!split) {
                                                    setSingle(provider.id);
                                                    return;
                                                }

                                                const existing = legs.find(
                                                    (leg) => leg.providerId === provider.id,
                                                );

                                                if (existing) {
                                                    removeLeg(existing.key);
                                                } else {
                                                    addLeg(provider.id);
                                                }
                                            }}
                                        />
                                    ))}
                                </div>

                                {/* Split legs: collect destination + amount per provider. */}
                                {split ? (
                                    <div className="space-y-2.5 rounded-[10px] border border-dashed border-outline/50 p-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-on-surface">
                                                Split across {legs.length} account
                                                {legs.length === 1 ? "" : "s"}
                                            </span>
                                            <span
                                                className={`font-mono text-[11px] font-bold ${
                                                    Math.abs(remaining) < 0.01
                                                        ? "text-success"
                                                        : "text-error"
                                                }`}
                                            >
                                                {Math.abs(remaining) < 0.01
                                                    ? "Balanced"
                                                    : `${birr(remaining)} left`}
                                            </span>
                                        </div>

                                        {legs.length === 0 ? (
                                            <p className="py-2 text-center text-[11px] text-outline">
                                                Tick the accounts above to split the total between them.
                                            </p>
                                        ) : (
                                            /* Quick allocations — the seller adjusts from here. */
                                            <div className="flex items-center gap-1.5">
                                                {([
                                                    { id: "equal", label: "Split equally" },
                                                    { id: "half", label: "Half" },
                                                    { id: "clear", label: "Clear" },
                                                ] as Array<{ id: SplitPreset; label: string }>).map((preset) => (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        onClick={() => applyPreset(preset.id)}
                                                        disabled={preset.id === "half" && legs.length < 2}
                                                        className="rounded-[999px] border border-outline/50 bg-surface-container-lowest px-2.5 py-1 text-[10px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95 disabled:opacity-35"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                                <span className="ml-auto text-[9px] text-outline">
                                                    Editable
                                                </span>
                                            </div>
                                        )}

                                        {legs.map((leg) => {
                                            const provider = findProvider(leg.providerId);
                                            const byPhone = provider?.settleBy === "phone";

                                            return (
                                                <div
                                                    key={leg.key}
                                                    className="space-y-2 rounded-[8px] border border-outline-variant bg-surface-container-lowest p-2.5"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="truncate text-[11px] font-bold text-on-surface">
                                                            {provider?.name ?? leg.providerId}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLeg(leg.key)}
                                                            aria-label={`Remove ${provider?.name ?? "account"}`}
                                                            className="text-outline hover:text-error"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">
                                                                close
                                                            </span>
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <label className="block">
                                                            <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                                                                {byPhone ? "Phone number" : "Account number"}
                                                            </span>
                                                            <input
                                                                type="text"
                                                                inputMode={byPhone ? "tel" : "numeric"}
                                                                value={leg.reference}
                                                                onChange={(event) =>
                                                                    updateLeg(leg.key, {
                                                                        reference: event.target.value,
                                                                    })
                                                                }
                                                                placeholder={byPhone ? "09…" : "1000…"}
                                                                className="w-full rounded-[6px] border-outline-variant px-2 py-1 text-[11px] focus:border-primary focus:ring-0"
                                                            />
                                                        </label>

                                                        <label className="block">
                                                            <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                                                                Account name
                                                            </span>
                                                            <input
                                                                type="text"
                                                                value={leg.accountName}
                                                                onChange={(event) =>
                                                                    updateLeg(leg.key, {
                                                                        accountName: event.target.value,
                                                                    })
                                                                }
                                                                placeholder="Full name"
                                                                className="w-full rounded-[6px] border-outline-variant px-2 py-1 text-[11px] focus:border-primary focus:ring-0"
                                                            />
                                                        </label>
                                                    </div>

                                                    <label className="block">
                                                        <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                                                            Amount (ETB)
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="0.01"
                                                            value={leg.amount}
                                                            onChange={(event) =>
                                                                updateLeg(leg.key, {
                                                                    amount: Number(event.target.value) || 0,
                                                                })
                                                            }
                                                            className="w-full rounded-[6px] border-outline-variant px-2 py-1 text-[11px] focus:border-primary focus:ring-0"
                                                        />
                                                    </label>
                                                </div>
                                            );
                                        })}

                                        {/* The copyable artefact this flow exists to produce. */}
                                        {legs.length > 0 ? (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                                        Send to customer
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={copyBlock}
                                                        className="flex items-center gap-1 rounded-[999px] border border-outline/50 px-2.5 py-1 text-[10px] font-bold text-on-surface active:scale-95"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">
                                                            {copied ? "check" : "content_copy"}
                                                        </span>
                                                        {copied ? "Copied" : "Copy"}
                                                    </button>
                                                </div>
                                                <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap rounded-[8px] bg-inverse-surface p-2.5 font-mono text-[10px] leading-relaxed text-inverse-on-surface">
{formatLegsForCopy(legs, order)}
                                                </pre>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {tab === "later" ? (
                            <div className="rounded-[10px] border-2 border-primary bg-primary-container/20 p-3">
                                <div className="flex items-start gap-2.5">
                                    <span
                                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-primary-container text-primary"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">schedule</span>
                                    </span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="text-xs font-bold text-on-surface">
                                                Pay later / deferred payment
                                            </p>
                                            <span className="rounded bg-primary-container px-1.5 py-0.5 text-[9px] font-bold leading-none text-on-primary-container">
                                                Allocates stock to 'To Pay'
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
                                            The order is registered and inventory allocated immediately
                                            under the <strong className="text-on-surface">To pay</strong> queue.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-start gap-2 rounded border-t border-outline-variant/80 bg-surface-container-lowest/70 p-2.5 pt-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                                    <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-warning">
                                        info
                                    </span>
                                    <span>
                                        Delivery address, fee and date can be finalised later, before
                                        payment is taken.
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        {tab === "credit" ? (
                            <div className="rounded-[10px] border-2 border-primary bg-primary-container/20 p-3">
                                <div className="flex items-start gap-2.5">
                                    <span
                                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-primary-container text-primary"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">credit_card</span>
                                    </span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="text-xs font-bold text-on-surface">
                                                Buyer credit account
                                            </p>
                                            <span className="rounded bg-info-container px-1.5 py-0.5 text-[9px] font-bold leading-none text-on-info-container">
                                                Net 30 days
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
                                            Charged to the trade credit ledger. Invoice issued on dispatch.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2 rounded border-t border-outline-variant/80 bg-surface-container-lowest/70 p-2.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-on-surface-variant">Available credit</span>
                                        <span className="font-bold text-on-surface">{birr(250000)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-on-surface-variant">This order</span>
                                        <span className="font-bold text-error">
                                            -{birr(grandTotal)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-outline-variant/60 pt-1.5 text-xs">
                                        <span className="font-semibold text-on-surface-variant">Remaining</span>
                                        <span className="font-bold text-on-success-container">
                                            {birr(250000 - grandTotal)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
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
                        {TABS.find((entry) => entry.id === tab)?.cta(birr(grandTotal))}
                    </button>
                </div>
                {split && !legsComplete ? (
                    <p className="mx-auto mt-1.5 max-w-md text-center text-[10px] text-error">
                        Fill in every account and balance the split to continue.
                    </p>
                ) : null}
            </aside>
        </>
    );
}

Confirmation.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
