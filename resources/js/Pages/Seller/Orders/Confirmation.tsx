import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    ACCOUNT_HOLDER,
    allocateSplit,
    BANKS,
    BRAND,
    DANGER,
    FULFILLMENT_LABELS,
    INK,
    type PaymentLeg,
    type Provider,
    SAMPLE_ORDERS,
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
import { Head, router } from "@inertiajs/react";
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
                checked ? "border-[#c2410c] bg-orange-50/40" : "border-gray-200 hover:bg-gray-50/60"
            }`}
        >
            <span className="flex min-w-0 items-center gap-2.5">
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] text-xs font-bold ${provider.tone}`}
                >
                    {provider.initials}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-gray-900">{provider.name}</span>
                    {provider.note ? (
                        <span className="block text-[10px] text-gray-500">{provider.note}</span>
                    ) : null}
                </span>
            </span>

            <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    multi ? "rounded-[4px]" : "rounded-[999px]"
                } ${checked ? "border-[#c2410c]" : "border-gray-300"}`}
                style={checked ? { backgroundColor: BRAND } : undefined}
            >
                {checked ? (
                    <span className="material-symbols-outlined text-[11px] text-white">check</span>
                ) : null}
            </span>
        </button>
    );
}

export default function Confirmation(): React.ReactElement {
    // Sample basis for the screen: the first order still awaiting payment.
    const order = SAMPLE_ORDERS.find((entry) => entry.stage === "to_pay") ?? SAMPLE_ORDERS[0];

    const [tab, setTab] = useState<PayTab>("bank");
    const [single, setSingle] = useState<string>("cbe");
    const [split, setSplit] = useState(false);
    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [copied, setCopied] = useState(false);
    const [placed, setPlaced] = useState(false);
    const [delivery, setDelivery] = useState<"standard" | "express" | "later">("standard");

    const groups = useMemo(() => groupByFulfillment(order.lines), [order]);
    const total = orderTotal(order);
    const deliveryFee = delivery === "standard" ? 850 : delivery === "express" ? 1450 : 0;
    const grandTotal = total + deliveryFee;

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

    const place = () => {
        setPlaced(true);
        // No backend yet — land on the To pay queue so the flow continues.
        router.visit(`${route("seller.orders.index")}?tab=to_pay`);
    };

    return (
        <>
            <Head title="Order confirmation">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen bg-[#f5f5f7] pb-[200px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-gray-100 bg-white px-4 shadow-sm">
                    <button
                        type="button"
                        onClick={() =>
                            window.history.length > 1
                                ? window.history.back()
                                : router.visit(route("seller.carts.index"))
                        }
                        aria-label="Back"
                        className="-ml-1 p-1 text-gray-800"
                    >
                        <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                    </button>
                    <h1 className="text-base font-bold tracking-tight" style={{ color: INK }}>
                        Order confirmation
                    </h1>
                    <span className="w-6" />
                </header>

                <p className="px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Sample data · layout preview
                </p>

                <main className="mx-auto max-w-md space-y-2.5 px-0 pt-2 sm:px-2">
                    {/* ── Items, banded by fulfillment ── */}
                    <section className="bg-white p-4 shadow-sm sm:rounded-[12px]">
                        {groups.map(([key, lines], index) => {
                            const meta = FULFILLMENT_LABELS[key];

                            return (
                                <div
                                    key={key}
                                    className={index === 0 ? "border-b border-gray-100 pb-4" : "pt-4"}
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 pb-2">
                                        <span
                                            className={`flex h-4 items-center rounded px-2 text-[10px] font-bold leading-none ${meta.badgeClass}`}
                                        >
                                            {meta.badge}
                                        </span>
                                        <span className="text-sm font-bold tracking-tight text-gray-900">
                                            {meta.title}
                                        </span>
                                    </div>

                                    {key === "local" ? (
                                        <div className="mb-3 flex flex-wrap items-center gap-1.5">
                                            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-800">
                                                Express Ready
                                            </span>
                                            <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">
                                                Direct Dispatch
                                            </span>
                                            <span className="ml-1 text-[11px] font-medium text-gray-500">
                                                Free shipping
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="mb-3 mt-1 flex flex-col space-y-0.5 rounded border border-amber-200/80 bg-amber-100/50 px-2.5 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="material-symbols-outlined text-[14px]"
                                                    style={{ color: BRAND }}
                                                >
                                                    schedule
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-900">
                                                    To be delivered by the latest scheduled shipment
                                                </span>
                                            </div>
                                            <span className="pl-5 text-[10px] text-gray-600">
                                                Consolidated at the hub before dispatch
                                            </span>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {lines.map((line) => (
                                            <div key={line.id} className="flex gap-3 pt-1">
                                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-gray-100 bg-gray-100">
                                                    <span className="material-symbols-outlined text-[28px] text-gray-400">
                                                        inventory_2
                                                    </span>
                                                </div>

                                                <div className="flex min-w-0 flex-1 flex-col justify-between">
                                                    <div>
                                                        <p className="truncate text-xs font-medium text-gray-900">
                                                            {line.name}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-xs text-gray-400">
                                                            {line.variant}
                                                        </p>
                                                    </div>

                                                    <div className="mt-2 flex items-center justify-between">
                                                        <div className="flex items-baseline gap-1.5">
                                                            <span className="text-base font-bold tracking-tight text-gray-950">
                                                                {birr(line.unitPrice)}
                                                            </span>
                                                            {line.wasPrice ? (
                                                                <span className="text-[11px] text-gray-400 line-through">
                                                                    {birr(line.wasPrice)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <span className="rounded-[999px] border border-gray-200 px-2 py-0.5 text-xs font-semibold">
                                                            ×{line.quantity}
                                                        </span>
                                                    </div>

                                                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
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
                    <section className="bg-white p-4 shadow-sm sm:rounded-[12px]">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-gray-950">Payment method</h2>
                                <p className="mt-0.5 text-xs text-gray-500">
                                    Ethiopian bank or mobile wallet
                                </p>
                            </div>
                            <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                ET Birr
                            </span>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] bg-gray-100 p-1 sm:grid-cols-4">
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
                                            ? "bg-white font-bold text-gray-900 shadow-sm"
                                            : "font-medium text-gray-600 hover:text-black"
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
                                <div className="flex items-start justify-between gap-2 rounded-[10px] border border-gray-200 bg-gray-50/70 p-2.5">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-900">Pay separately</p>
                                        <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
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
                                            split ? "" : "bg-gray-300"
                                        }`}
                                        style={split ? { backgroundColor: BRAND } : undefined}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-4 w-4 rounded-[999px] bg-white transition-all ${
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
                                    <div className="space-y-2.5 rounded-[10px] border border-dashed border-gray-300 p-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-gray-900">
                                                Split across {legs.length} account
                                                {legs.length === 1 ? "" : "s"}
                                            </span>
                                            <span
                                                className={`font-mono text-[11px] font-bold ${
                                                    Math.abs(remaining) < 0.01
                                                        ? "text-emerald-600"
                                                        : "text-rose-600"
                                                }`}
                                            >
                                                {Math.abs(remaining) < 0.01
                                                    ? "Balanced"
                                                    : `${birr(remaining)} left`}
                                            </span>
                                        </div>

                                        {legs.length === 0 ? (
                                            <p className="py-2 text-center text-[11px] text-gray-400">
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
                                                        className="rounded-[999px] border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-700 transition-colors hover:bg-slate-50 active:scale-95 disabled:opacity-35"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                                <span className="ml-auto text-[9px] text-gray-400">
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
                                                    className="space-y-2 rounded-[8px] border border-gray-200 bg-white p-2.5"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="truncate text-[11px] font-bold text-gray-900">
                                                            {provider?.name ?? leg.providerId}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLeg(leg.key)}
                                                            aria-label={`Remove ${provider?.name ?? "account"}`}
                                                            className="text-gray-400 hover:text-rose-600"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">
                                                                close
                                                            </span>
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <label className="block">
                                                            <span className="mb-0.5 block text-[10px] font-medium text-gray-500">
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
                                                                className="w-full rounded-[6px] border-gray-200 px-2 py-1 text-[11px] focus:border-[#c2410c] focus:ring-0"
                                                            />
                                                        </label>

                                                        <label className="block">
                                                            <span className="mb-0.5 block text-[10px] font-medium text-gray-500">
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
                                                                className="w-full rounded-[6px] border-gray-200 px-2 py-1 text-[11px] focus:border-[#c2410c] focus:ring-0"
                                                            />
                                                        </label>
                                                    </div>

                                                    <label className="block">
                                                        <span className="mb-0.5 block text-[10px] font-medium text-gray-500">
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
                                                            className="w-full rounded-[6px] border-gray-200 px-2 py-1 text-[11px] focus:border-[#c2410c] focus:ring-0"
                                                        />
                                                    </label>
                                                </div>
                                            );
                                        })}

                                        {/* The copyable artefact this flow exists to produce. */}
                                        {legs.length > 0 ? (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                                        Send to customer
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={copyBlock}
                                                        className="flex items-center gap-1 rounded-[999px] border border-gray-300 px-2.5 py-1 text-[10px] font-bold text-gray-800 active:scale-95"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">
                                                            {copied ? "check" : "content_copy"}
                                                        </span>
                                                        {copied ? "Copied" : "Copy"}
                                                    </button>
                                                </div>
                                                <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap rounded-[8px] bg-gray-900 p-2.5 font-mono text-[10px] leading-relaxed text-gray-100">
{formatLegsForCopy(legs, order)}
                                                </pre>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {tab === "later" ? (
                            <div className="rounded-[10px] border-2 border-[#c2410c] bg-orange-50/30 p-3">
                                <div className="flex items-start gap-2.5">
                                    <span
                                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-orange-100"
                                        style={{ color: BRAND }}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">schedule</span>
                                    </span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="text-xs font-bold text-gray-900">
                                                Pay later / deferred payment
                                            </p>
                                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold leading-none text-orange-900">
                                                Allocates stock to 'To Pay'
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-snug text-gray-600">
                                            The order is registered and inventory allocated immediately
                                            under the <strong className="text-gray-900">To pay</strong> queue.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-start gap-2 rounded border-t border-gray-200/80 bg-white/70 p-2.5 pt-2.5 text-[11px] leading-relaxed text-gray-600">
                                    <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-amber-700">
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
                            <div className="rounded-[10px] border-2 border-[#c2410c] bg-orange-50/30 p-3">
                                <div className="flex items-start gap-2.5">
                                    <span
                                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-orange-100"
                                        style={{ color: BRAND }}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">credit_card</span>
                                    </span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="text-xs font-bold text-gray-900">
                                                Buyer credit account
                                            </p>
                                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold leading-none text-blue-900">
                                                Net 30 days
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-snug text-gray-600">
                                            Charged to the trade credit ledger. Invoice issued on dispatch.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2 rounded border-t border-gray-200/80 bg-white/70 p-2.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-500">Available credit</span>
                                        <span className="font-bold text-gray-900">{birr(250000)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-500">This order</span>
                                        <span className="font-bold" style={{ color: DANGER }}>
                                            -{birr(grandTotal)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs">
                                        <span className="font-semibold text-gray-700">Remaining</span>
                                        <span className="font-bold text-emerald-800">
                                            {birr(250000 - grandTotal)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </section>

                    {/* ── Delivery address ── */}
                    <section className="bg-white p-4 shadow-sm sm:rounded-[12px]">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-base font-bold text-gray-950">Delivery address</h2>
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold leading-none text-blue-800">
                                Carrier delivery
                            </span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-sm font-bold text-gray-900">{order.destination.name}</p>
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                                    {order.destination.kind}
                                </span>
                            </div>
                            <p className="text-xs font-medium text-gray-700">{order.destination.vehicle}</p>
                            <p className="text-xs text-gray-500">Driver: {order.destination.driver}</p>
                            <p className="text-[11px] text-gray-400">{order.destination.address}</p>
                        </div>
                    </section>

                    {/* ── Delivery fee & schedule ── */}
                    <section className="space-y-3 bg-white p-4 shadow-sm sm:rounded-[12px]">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-bold text-gray-950">Delivery fee &amp; schedule</h2>
                        </div>

                        <div className="flex items-start gap-2 rounded-[10px] border border-amber-200/80 bg-amber-100/50 p-2.5">
                            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-amber-900">
                                info
                            </span>
                            <p className="text-[11px] leading-snug text-amber-900">
                                <strong className="font-bold">Optional for 'To Pay' orders:</strong> address,
                                fee and schedule can be set later, before final payment.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            {([
                                { id: "standard", label: "Standard delivery", hint: "3 – 5 business days", fee: birr(850) },
                                { id: "express", label: "Express delivery", hint: "Next-day delivery", fee: birr(1450) },
                                { id: "later", label: "Calculate later", hint: "Confirm destination & slot before paying", fee: "Pending" },
                            ] as const).map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setDelivery(option.id)}
                                    className={`flex w-full items-center justify-between rounded-[10px] border p-2.5 text-left transition-colors ${
                                        delivery === option.id
                                            ? "border-[#c2410c] bg-orange-50/40"
                                            : "border-gray-200 hover:bg-gray-50/60"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span
                                            aria-hidden="true"
                                            className={`flex h-4 w-4 items-center justify-center rounded-[999px] border ${
                                                delivery === option.id ? "border-[#c2410c]" : "border-gray-300"
                                            }`}
                                            style={
                                                delivery === option.id ? { backgroundColor: BRAND } : undefined
                                            }
                                        >
                                            {delivery === option.id ? (
                                                <span className="h-1.5 w-1.5 rounded-[999px] bg-white" />
                                            ) : null}
                                        </span>
                                        <span>
                                            <span className="block text-xs font-bold text-gray-900">
                                                {option.label}
                                            </span>
                                            <span className="block text-[10px] text-gray-500">{option.hint}</span>
                                        </span>
                                    </span>
                                    <span
                                        className={`text-xs font-bold ${
                                            option.id === "later" ? "text-emerald-800" : "text-gray-900"
                                        }`}
                                    >
                                        {option.fee}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* ── Summary ── */}
                    <section className="space-y-3 bg-white p-4 shadow-sm sm:rounded-[12px]">
                        <h3 className="text-base font-bold text-gray-950">Summary</h3>

                        <div className="flex items-center justify-between pt-1 text-sm">
                            <span className="font-medium text-gray-900">Subtotal</span>
                            <span className="font-bold text-gray-950">{birr(subtotal(order))}</span>
                        </div>

                        {savings(order) > 0 ? (
                            <div className="ml-0.5 space-y-2 border-l-2 border-gray-100 pl-2 text-xs">
                                <div className="flex items-center justify-between text-gray-500">
                                    <span>Items discount</span>
                                    <span className="font-semibold" style={{ color: DANGER }}>
                                        -{birr(savings(order))}
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center justify-between text-sm text-gray-900">
                            <span className="font-medium">Shipping fee</span>
                            <span className="font-bold">
                                {order.shippingFee > 0 ? birr(order.shippingFee) : "Free"}
                            </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-900">
                            <span className="font-medium">Delivery</span>
                            <span className="font-bold">
                                {delivery === "later" ? "Pending" : birr(deliveryFee)}
                            </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-900">
                            <span className="font-medium">Additional charges</span>
                            <span className="font-bold">{birr(order.additionalCharges)}</span>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                            <span className="text-base font-bold text-gray-950">Total</span>
                            <span className="text-lg font-bold text-gray-950">{birr(grandTotal)}</span>
                        </div>
                    </section>
                </main>
            </div>

            {/* ── Sticky action bar ── */}
            <aside
                className="fixed inset-x-0 z-40 mx-auto max-w-[480px] rounded-t-[16px] border-t border-gray-200 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
                style={{ bottom: ABOVE_NAV }}
            >
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                        <span className="block text-xs font-bold text-gray-900 sm:inline">Total: </span>
                        <span className="text-lg font-bold tracking-tight text-gray-950">
                            {birr(grandTotal)}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={place}
                        disabled={!canPlace || placed}
                        className="max-w-[220px] flex-1 rounded-[999px] px-6 py-3 text-center text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40"
                        style={{ backgroundColor: BRAND }}
                    >
                        {TABS.find((entry) => entry.id === tab)?.cta(birr(grandTotal))}
                    </button>
                </div>
                {split && !legsComplete ? (
                    <p className="mx-auto mt-1.5 max-w-md text-center text-[10px] text-rose-600">
                        Fill in every account and balance the split to continue.
                    </p>
                ) : null}
            </aside>
        </>
    );
}

Confirmation.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
