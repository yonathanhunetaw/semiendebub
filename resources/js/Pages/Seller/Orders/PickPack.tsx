import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    BRAND,
    INK,
    PACK_DESTINATIONS,
    type PackDestination,
    type PickPackLine,
    type SellerOrder,
    type SourcePlan,
    birr,
    findOrder,
    initialPickPack,
    lineTotal,
} from "@/Data/sellerOrderFlow";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Pick & pack for a paid order.
 *
 * Each line carries three decisions:
 *  1. Where it is packed — store, remote unit, or the hub warehouse.
 *  2. How it is sourced — picked off the shop floor, or raised as a store
 *     order first when the item is not on the floor. A line that is not in
 *     store cannot be picked, so `pick_in_store` is disabled for it; it
 *     becomes pickable once the store order it is waiting on lands.
 *  3. Two confirmations — ticked when picked, then again when packed. Packing
 *     cannot be ticked before picking, and neither before a store order has
 *     arrived.
 *
 * Layout preview: state is local and nothing is persisted.
 */

interface Props {
    reference?: string;
}

const PLAN_LABELS: Record<SourcePlan, { label: string; hint: string; icon: string }> = {
    pick_in_store: {
        label: "Pick in store",
        hint: "On the floor now",
        icon: "shopping_basket",
    },
    store_order: {
        label: "Add to store order",
        hint: "Pick once it lands",
        icon: "add_shopping_cart",
    },
};

export default function PickPack({ reference }: Props): React.ReactElement {
    const order: SellerOrder | undefined = reference ? findOrder(reference) : undefined;

    const [plan, setPlan] = useState<Record<number, PickPackLine>>(() => {
        const seed: Record<number, PickPackLine> = {};
        order?.lines.forEach((line) => {
            seed[line.id] = initialPickPack(line);
        });
        return seed;
    });

    /** Lines whose store order has been marked as received. */
    const [arrived, setArrived] = useState<number[]>([]);

    const stats = useMemo(() => {
        const entries = Object.values(plan);

        return {
            total: entries.length,
            picked: entries.filter((entry) => entry.picked).length,
            packed: entries.filter((entry) => entry.packed).length,
            awaiting: entries.filter(
                (entry) => entry.plan === "store_order" && !arrived.includes(entry.lineId),
            ).length,
        };
    }, [plan, arrived]);

    if (!order) {
        return (
            <>
                <Head title="Pick & pack" />
                <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FB] px-6 text-center">
                    <span className="material-symbols-outlined text-[44px] text-slate-300">inventory_2</span>
                    <p className="mt-3 text-[16px] font-bold" style={{ color: INK }}>
                        Order not found
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500">
                        {reference ? `No sample order matches ${reference}.` : "No reference supplied."}
                    </p>
                    <Link
                        href={`${route("seller.orders.index")}?tab=paid`}
                        className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-white active:scale-95"
                        style={{ backgroundColor: BRAND }}
                    >
                        Back to orders
                    </Link>
                </div>
            </>
        );
    }

    const update = (lineId: number, patch: Partial<PickPackLine>) =>
        setPlan((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));

    /** A store-order line only becomes pickable once it has arrived. */
    const canPick = (entry: PickPackLine) =>
        entry.plan === "pick_in_store" || arrived.includes(entry.lineId);

    const allPacked = stats.total > 0 && stats.packed === stats.total;

    return (
        <>
            <Head title={`Pick & pack · ${order.reference}`}>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen bg-[#F8F9FB] pb-[200px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-40 border-b border-gray-100 bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center space-x-3">
                            <button
                                type="button"
                                onClick={() =>
                                    window.history.length > 1
                                        ? window.history.back()
                                        : router.visit(`${route("seller.orders.index")}?tab=packing`)
                                }
                                aria-label="Back"
                                className="-ml-1 p-1 text-gray-800"
                            >
                                <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                            </button>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-bold tracking-tight" style={{ color: INK }}>
                                    Pick &amp; pack
                                </h1>
                                <p className="truncate font-mono text-[11px] text-gray-400">
                                    {order.reference} · {order.customer}
                                </p>
                            </div>
                        </div>
                        <span className="shrink-0 rounded-[999px] border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            Paid
                        </span>
                    </div>

                    {/* Progress across the two confirmations */}
                    <div className="mt-2.5 flex items-center gap-3">
                        {([
                            { label: "Picked", done: stats.picked, icon: "shopping_basket" },
                            { label: "Packed", done: stats.packed, icon: "package_2" },
                        ] as const).map((step) => (
                            <div key={step.label} className="flex flex-1 items-center gap-1.5">
                                <span
                                    className={`material-symbols-outlined text-[15px] ${
                                        step.done === stats.total ? "text-emerald-600" : "text-gray-400"
                                    }`}
                                >
                                    {step.icon}
                                </span>
                                <span className="text-[11px] font-semibold text-gray-600">
                                    {step.label}
                                </span>
                                <span className="ml-auto font-mono text-[11px] font-bold text-gray-900">
                                    {step.done}/{stats.total}
                                </span>
                            </div>
                        ))}
                    </div>
                </header>

                <p className="px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Sample data · layout preview
                </p>

                {stats.awaiting > 0 ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-amber-200/80 bg-amber-100/50 px-3 py-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-amber-900">
                            pending
                        </span>
                        <p className="text-[11px] leading-snug text-amber-900">
                            <strong className="font-bold">{stats.awaiting} line(s)</strong> are on a store
                            order. Mark each as delivered to the store before it can be picked.
                        </p>
                    </div>
                ) : null}

                {/* ── Lines ── */}
                <div className="space-y-3 px-3.5 pt-3">
                    {order.lines.map((line) => {
                        const entry = plan[line.id];
                        if (!entry) return null;

                        const hasArrived = arrived.includes(line.id);
                        const pickable = canPick(entry);

                        return (
                            <div
                                key={line.id}
                                className={`rounded-[16px] border bg-white p-3.5 shadow-sm ${
                                    entry.packed ? "border-emerald-300" : "border-gray-100"
                                }`}
                            >
                                {/* Line identity */}
                                <div className="flex items-start gap-3">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50">
                                        <span className="material-symbols-outlined text-[22px] text-gray-400">
                                            inventory_2
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-gray-900">
                                            {line.name}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">
                                            {line.variant} · ×{line.quantity}
                                        </p>
                                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                                            {birr(lineTotal(line))}
                                        </p>
                                    </div>
                                    {!line.inStore ? (
                                        <span className="shrink-0 rounded-[999px] border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase text-rose-600">
                                            Not in store
                                        </span>
                                    ) : null}
                                </div>

                                {/* 1. Where it is packed */}
                                <div className="mt-3 border-t border-slate-100 pt-2.5">
                                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                        Pack at
                                    </p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {PACK_DESTINATIONS.map((destination) => {
                                            const active = entry.destination === destination.id;

                                            return (
                                                <button
                                                    key={destination.id}
                                                    type="button"
                                                    onClick={() =>
                                                        update(line.id, {
                                                            destination: destination.id as PackDestination,
                                                        })
                                                    }
                                                    className={`flex flex-col items-center gap-0.5 rounded-[10px] border px-1 py-2 transition-colors ${
                                                        active
                                                            ? "border-[#c2410c] bg-orange-50/60"
                                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                                    }`}
                                                >
                                                    <span
                                                        className="material-symbols-outlined text-[18px]"
                                                        style={{ color: active ? BRAND : "#94a3b8" }}
                                                    >
                                                        {destination.icon}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-bold ${
                                                            active ? "text-gray-900" : "text-gray-500"
                                                        }`}
                                                    >
                                                        {destination.label}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 2. How it is sourced */}
                                <div className="mt-3 border-t border-slate-100 pt-2.5">
                                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                        Source
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(["pick_in_store", "store_order"] as SourcePlan[]).map((option) => {
                                            const meta = PLAN_LABELS[option];
                                            const active = entry.plan === option;
                                            // An item that is not on the floor cannot be picked from it.
                                            const disabled = option === "pick_in_store" && !line.inStore;

                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    disabled={disabled}
                                                    title={
                                                        disabled
                                                            ? "Not in store — raise a store order instead"
                                                            : undefined
                                                    }
                                                    onClick={() =>
                                                        update(line.id, {
                                                            plan: option,
                                                            picked: false,
                                                            packed: false,
                                                        })
                                                    }
                                                    className={`flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                                                        active
                                                            ? "border-[#c2410c] bg-orange-50/60"
                                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                                    } disabled:cursor-not-allowed disabled:opacity-40`}
                                                >
                                                    <span
                                                        className="material-symbols-outlined text-[17px]"
                                                        style={{ color: active ? BRAND : "#94a3b8" }}
                                                    >
                                                        {meta.icon}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span
                                                            className={`block truncate text-[11px] font-bold ${
                                                                active ? "text-gray-900" : "text-gray-600"
                                                            }`}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                        <span className="block truncate text-[9px] text-gray-400">
                                                            {meta.hint}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* A store-order line waits on its delivery. */}
                                    {entry.plan === "store_order" ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setArrived((current) =>
                                                    current.includes(line.id)
                                                        ? current.filter((id) => id !== line.id)
                                                        : [...current, line.id],
                                                )
                                            }
                                            className={`mt-2 flex w-full items-center justify-between rounded-[8px] border px-2.5 py-1.5 text-left transition-colors ${
                                                hasArrived
                                                    ? "border-emerald-200 bg-emerald-50"
                                                    : "border-amber-200 bg-amber-50"
                                            }`}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={`material-symbols-outlined text-[15px] ${
                                                        hasArrived ? "text-emerald-700" : "text-amber-700"
                                                    }`}
                                                >
                                                    {hasArrived ? "check_circle" : "local_shipping"}
                                                </span>
                                                <span
                                                    className={`text-[10px] font-bold ${
                                                        hasArrived ? "text-emerald-800" : "text-amber-900"
                                                    }`}
                                                >
                                                    {hasArrived
                                                        ? "Delivered to store"
                                                        : "Awaiting delivery to store"}
                                                </span>
                                            </span>
                                            <span className="text-[9px] font-bold uppercase text-gray-500">
                                                {hasArrived ? "Undo" : "Mark arrived"}
                                            </span>
                                        </button>
                                    ) : null}
                                </div>

                                {/* 3. The two confirmations */}
                                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5">
                                    <button
                                        type="button"
                                        disabled={!pickable}
                                        title={
                                            !pickable
                                                ? "Mark the store order as delivered first"
                                                : undefined
                                        }
                                        onClick={() =>
                                            update(line.id, {
                                                picked: !entry.picked,
                                                // Unpicking a line cannot leave it packed.
                                                packed: entry.picked ? false : entry.packed,
                                            })
                                        }
                                        className={`flex items-center justify-center gap-1.5 rounded-[999px] border px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                            entry.picked
                                                ? "border-emerald-600 bg-emerald-600 text-white"
                                                : "border-slate-300 bg-white text-gray-700"
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">
                                            {entry.picked ? "check_circle" : "radio_button_unchecked"}
                                        </span>
                                        Picked
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!entry.picked}
                                        title={!entry.picked ? "Tick picked first" : undefined}
                                        onClick={() => update(line.id, { packed: !entry.packed })}
                                        className={`flex items-center justify-center gap-1.5 rounded-[999px] border px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                            entry.packed
                                                ? "border-emerald-600 bg-emerald-600 text-white"
                                                : "border-slate-300 bg-white text-gray-700"
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">
                                            {entry.packed ? "check_circle" : "radio_button_unchecked"}
                                        </span>
                                        Packed
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Sticky CTA ── */}
            <nav
                className="fixed inset-x-0 z-50 mx-auto max-w-[480px] rounded-t-[16px] border-t border-gray-200 bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
                style={{ bottom: ABOVE_NAV }}
            >
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                        <span className="block font-mono text-[11px] text-gray-500">
                            {stats.packed}/{stats.total} packed
                        </span>
                        <span className="text-[11px] font-semibold text-gray-700">
                            {allPacked ? "Ready to hand over" : "Finish packing to continue"}
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={!allPacked}
                        onClick={() => router.visit(`${route("seller.orders.index")}?tab=to_deliver`)}
                        className="max-w-[200px] flex-1 rounded-[999px] px-6 py-3 text-center text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40"
                        style={{ backgroundColor: BRAND }}
                    >
                        Move to delivery
                    </button>
                </div>
            </nav>
        </>
    );
}

PickPack.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
