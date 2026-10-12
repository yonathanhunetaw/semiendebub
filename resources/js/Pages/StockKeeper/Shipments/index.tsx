import React, { useState } from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head, Link, router, usePoll } from "@inertiajs/react";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import { EmptyState } from "@/Components/Shared/ui";
import { SkChips, SkHeader, SkStats, fmt } from "@/Components/StockKeeper/skKit";
import type { ScheduledTransfer } from "@/types/shipments";

type Direction = "all" | "inbound" | "outbound";
type Filter = "all" | "to_agree" | "scheduled" | "picking" | "on_road" | "arrived" | "overdue";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
    direction: Direction;
    /** Null for a keeper covering every dock — the filter means nothing to them. */
    store_id: number | null;
}

const isPicking = (t: ScheduledTransfer) => t.workflow_status === "picking" || t.workflow_status === "ready";

/**
 * Which bucket a run belongs to. The board's legacy status reads a run being
 * picked as "pending", so the real workflow status decides those.
 */
function bucket(t: ScheduledTransfer): Exclude<Filter, "all"> {
    if (t.status === "overdue") return "overdue";
    if (isPicking(t)) return "picking";
    if (t.status === "pending") return "to_agree";
    if (t.status === "scheduled") return "scheduled";
    if (t.status === "dispatched" || t.status === "en_route") return t.workflow_status === "delivered" ? "arrived" : "on_road";
    return "arrived";
}

/**
 * Shipments: hub runs of many items between a Main Hub and a store or Remote
 * Hub. Agree a window with the other three parties, pick and prepare the load
 * at the origin, count it in at the destination. Not to be confused with a
 * transfer (one item, locally) or a delivery (a customer order).
 */
export default function StockKeeperShipmentsIndex({ scheduled_transfers = [], direction = "all", store_id = null }: Props) {
    const [filter, setFilter] = useState<Filter>("all");
    const transfers = scheduled_transfers;

    // Live: the other parties' agreements and the picking progress show up without a reload.
    usePoll(30_000, { only: ["scheduled_transfers"] });

    const setDirection = (next: Direction) =>
        router.get(route("stock_keeper.shipments.index"), next === "all" ? {} : { direction: next }, { preserveState: true, preserveScroll: true, replace: true });

    const count = (f: Filter) => (f === "all" ? transfers.length : transfers.filter((t) => bucket(t) === f).length);
    const shown = filter === "all" ? transfers : transfers.filter((t) => bucket(t) === filter);

    return (
        <>
            <Head title="Shipments" />

            <SkHeader
                title="Shipments"
                subtitle="Hub runs of many items: agree a window, pick and prepare the load, count it in when it arrives."
                actions={
                    store_id === null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[999px] border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-[13px] font-bold text-on-surface-variant">
                            <span className="material-symbols-outlined text-[18px]">hub</span>
                            All docks
                        </span>
                    ) : (
                        <div role="group" aria-label="Direction" className="inline-flex rounded-[999px] border border-outline-variant bg-surface-container-lowest p-1">
                            {(
                                [
                                    ["all", "All"],
                                    ["inbound", "Coming in"],
                                    ["outbound", "Going out"],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setDirection(value)}
                                    aria-pressed={direction === value}
                                    className={`rounded-[999px] px-3.5 py-1.5 text-[13px] font-bold ${direction === value ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )
                }
            />

            <SkStats
                items={[
                    { label: "To agree", value: fmt(count("to_agree")), icon: "handshake", tone: count("to_agree") > 0 ? "warning" : undefined },
                    { label: "Being picked", value: fmt(count("picking")), icon: "inventory" },
                    { label: "On the road", value: fmt(count("on_road")), icon: "route" },
                    { label: "Overdue", value: fmt(count("overdue")), icon: "schedule", tone: count("overdue") > 0 ? "error" : undefined },
                ]}
            />

            <div className="mb-3">
                <SkChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: "all", label: "All", count: count("all") },
                        { value: "to_agree", label: "To agree", count: count("to_agree") },
                        { value: "scheduled", label: "Scheduled", count: count("scheduled") },
                        { value: "picking", label: "Being picked", count: count("picking") },
                        { value: "on_road", label: "On the road", count: count("on_road") },
                        { value: "arrived", label: "Arrived", count: count("arrived") },
                        { value: "overdue", label: "Overdue", count: count("overdue") },
                    ]}
                />
            </div>

            {shown.length === 0 ? (
                <EmptyState
                    icon="local_shipping"
                    title="No shipments here"
                    description={direction === "all" ? "Nothing is moving through your docks right now." : "Change the filter, or switch to All to see both directions."}
                    framed
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((t) => (
                        <TransferCard key={t.id} t={t} showRoute="stock_keeper.shipments.show" agreeRoute="stock_keeper.shipments.agree" transitionRoute="stock_keeper.shipments.transition" />
                    ))}
                </div>
            )}

            <p className="mt-4 text-center text-[12px] text-on-surface-variant">
                One item between two places is a{" "}
                <Link href={route("stock_keeper.transfers.index")} className="font-bold text-primary hover:underline">
                    transfer
                </Link>
                ; a short or damaged arrival is settled under{" "}
                <Link href={route("stock_keeper.receiving.index")} className="font-bold text-primary hover:underline">
                    Receiving
                </Link>
                .
            </p>
        </>
    );
}

StockKeeperShipmentsIndex.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
