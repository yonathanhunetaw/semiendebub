import React, { useState } from "react";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import { Head, router } from "@inertiajs/react";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
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

            {/* ── Top Context Strip: Back button, centered Shipments, and pool toggle ── */}
            <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <button
                    onClick={() => {
                        if (window.history.length > 1) {
                            window.history.back();
                        } else {
                            router.visit(route("delivery.dashboard"));
                        }
                    }}
                    className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center active:scale-95 transition-all text-slate-600"
                    aria-label="Back"
                >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </button>

                <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Shipments</h1>
                </div>

                <div className="flex items-center gap-0.5 bg-slate-50 p-0.5 rounded-full border border-slate-200/80">
                    {([
                        { id: "all" as Tab, label: "ALL" },
                        { id: "available" as Tab, label: `POOL (${available_count})` },
                        { id: "mine" as Tab, label: "MINE" },
                    ]).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide transition-colors ${
                                tab === t.id ? "bg-[#c2410c] text-white" : "text-slate-500 hover:text-[#c2410c]"
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-3.5 pt-3 pb-36 space-y-3">

                {/* ── Status Filter Chips ── */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                        { id: "all",        label: "All" },
                        { id: "dispatched", label: "To Collect" },
                        { id: "en_route",   label: "En Route" },
                        { id: "shipped",    label: "Shipped" },
                        { id: "scheduled",  label: "Scheduled" },
                        { id: "overdue",    label: "Overdue" },
                    ].map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 transition-colors border ${
                                filter === f.id
                                    ? "bg-[#c2410c] text-white border-[#c2410c]"
                                    : "bg-white text-slate-600 border-slate-200"
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
                        <div className="py-8 text-center bg-white rounded-2xl border border-slate-100">
                            <span className="material-symbols-outlined text-slate-300 text-[36px] mb-2">inbox</span>
                            <p className="text-[13px] font-bold text-gray-900">No shipments found</p>
                            <p className="text-[11px] text-slate-400 mt-1">
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
