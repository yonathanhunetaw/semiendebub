import { Head, router } from "@inertiajs/react";
import TimeFilterChips from "@/Components/Shared/time/TimeFilterChips";
import type { TimeFilterView } from "@/types/time";
import React, { useState } from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkChips, SkHeader, SkPager, SkStats, fmt, inputClass, plural } from "@/Components/StockKeeper/skKit";
import type { Pagination, SharedProps } from "@/types/stockkeeper";

/** One place a line can be picked from (OrderSourcingService::pickPackPlan). */
interface SourceOption {
    location_type: string;
    location_id: number;
    kind: string;
    level_label: string;
    name: string;
    on_hand: number;
    sufficient: boolean;
}

interface PickLine {
    id: number;
    title: string;
    variant_label: string;
    sku: string | null;
    quantity: number;
    picked_quantity: number;
    suggested_source: { location_type: string; location_id: number } | null;
    confirmed_source: { location_type: string; location_id: number } | null;
    options: SourceOption[];
    /** In the picker's hand; saved so the seller and the courier see it. */
    ticked_at?: string | null;
}

interface PickOrder {
    sale: {
        id: number;
        reference: string;
        customer: string | null;
        store_name: string | null;
        stage_label: string;
        delay_agreed: boolean;
        /** Every payment part confirmed: it may not leave before. */
        paid?: boolean;
        picking_started_at?: string | null;
        picking_started_by?: string | null;
        packed_at?: string | null;
    };
    lines: PickLine[];
    delivery: {
        status?: string;
        method: "courier" | "vehicle" | "store";
        courier: string | null;
        address: string | null;
        plate: string | null;
        driver_phone: string | null;
    } | null;
}

interface OrdersProps extends SharedProps {
    orders?: PickOrder[];
    tab?: "to_pick" | "with_delivery";
    counts?: { to_pick: number; with_delivery: number };
    /** When each order was placed (Today = the store's business day). */
    time?: TimeFilterView;
    pagination: Pagination;
}

type Tab = "to_pick" | "with_delivery";

/** Saved without reloading the list, so the chosen places stay. */
const save = (url: string, done?: boolean): void => router.post(url, done === undefined ? {} : { done }, { preserveScroll: true, preserveState: true });

const key = (source: { location_type: string; location_id: number } | null): string => (source ? `${source.location_type}#${source.location_id}` : "");

/**
 * Pick & pack: customer orders to pick from the shelf, the store floor or the
 * Remote Hub, then hand to Delivery. Each line names where it comes from, with
 * what each place holds and the nearest that covers it preselected. Start
 * picking, tick each line in hand, mark the parcel packed, hand it over. An
 * order whose payment is not all confirmed cannot be handed over.
 */
export default function Orders({ orders = [], tab = "to_pick", counts = { to_pick: 0, with_delivery: 0 }, time, pagination }: OrdersProps): React.ReactElement {
    const pickable = orders.filter((o) => o.lines.every((l) => l.options.some((opt) => opt.sufficient))).length;

    const go = (next: { tab?: Tab; page?: number }) => {
        const t = next.tab ?? tab;
        router.get(route("stock_keeper.orders.index"), { ...(t !== "to_pick" ? { tab: t } : {}), ...(next.page ? { page: next.page } : {}) }, { preserveState: true, preserveScroll: true, replace: true });
    };

    return (
        <>
            <Head title="Orders" />

            <SkHeader title="Orders · Pick & pack" subtitle="Customer orders to pick from the shelf, the store floor or the Remote Hub, then hand to Delivery." />

            <SkStats
                items={[
                    { label: "To pick", value: fmt(counts.to_pick), icon: "package_2" },
                    { label: "Fully pickable", value: tab === "to_pick" ? fmt(pickable) : "—", icon: "check_circle", tone: tab === "to_pick" && pickable > 0 ? "success" : undefined },
                    { label: "Short somewhere", value: tab === "to_pick" ? fmt(orders.length - pickable) : "—", icon: "error", tone: tab === "to_pick" && orders.length - pickable > 0 ? "error" : undefined },
                    { label: "With Delivery", value: fmt(counts.with_delivery), icon: "local_shipping" },
                ]}
            />

            <div className="mb-3">
                <SkChips<Tab>
                    value={tab}
                    onChange={(t) => go({ tab: t, page: 1 })}
                    options={[
                        { value: "to_pick", label: "To pick", count: counts.to_pick },
                        { value: "with_delivery", label: "With Delivery", count: counts.with_delivery },
                    ]}
                />
                {time ? (
                    <div className="mt-2">
                        <TimeFilterChips filter={time} />
                    </div>
                ) : null}
            </div>

            {orders.length === 0 ? (
                <EmptyState
                    icon="package_2"
                    title={tab === "to_pick" ? "Nothing to pick" : "Nothing with Delivery"}
                    description={tab === "to_pick" ? "Paid orders appear here until they are picked." : "Picked orders appear here until delivered."}
                    framed
                />
            ) : (
                <div className={`grid grid-cols-1 gap-3 ${tab === "with_delivery" ? "lg:grid-cols-2" : "xl:grid-cols-2"}`}>
                    {orders.map((order) => (
                        <OrderCard key={order.sale.id} order={order} editable={tab === "to_pick"} />
                    ))}
                </div>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="orders" onPage={(page) => go({ page })} />
        </>
    );
}

function OrderCard({ order, editable }: { order: PickOrder; editable: boolean }) {
    const [open, setOpen] = useState(editable);
    const [choices, setChoices] = useState<Record<number, string>>(() => Object.fromEntries(order.lines.map((line) => [line.id, key(line.confirmed_source ?? line.suggested_source)])));
    const [busy, setBusy] = useState(false);
    const [ticked, setTicked] = useState<Record<number, boolean>>(() => Object.fromEntries(order.lines.map((line) => [line.id, Boolean(line.ticked_at)])));
    const [packed, setPacked] = useState(Boolean(order.sale.packed_at));
    const [started, setStarted] = useState(Boolean(order.sale.picking_started_at));

    const short = order.lines.filter((line) => !line.options.some((o) => o.sufficient)).length;
    const inHand = order.lines.filter((line) => ticked[line.id]).length;
    const allInHand = inHand === order.lines.length;
    const paid = order.sale.paid !== false;
    const ready = order.lines.every((line) => choices[line.id]) && allInHand && packed && paid;

    const tick = (lineId: number, done: boolean) => {
        setTicked((current) => ({ ...current, [lineId]: done }));
        setPacked(false);
        setStarted(true);
        save(route("stock_keeper.orders.lines.tick", { sale: order.sale.id, item: lineId }), done);
    };

    const confirm = () => {
        setBusy(true);
        router.post(
            route("stock_keeper.orders.pick", order.sale.id),
            {
                lines: order.lines.map((line) => {
                    const [type, id] = choices[line.id].split("#");
                    return { sale_item_id: line.id, location_type: type, location_id: Number(id) };
                }),
            },
            { preserveScroll: true, onFinish: () => setBusy(false) },
        );
    };

    const progress = order.lines.length > 0 ? Math.round((inHand / order.lines.length) * 100) : 0;
    const stage = !started ? { label: "Not started", tone: "neutral" as const } : packed ? { label: "Packed", tone: "success" as const } : { label: `Picking · ${inHand}/${order.lines.length}`, tone: "info" as const };

    return (
        <SkCard className="overflow-hidden">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-container-low/60">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[14px] font-extrabold text-on-surface">
                        {order.sale.reference}
                        {order.sale.customer ? <span className="font-sans font-bold"> · {order.sale.customer}</span> : null}
                    </p>
                    <p className="truncate text-[12px] text-on-surface-variant">
                        {order.sale.store_name ?? ""} · {order.lines.length} {plural("line", order.lines.length)}
                        {order.delivery?.address ? ` · to ${order.delivery.address}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {editable && !paid && <StatusPill tone="warning" label="Not fully paid" size="sm" />}
                        {editable && <StatusPill tone={stage.tone} label={stage.label} size="sm" />}
                        {editable ? (
                            <StatusPill tone={short === 0 ? "success" : "error"} label={short === 0 ? "Pickable" : `${short} short`} size="sm" />
                        ) : (
                            <StatusPill tone="warning" label={order.delivery?.courier ? `${order.delivery.status ?? ""} · ${order.delivery.courier}` : "Waiting for a courier"} size="sm" icon="local_shipping" />
                        )}
                    </div>
                    {editable && started && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-[999px] bg-surface-container">
                            <div className={`h-full rounded-[999px] ${packed ? "bg-success" : "bg-primary"}`} style={{ width: `${packed ? 100 : progress}%` }} />
                        </div>
                    )}
                </div>
                <span className="material-symbols-outlined text-[24px] text-on-surface-variant">{open ? "expand_less" : "expand_more"}</span>
            </button>

            {open && (
                <>
                    <ul className="divide-y divide-outline-variant/60 border-t border-outline-variant/70">
                        {order.lines.map((line) => {
                            const chosen = line.options.find((o) => key(o) === choices[line.id]);
                            const inHandNow = Boolean(ticked[line.id]);
                            return (
                                <li key={line.id} className={`flex gap-3 px-4 py-3 ${inHandNow ? "bg-success-container/25" : ""}`}>
                                    {editable && (
                                        <button
                                            type="button"
                                            disabled={!choices[line.id]}
                                            onClick={() => tick(line.id, !inHandNow)}
                                            aria-pressed={inHandNow}
                                            aria-label={`${line.title} in hand`}
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 transition disabled:opacity-40 ${
                                                inHandNow ? "border-success bg-success text-on-success" : "border-outline-variant text-on-surface-variant hover:border-primary"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[24px]">{inHandNow ? "check" : "pan_tool"}</span>
                                        </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[14px] font-bold text-on-surface">{line.title}</p>
                                                <p className="truncate font-mono text-[11px] text-on-surface-variant">
                                                    {line.variant_label} · {line.sku ?? "—"}
                                                </p>
                                            </div>
                                            <p className="shrink-0 text-[18px] font-extrabold tabular-nums text-on-surface">×{fmt(line.quantity)}</p>
                                        </div>
                                        {editable ? (
                                            <select
                                                value={choices[line.id] ?? ""}
                                                onChange={(e) => setChoices((c) => ({ ...c, [line.id]: e.target.value }))}
                                                aria-label={`Pick ${line.title} from`}
                                                className={`${inputClass} mt-2 py-2 text-[14px] ${chosen && !chosen.sufficient ? "border-error" : ""}`}
                                            >
                                                <option value="">Pick from…</option>
                                                {line.options.map((o) => (
                                                    <option key={key(o)} value={key(o)} disabled={o.on_hand <= 0}>
                                                        {o.level_label} · {o.name} — {fmt(o.on_hand)} on hand{o.sufficient ? "" : " (not enough)"}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className="mt-1 text-[13px] text-on-surface-variant">
                                                Picked from <b className="text-on-surface">{line.options.find((o) => key(o) === key(line.confirmed_source))?.name ?? "—"}</b>
                                            </p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {editable && (
                        <div className="flex flex-col gap-3 border-t border-outline-variant/70 bg-surface-container-low/50 p-4 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-0.5 text-[13px]">
                                {order.delivery?.method === "store" ? (
                                    <p className="text-on-surface-variant">
                                        <span className="material-symbols-outlined mr-1 align-[-4px] text-[18px]">storefront</span>
                                        In store · the customer takes it here
                                    </p>
                                ) : order.delivery ? (
                                    <p className="text-on-surface-variant">
                                        <span className="material-symbols-outlined mr-1 align-[-4px] text-[18px]">{order.delivery.method === "vehicle" ? "local_shipping" : "two_wheeler"}</span>
                                        {order.delivery.method === "vehicle"
                                            ? `Vehicle collects · ${order.delivery.plate ?? "plate not set"}${order.delivery.driver_phone ? ` · ${order.delivery.driver_phone}` : ""}`
                                            : `Courier${order.delivery.courier ? ` ${order.delivery.courier}` : ""} · ${order.delivery.address ?? "address not set yet"}`}
                                    </p>
                                ) : (
                                    <p className="font-bold text-warning">No delivery details yet; the seller adds them.</p>
                                )}
                                {order.sale.picking_started_by && <p className="text-on-surface-variant">Started by {order.sale.picking_started_by}</p>}
                                {!paid && <p className="font-bold text-warning">The payment changed and isn't all confirmed: pick it, but it can't leave yet.</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {!started && (
                                    <SkButton
                                        variant="outline"
                                        icon="play_arrow"
                                        onClick={() => {
                                            setStarted(true);
                                            save(route("stock_keeper.orders.picking.start", order.sale.id));
                                        }}
                                    >
                                        Start picking
                                    </SkButton>
                                )}
                                <label className={`flex cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2.5 text-[14px] font-bold ${packed ? "border-success bg-success-container/50 text-on-success-container" : "border-outline-variant text-on-surface"} ${!allInHand ? "cursor-not-allowed opacity-50" : ""}`}>
                                    <input
                                        type="checkbox"
                                        checked={packed}
                                        disabled={!allInHand}
                                        onChange={(e) => {
                                            setPacked(e.target.checked);
                                            save(route("stock_keeper.orders.packed", order.sale.id), e.target.checked);
                                        }}
                                        className="h-5 w-5 rounded-[6px] text-success focus:ring-success"
                                    />
                                    Packed & labelled
                                </label>
                                {order.delivery?.method === "store" ? (
                                    <SkButton icon="storefront" disabled={!ready || busy} onClick={confirm}>
                                        Hand to customer
                                    </SkButton>
                                ) : (
                                    <SkButton icon="local_shipping" disabled={!ready || busy} onClick={confirm}>
                                        Hand to Delivery
                                    </SkButton>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </SkCard>
    );
}

Orders.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
