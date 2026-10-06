import React, { useState } from "react";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import { Head, router } from "@inertiajs/react";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import { DeliveryHero } from "@/Components/Delivery/deliveryUi";
import type { ScheduledTransfer } from "@/types/shipments";

type Tab = "all" | "available" | "mine";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
    tab: Tab;
    available_count: number;
}

/* ----------------------------------------------------------
 | Page Component
 |
 | Mirrors Seller/Shipments/index.tsx: same top context strip,
 | same status filter chips, same TransferCard list. The only
 | role difference is the my-runs/pool toggle in place of the
 | seller's "NEW" button, since a courier claims runs rather
 | than raising them.
 |----------------------------------------------------------*/
export default function DeliveryShipmentsIndex({
    scheduled_transfers = [],
    tab = "all",
    available_count = 0,
}: Props) {
    const [filter, setFilter] = useState("all");
    const transfers = scheduled_transfers;

    /**
     * Which list the courier is on, shown as the state it is in.
     *
     * This was one button cycling all → pool → mine, labelled with the view it
     * would switch *to* — so standing on the full board it read "POOL", and
     * there was no way to tell which of the three lists you were looking at.
     */
    const setTab = (next: Tab) => {
        router.get(
            route("delivery.shipments.index"),
            next === "all" ? {} : { tab: next },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    // Filter logic
    const displayedTransfers = filter === "all"
        ? transfers
        : transfers.filter(t => t.status === filter);

    return (
        <>
            <Head title="Shipments" />

            <DeliveryHero
                eyebrow="Freight"
                title="Shipments"
                subtitle={
                    transfers.length > 0
                        ? `${transfers.length} run${transfers.length === 1 ? "" : "s"} on your board.`
                        : "No freight on your board."
                }
            >
                {/* Which list the courier is on, shown as the state it is in. */}
                <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/15">
                    {([
                        { id: "all" as Tab, label: "All" },
                        { id: "available" as Tab, label: `Pool (${available_count})` },
                        { id: "mine" as Tab, label: "Mine" },
                    ]).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`py-2 rounded-xl text-[12px] font-bold transition-colors ${
                                tab === t.id ? "bg-white text-primary shadow-sm" : "text-white/85 hover:text-white"
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </DeliveryHero>

            <div className="max-w-xl mx-auto px-3.5 pt-4 pb-6 space-y-3">

                {/* ── Status Filter Chips ── */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                        { id: "all",        label: "All" },
                        // Runs still waiting on a driver to accept a window.
                        { id: "pending",    label: "To Agree" },
                        { id: "dispatched", label: "To Collect" },
                        { id: "en_route",   label: "En Route" },
                        { id: "shipped",    label: "Shipped" },
                        { id: "scheduled",  label: "Scheduled" },
                        { id: "overdue",    label: "Overdue" },
                    ].map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 transition-colors border ${
                                filter === f.id
                                    ? "bg-primary text-on-primary border-primary"
                                    : "bg-surface-container-lowest text-on-surface-variant border-outline-variant"
                            }`}>
                            {f.label} ({f.id === "all" ? transfers.length : transfers.filter(t => t.status === f.id).length})
                        </button>
                    ))}
                </div>

                {/* ── Transfer List ── */}
                <div className="space-y-3">
                    {displayedTransfers.map(t => (
                        <TransferCard key={t.id} t={t} showRoute="delivery.shipments.show" agreeRoute="delivery.shipments.agree" transitionRoute="delivery.shipments.transition" />
                    ))}
                    {displayedTransfers.length === 0 && (
                        <div className="py-8 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant">
                            <span className="material-symbols-outlined text-outline/60 text-[36px] mb-2">inbox</span>
                            <p className="text-[13px] font-bold text-on-surface">No shipments found</p>
                            <p className="text-[11px] text-outline mt-1">
                                {tab === "mine"
                                    ? "Nothing assigned to you — claim a run from the pool."
                                    : tab === "available"
                                    ? "Nothing waiting in the pool right now."
                                    : "No freight is moving right now."}
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}

DeliveryShipmentsIndex.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
