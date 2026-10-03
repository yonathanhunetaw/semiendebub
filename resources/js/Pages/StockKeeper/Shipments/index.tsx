import React, { useState } from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head, router } from "@inertiajs/react";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import type { ScheduledTransfer } from "@/types/shipments";

type Direction = "all" | "inbound" | "outbound";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
    direction: Direction;
    /** Null for a keeper covering every dock — the filter means nothing to them. */
    store_id: number | null;
}

/* ----------------------------------------------------------
 | Page Component
 |
 | Mirrors Seller/Shipments/index.tsx: same top context strip,
 | same status filter chips, same TransferCard list. The only
 | role difference is the inbound/outbound toggle in place of
 | the seller's "NEW" button, since the warehouse desk receives
 | and dispatches rather than raises shipments.
 |----------------------------------------------------------*/
export default function StockKeeperShipmentsIndex({
    scheduled_transfers = [],
    direction = "all",
    store_id = null,
}: Props) {
    const [filter, setFilter] = useState("all");
    const transfers = scheduled_transfers;

    /**
     * Three states, not two.
     *
     * The old control flipped between OUT and IN with no way to see both, and
     * opened on OUT — so a replenishment a seller raised into this store, which
     * is inbound here, was invisible until the keeper happened to toggle.
     */
    const setDirection = (next: Direction) => {
        router.get(
            route("stock_keeper.shipments.index"),
            next === "all" ? {} : { direction: next },
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

            {/* ── Top Context Strip: Back button, centered Shipments, and direction toggle ── */}
            <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <button
                    onClick={() => {
                        if (window.history.length > 1) {
                            window.history.back();
                        } else {
                            router.visit(route("stock_keeper.dashboard"));
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

                {/* A keeper with no facility covers every dock, so there is
                    nothing for them to narrow by. */}
                {store_id === null ? (
                    <span className="flex items-center gap-1 bg-slate-50 text-slate-500 px-3 py-1.5 rounded-full border border-slate-200/80">
                        <span className="material-symbols-outlined text-[14px]">hub</span>
                        <span className="font-bold text-[11px] tracking-wide">ALL DOCKS</span>
                    </span>
                ) : (
                    <div className="flex items-center gap-0.5 bg-slate-50 p-0.5 rounded-full border border-slate-200/80">
                        {([
                            { id: "all" as Direction, label: "ALL" },
                            { id: "inbound" as Direction, label: "IN" },
                            { id: "outbound" as Direction, label: "OUT" },
                        ]).map(d => (
                            <button key={d.id} onClick={() => setDirection(d.id)}
                                className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide transition-colors ${
                                    direction === d.id ? "bg-[#c2410c] text-white" : "text-slate-500 hover:text-[#c2410c]"
                                }`}>
                                {d.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="px-3.5 pt-3 pb-36 space-y-3">

                {/* ── Status Filter Chips ── */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                        { id: "all",        label: "All" },
                        { id: "pending",    label: "Pending Manifest" },
                        { id: "scheduled",  label: "Scheduled" },
                        { id: "dispatched", label: "Dispatched" },
                        { id: "en_route",   label: "En Route" },
                        { id: "shipped",    label: "Shipped" },
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
                        <TransferCard key={t.id} t={t} showRoute="stock_keeper.shipments.show" agreeRoute="stock_keeper.shipments.agree" transitionRoute="stock_keeper.shipments.transition" />
                    ))}
                    {displayedTransfers.length === 0 && (
                        <div className="py-8 text-center bg-white rounded-2xl border border-slate-100">
                            <span className="material-symbols-outlined text-slate-300 text-[36px] mb-2">inbox</span>
                            <p className="text-[13px] font-bold text-gray-900">No shipments found</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {direction === "all"
                                    ? "Nothing is moving through your docks right now."
                                    : "Change the filter, or switch to ALL to see both directions."}
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}

StockKeeperShipmentsIndex.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
