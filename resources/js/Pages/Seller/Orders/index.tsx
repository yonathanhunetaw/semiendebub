import ListTopBar, { type TabSpec } from "@/Components/Seller/ListTopBar";
import SellerLayout from "@/Layouts/SellerLayout";
import {
    ABOVE_NAV,
    BRAND,
    INK,
    type OrderStage,
    SAMPLE_ORDERS,
    STAGE_META,
    type SellerOrder,
    birr,
    countdownParts,
    orderTotal,
} from "@/Data/sellerOrderFlow";
import { Head, Link } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Seller "My Orders".
 *
 * Layout preview over the shared sample data in `@/Data/sellerOrderFlow`.
 * Unpaid orders carry the pay actions and a live countdown; paid ones open
 * straight into pick & pack. Nothing here calls the server.
 */

const TABS: Array<{ id: string; label: string; stage: OrderStage | null }> = [
    { id: "all", label: "View all", stage: null },
    { id: "to_pay", label: "To pay", stage: "to_pay" },
    { id: "paid", label: "Paid", stage: "paid" },
    { id: "packing", label: "Pick & pack", stage: "packing" },
    { id: "to_deliver", label: "To deliver", stage: "to_deliver" },
    { id: "delivered", label: "Delivered", stage: "delivered" },
    { id: "canceled", label: "Canceled", stage: "canceled" },
];

/** Read `?tab=` so the More hub's pipeline tiles deep-link into a stage. */
function initialTab(): string {
    if (typeof window === "undefined") return "all";

    const requested = new URLSearchParams(window.location.search).get("tab");

    return TABS.some((tab) => tab.id === requested) ? (requested as string) : "all";
}

/** One shared ticking clock, so a list of cards does not spawn N timers. */
function useTicker(active: boolean): number {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!active) return undefined;

        const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    return tick;
}

export default function OrdersIndex(): React.ReactElement {
    const [orders, setOrders] = useState<SellerOrder[]>(SAMPLE_ORDERS);
    const [tab, setTab] = useState<string>(initialTab);
    const [search, setSearch] = useState("");
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [sortNewest, setSortNewest] = useState(true);

    const hasCountdown = orders.some((order) => order.stage === "to_pay" && order.expiresInMinutes);
    const tick = useTicker(hasCountdown);

    const counts = useMemo<Record<string, number>>(() => {
        const byStage = orders.reduce<Record<string, number>>((acc, order) => {
            acc[order.stage] = (acc[order.stage] ?? 0) + 1;
            return acc;
        }, {});

        return { ...byStage, all: orders.length };
    }, [orders]);

    const visible = useMemo(() => {
        const stage = TABS.find((entry) => entry.id === tab)?.stage ?? null;
        const needle = search.trim().toLowerCase();

        const rows = orders.filter((order) => {
            if (stage && order.stage !== stage) return false;
            if (!needle) return true;

            return (
                order.reference.toLowerCase().includes(needle) ||
                order.customer.toLowerCase().includes(needle) ||
                order.lines.some((line) => line.name.toLowerCase().includes(needle))
            );
        });

        // Sample rows are listed newest-first; the filter button flips that.
        return sortNewest ? rows : [...rows].reverse();
    }, [orders, tab, search, sortNewest]);

    const tabs: TabSpec[] = TABS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        count: counts[entry.id] ?? 0,
    }));

    const leaveSelectMode = () => {
        setSelectMode(false);
        setSelected([]);
    };

    const removeSelected = () => {
        setOrders((current) => current.filter((order) => !selected.includes(order.id)));
        leaveSelectMode();
    };

    return (
        <>
            <Head title="My Orders">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen bg-[#f5f5f5] pb-[150px]">
                <ListTopBar
                    fallbackRoute="seller.menu.index"
                    search={search}
                    onSearch={setSearch}
                    searchPlaceholder="Order ID, customer, product…"
                    tabs={tabs}
                    activeTab={tab}
                    onTab={(id) => {
                        setTab(id);
                        leaveSelectMode();
                    }}
                    onFilter={() => setSortNewest((current) => !current)}
                    filterActive={!sortNewest}
                    onDelete={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}
                    deleteActive={selectMode}
                />

                <p className="px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Sample data · layout preview
                    {!sortNewest ? " · oldest first" : ""}
                </p>

                <main className="space-y-3 p-2.5">
                    {visible.map((order) => {
                        const meta = STAGE_META[order.stage];
                        const checked = selected.includes(order.id);
                        const total = orderTotal(order);
                        const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);

                        // Countdown burns down from the sample budget as the
                        // shared ticker advances.
                        const remaining =
                            order.stage === "to_pay" && order.expiresInMinutes
                                ? Math.max(0, order.expiresInMinutes * 60 - tick)
                                : null;

                        return (
                            <div
                                key={order.id}
                                onClick={() =>
                                    selectMode
                                        ? setSelected((current) =>
                                              current.includes(order.id)
                                                  ? current.filter((id) => id !== order.id)
                                                  : [...current, order.id],
                                          )
                                        : undefined
                                }
                                className={`space-y-3 rounded-[12px] border bg-white p-3.5 shadow-sm ${
                                    checked ? "border-[#c2410c]" : "border-transparent"
                                } ${selectMode ? "cursor-pointer" : ""}`}
                            >
                                {/* Stage + date */}
                                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                                    <div className="flex items-center space-x-2">
                                        {selectMode ? (
                                            <span
                                                aria-hidden="true"
                                                className={`flex h-[18px] w-[18px] items-center justify-center rounded-[999px] border ${
                                                    checked
                                                        ? "border-[#c2410c] text-white"
                                                        : "border-gray-400 bg-white"
                                                }`}
                                                style={checked ? { backgroundColor: BRAND } : undefined}
                                            >
                                                {checked ? (
                                                    <span className="material-symbols-outlined text-[12px]">
                                                        check
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : (
                                            <span
                                                className={`rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}
                                            >
                                                {meta.label}
                                            </span>
                                        )}
                                        <span className="text-[14px] font-bold text-black">
                                            {order.customer}
                                        </span>
                                    </div>
                                    <span className="shrink-0 font-mono text-xs tracking-tight text-gray-400">
                                        {order.placed}
                                    </span>
                                </div>

                                {/* Reference */}
                                <div className="flex items-center space-x-1">
                                    <h2 className="font-mono text-[12px] font-bold text-[#111]">
                                        {order.reference}
                                    </h2>
                                    <span className="material-symbols-outlined text-[15px] text-gray-500">
                                        chevron_right
                                    </span>
                                </div>

                                {/* Lines */}
                                <div className="space-y-2.5">
                                    {order.lines.map((line) => (
                                        <div key={line.id} className="flex gap-3">
                                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-gray-100 bg-gray-100">
                                                <span className="material-symbols-outlined text-[26px] text-gray-400">
                                                    inventory_2
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="line-clamp-1 text-[13px] font-normal leading-tight text-gray-800">
                                                    {line.name}
                                                </h3>
                                                <p className="mt-1 line-clamp-1 text-xs text-gray-400">
                                                    {line.variant} · {line.supplier}
                                                </p>
                                                <div className="mt-2.5 flex items-baseline justify-between">
                                                    <span className="text-[15px] font-bold text-gray-900">
                                                        {birr(line.unitPrice)}
                                                    </span>
                                                    <span className="text-xs font-medium text-gray-500">
                                                        ×{line.quantity}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Total */}
                                <div className="pt-2 text-right">
                                    <span className="text-[13px] font-medium text-gray-800">
                                        Total for {units} item{units === 1 ? "" : "s"}:{" "}
                                    </span>
                                    <span className="text-[15px] font-extrabold text-black">
                                        {birr(total)}
                                    </span>
                                </div>

                                {/* Stage actions */}
                                {!selectMode ? (
                                    <div className="flex flex-col items-end space-y-1.5 pt-1">
                                        {order.stage === "to_pay" ? (
                                            <>
                                                <div className="flex items-center space-x-2">
                                                    <button
                                                        type="button"
                                                        className="rounded-[999px] border border-gray-800 bg-white px-4 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50 active:scale-95"
                                                    >
                                                        Edit address
                                                    </button>
                                                    <Link
                                                        href={route("seller.orders.pay", {
                                                            reference: order.reference,
                                                        })}
                                                        className="rounded-[999px] px-5 py-1.5 text-xs font-semibold text-white shadow-sm active:scale-95"
                                                        style={{ backgroundColor: BRAND }}
                                                    >
                                                        Pay now
                                                    </Link>
                                                </div>
                                                {remaining != null ? (
                                                    <div
                                                        className="flex items-center space-x-1 pr-1 text-[11px] font-medium"
                                                        style={{ color: BRAND }}
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            schedule
                                                        </span>
                                                        <span className="font-mono">
                                                            {countdownParts(remaining)}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : null}

                                        {order.stage === "paid" ? (
                                            <Link
                                                href={route("seller.orders.pickpack", {
                                                    reference: order.reference,
                                                })}
                                                className="rounded-[999px] px-5 py-1.5 text-xs font-semibold text-white shadow-sm active:scale-95"
                                                style={{ backgroundColor: BRAND }}
                                            >
                                                Start pick &amp; pack
                                            </Link>
                                        ) : null}

                                        {order.stage === "packing" ? (
                                            <Link
                                                href={route("seller.orders.pickpack", {
                                                    reference: order.reference,
                                                })}
                                                className="rounded-[999px] border border-gray-800 bg-white px-4 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50 active:scale-95"
                                            >
                                                Resume pick &amp; pack
                                            </Link>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}

                    {visible.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-[#FDF0ED]">
                                <span className="material-symbols-outlined text-[40px]" style={{ color: BRAND }}>
                                    receipt_long
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold" style={{ color: INK }}>
                                {search ? "No matching orders" : "No orders in this tab"}
                            </p>
                            <p className="mt-1 text-[12px] text-slate-500">
                                {search
                                    ? "Try a different order ID, customer or product."
                                    : "Orders at this stage will show up here."}
                            </p>
                            {search ? (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-white active:scale-95"
                                    style={{ backgroundColor: BRAND }}
                                >
                                    Clear search
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </main>
            </div>

            {/* Selection action bar, above the bottom nav. */}
            {selectMode ? (
                <div
                    className="fixed inset-x-0 z-40 mx-auto max-w-[480px] px-4"
                    style={{ bottom: ABOVE_NAV }}
                >
                    <div className="flex items-center justify-between rounded-[999px] border border-slate-200 bg-white px-4 py-2.5 shadow-lg">
                        <span className="text-[12px] font-semibold text-slate-600">
                            {selected.length} selected
                        </span>
                        <button
                            type="button"
                            onClick={removeSelected}
                            disabled={selected.length === 0}
                            className="rounded-[999px] bg-rose-600 px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    );
}

OrdersIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
