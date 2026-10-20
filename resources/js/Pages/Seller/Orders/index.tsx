import ListTopBar, { type TabSpec } from "@/Components/Seller/ListTopBar";
import PickPackPanel from "@/Components/Seller/Orders/PickPackPanel";
import type { PickPackPlan } from "@/types/sourcing";
import SellerLayout from "@/Layouts/SellerLayout";
import {
    type OrderStage,
    STAGE_META,
    type SellerOrder,
    birr,
    countdownParts,
    orderTotal,
} from "@/Data/sellerOrderFlow";
import { Head, Link, router } from "@inertiajs/react";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Seller "My Orders".
 *
 * Real sales, shaped by SellerOrderBoard into the card format the sample data
 * in `@/Data/sellerOrderFlow` defined. Unpaid orders carry the pay actions.
 * Pick & pack happens here too: a paid order's card opens its pick panel in
 * place (PickPackPanel), so there is no separate pick screen; the old
 * /orders/{ref}/pick-pack link opens this board with that card open.
 */

interface Props {
    orders?: SellerOrder[];
    /** The list is capped at the newest N orders. */
    limit?: number;
    /** Pick plans for every order in Pick & pack, keyed by sale id. */
    plans?: Record<number, PickPackPlan>;
    /** A reference whose pick panel opens on arrival. */
    open?: string | null;
}

const TABS: Array<{ id: string; label: string; stage: OrderStage | null }> = [
    { id: "all", label: "View all", stage: null },
    { id: "to_pay", label: "To pay", stage: "to_pay" },
    { id: "paid", label: "Paid", stage: "paid" },
    { id: "packing", label: "Pick & pack", stage: "packing" },
    { id: "to_deliver", label: "To deliver", stage: "to_deliver" },
    { id: "delivered", label: "Delivered", stage: "delivered" },
    { id: "canceled", label: "Canceled", stage: "canceled" },
];

/**
 * Read `?tab=` so the More hub's pipeline tiles deep-link into a stage; an
 * order opened by reference lands on its own stage's tab.
 */
function initialTab(orders: SellerOrder[], open: string | null): string {
    const opened = open ? orders.find((order) => order.reference === open) : undefined;
    if (opened) return TABS.find((tab) => tab.stage === opened.stage)?.id ?? "all";
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

export default function OrdersIndex({ orders: loaded = [], limit = 0, plans = {}, open = null }: Props): React.ReactElement {
    /* Hiding is a view filter only; it never deletes an order. */
    const [hidden, setHidden] = useState<number[]>([]);
    const orders = useMemo(
        () => loaded.filter((order) => !hidden.includes(order.id)),
        [loaded, hidden],
    );
    const [tab, setTab] = useState<string>(() => initialTab(loaded, open));
    /** Orders whose pick panel is open. */
    const [picking, setPicking] = useState<number[]>(() => {
        const opened = open ? loaded.find((order) => order.reference === open) : undefined;
        return opened ? [opened.id] : [];
    });
    const togglePick = (id: number) => setPicking((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    const openPick = (order: SellerOrder) => {
        setPicking((current) => (current.includes(order.id) ? current : [...current, order.id]));
        setTab(TABS.find((entry) => entry.stage === order.stage)?.id ?? "all");
        window.setTimeout(() => document.getElementById(`order-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };

    // An order opened by reference (or the next one after a hand-over).
    useEffect(() => {
        const opened = open ? loaded.find((order) => order.reference === open) : undefined;
        if (opened) openPick(opened);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
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

        // The server lists newest first; the filter button flips that.
        return sortNewest ? rows : [...rows].reverse();
    }, [orders, tab, search, sortNewest]);

    // Paid orders not yet handed to delivery, oldest first: the pick queue.
    const toPick = useMemo(
        () => [...orders].filter((order) => order.stage === "paid" || order.stage === "packing").reverse(),
        [orders],
    );

    const tabs: TabSpec[] = TABS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        count: counts[entry.id] ?? 0,
    }));

    const leaveSelectMode = () => {
        setSelectMode(false);
        setSelected([]);
    };

    const hideSelected = () => {
        setHidden((current) => [...current, ...selected]);
        leaveSelectMode();
    };

    return (
        <>
            <Head title="My Orders" />

            <div className="min-h-screen bg-surface-container pb-[150px]">
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

                {/* Paid orders waiting on the shelf: the most important thing on this board. */}
                {toPick.length > 0 ? (
                    <section className="mx-2.5 mt-2.5 flex items-center gap-3 rounded-[16px] bg-primary p-3.5 text-on-primary shadow-md">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[999px] bg-on-primary/15">
                            <span className="material-symbols-outlined text-[24px]">package_2</span>
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-extrabold leading-tight">
                                {toPick.length} order{toPick.length === 1 ? "" : "s"} ready to pick
                            </p>
                            <p className="truncate text-[11px] opacity-85">
                                Paid and confirmed · oldest {toPick[0].reference} for {toPick[0].customer}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openPick(toPick[0])}
                            className="shrink-0 rounded-[999px] bg-on-primary px-4 py-2 text-xs font-extrabold text-primary active:scale-95"
                        >
                            Start
                        </button>
                    </section>
                ) : null}

                {limit > 0 && loaded.length >= limit ? (
                    <p className="px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-outline">
                        Newest {limit} orders{!sortNewest ? " · oldest first" : ""}
                    </p>
                ) : !sortNewest ? (
                    <p className="px-4 pt-3 text-[10px] font-medium uppercase tracking-wide text-outline">
                        Oldest first
                    </p>
                ) : null}

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
                                id={`order-${order.id}`}
                                onClick={() =>
                                    selectMode
                                        ? setSelected((current) =>
                                              current.includes(order.id)
                                                  ? current.filter((id) => id !== order.id)
                                                  : [...current, order.id],
                                          )
                                        : undefined
                                }
                                className={`space-y-3 rounded-[12px] border bg-surface-container-lowest p-3.5 shadow-sm ${
                                    checked ? "border-primary" : "border-transparent"
                                } ${selectMode ? "cursor-pointer" : ""}`}
                            >
                                {/* Stage + date */}
                                <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                                    <div className="flex items-center space-x-2">
                                        {selectMode ? (
                                            <span
                                                aria-hidden="true"
                                                className={`flex h-[18px] w-[18px] items-center justify-center rounded-[999px] border ${
                                                    checked
                                                        ? "border-primary text-on-primary"
                                                        : "border-outline bg-surface-container-lowest"
                                                } ${checked ? "bg-primary" : ""}`}
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
                                        <span className="text-[14px] font-bold text-on-surface">
                                            {order.customer}
                                        </span>
                                    </div>
                                    <span className="shrink-0 font-mono text-xs tracking-tight text-outline">
                                        {order.placed}
                                    </span>
                                </div>

                                {/* Reference — opens the order's custody log */}
                                <Link
                                    href={route("seller.orders.custody", { reference: order.reference })}
                                    className="flex items-center space-x-1"
                                >
                                    <h2 className="font-mono text-[12px] font-bold text-on-surface">
                                        {order.reference}
                                    </h2>
                                    <span className="material-symbols-outlined text-[15px] text-on-surface-variant">
                                        chevron_right
                                    </span>
                                </Link>

                                {/* Lines. Picking them happens in the pick panel below. */}
                                <div className="space-y-2.5">
                                    {order.lines.map((line) => (
                                        <div key={line.id} className="flex items-center gap-3">
                                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[10px] border border-outline-variant/60 bg-surface-container">
                                                <span className="material-symbols-outlined text-[26px] text-outline">
                                                    inventory_2
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="line-clamp-1 text-[13px] font-normal leading-tight text-on-surface">
                                                    {line.name}
                                                </h3>
                                                <p className="mt-1 line-clamp-1 text-xs text-outline">
                                                    {line.variant} · {line.supplier}
                                                </p>
                                                <div className="mt-2.5 flex items-baseline justify-between">
                                                    <span className="text-[15px] font-bold text-on-surface">
                                                        {birr(line.unitPrice)}
                                                    </span>
                                                    <span className="text-xs font-medium text-on-surface-variant">
                                                        ×{line.quantity}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Total */}
                                <div className="pt-2 text-right">
                                    <span className="text-[13px] font-medium text-on-surface">
                                        Total for {units} item{units === 1 ? "" : "s"}:{" "}
                                    </span>
                                    <span className="text-[15px] font-extrabold text-on-surface">
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
                                                        onClick={() => {
                                                            const next = window.prompt(
                                                                "Delivery address",
                                                                order.destination.address,
                                                            );
                                                            if (next !== null && next.trim() !== "") {
                                                                router.patch(
                                                                    route("seller.orders.address", { reference: order.reference }),
                                                                    { delivery_address: next.trim() },
                                                                    { preserveScroll: true },
                                                                );
                                                            }
                                                        }}
                                                        className="rounded-[999px] border border-on-surface bg-surface-container-lowest px-4 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low active:scale-95"
                                                    >
                                                        Edit address
                                                    </button>
                                                    <Link
                                                        href={route("seller.orders.pay", {
                                                            reference: order.reference,
                                                        })}
                                                        className="rounded-[999px] px-5 py-1.5 text-xs font-semibold text-on-primary shadow-sm active:scale-95 bg-primary"
                                                    >
                                                        Pay now
                                                    </Link>
                                                </div>
                                                {remaining != null ? (
                                                    <div
                                                        className="flex items-center space-x-1 pr-1 text-[11px] font-medium text-primary"
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

                                        {(order.stage === "paid" || order.stage === "packing") && order.paid === false ? (
                                            <Link
                                                href={route("seller.orders.pay", { reference: order.reference })}
                                                className="mr-auto flex items-center gap-1 rounded-[8px] border border-warning/40 bg-warning-container/60 px-2 py-1 text-[11px] font-semibold text-on-warning-container"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">payments</span>
                                                Payment changed · confirm it before delivery
                                            </Link>
                                        ) : null}

                                        {(order.stage === "paid" || order.stage === "packing") && order.sourced ? (
                                            <span className="mr-auto flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
                                                <span className="material-symbols-outlined text-[15px] text-outline">back_hand</span>
                                                {order.picking?.ticked ?? 0}/{order.sourced.total} in hand
                                                {order.picking?.packed ? " · packed" : ""}
                                                {order.delayAgreed ? (
                                                    <span className="ml-1 rounded-[999px] border border-warning/30 bg-warning-container/60 px-2 py-0.5 text-[9px] font-bold uppercase text-on-warning-container">
                                                        Delay agreed
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : null}

                                        {order.stage === "paid" || order.stage === "packing" ? (
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={route("seller.orders.pay", { reference: order.reference })}
                                                    className="rounded-[999px] border border-outline/50 px-3 py-1.5 text-xs font-semibold text-on-surface"
                                                >
                                                    Payment
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // Opening a paid order's panel the first time starts picking.
                                                        if (order.stage === "paid" && !picking.includes(order.id)) {
                                                            router.post(route("seller.orders.picking.start", order.id), {}, { preserveScroll: true, preserveState: true });
                                                            // It moves to Pick & pack: follow it there.
                                                            if (tab === "paid") setTab("packing");
                                                        }
                                                        togglePick(order.id);
                                                    }}
                                                    aria-expanded={picking.includes(order.id)}
                                                    className={`flex items-center gap-1 rounded-[999px] px-5 py-1.5 text-xs font-semibold shadow-sm active:scale-95 ${
                                                        picking.includes(order.id) ? "border border-primary bg-surface-container-lowest text-primary" : "bg-primary text-on-primary"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">{picking.includes(order.id) ? "expand_less" : "package_2"}</span>
                                                    {picking.includes(order.id) ? "Hide pick & pack" : order.stage === "paid" ? "Start pick & pack" : "Resume pick & pack"}
                                                </button>
                                            </div>
                                        ) : null}

                                        {["to_deliver", "delivered", "canceled"].includes(order.stage) ? (
                                            <Link
                                                href={route("seller.orders.custody", { reference: order.reference })}
                                                className="flex items-center gap-1 rounded-[999px] border border-on-surface bg-surface-container-lowest px-4 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low active:scale-95"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">
                                                    {order.stage === "to_deliver" ? "local_shipping" : "receipt_long"}
                                                </span>
                                                {order.stage === "to_deliver" ? "Track delivery" : "Custody log"}
                                            </Link>
                                        ) : null}

                                    </div>
                                ) : null}

                                {/* Pick & pack, in place. */}
                                {!selectMode && picking.includes(order.id) && (order.stage === "paid" || order.stage === "packing") ? (
                                    plans[order.id] ? (
                                        <PickPackPanel key={order.id} plan={plans[order.id]} />
                                    ) : (
                                        <p className="rounded-[10px] bg-surface-container-low px-3 py-2 text-[11px] text-on-surface-variant">
                                            This order isn't waiting in Pick &amp; pack any more. Pull down to refresh.
                                        </p>
                                    )
                                ) : null}
                            </div>
                        );
                    })}

                    {visible.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-primary-container">
                                <span className="material-symbols-outlined text-[40px] text-primary">
                                    receipt_long
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-on-surface">
                                {search ? "No matching orders" : "No orders in this tab"}
                            </p>
                            <p className="mt-1 text-[12px] text-on-surface-variant">
                                {search
                                    ? "Try a different order ID, customer or product."
                                    : "Orders at this stage will show up here."}
                            </p>
                            {search ? (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-on-primary active:scale-95 bg-primary"
                                >
                                    Clear search
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </main>
            </div>

            {/* Selection action bar, above the bottom nav (or the edge while it hides). */}
            {selectMode ? (
                <div className="dock-float fixed inset-x-0 z-40 mx-auto max-w-[480px] px-4">
                    <div className="flex items-center justify-between rounded-[999px] border border-outline-variant bg-surface-container-lowest px-4 py-2.5 shadow-lg">
                        <span className="text-[12px] font-semibold text-on-surface-variant">
                            {selected.length} selected
                        </span>
                        <button
                            type="button"
                            onClick={hideSelected}
                            disabled={selected.length === 0}
                            className="rounded-[999px] bg-error px-4 py-1.5 text-[12px] font-bold text-on-error disabled:opacity-40"
                        >
                            Hide
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    );
}

OrdersIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
