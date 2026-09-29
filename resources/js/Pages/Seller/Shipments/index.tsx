import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import AddShipmentSheet from "@/Components/Seller/Shipments/AddShipmentSheet";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import type { LocationOption, NewShipmentInput, ScheduledTransfer } from "@/types/shipments";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
    /** Real stores, so a created shipment resolves to an actual record. */
    stores?: LocationOption[];
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [], stores = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [filter, setFilter] = useState("all");
    const [submitting, setSubmitting] = useState(false);
    const transfers = scheduled_transfers;

    /**
     * Persist the shipment instead of only adding a local row.
     *
     * The previous version pushed a client-side object with `id: Date.now()`,
     * so the card linked to a shipment that did not exist and the manifest
     * builder 404'd. The server now creates the record and redirects straight
     * into Build.
     */
    const addShipment = (input: NewShipmentInput) => {
        const scheduledRun = `${input.scheduledDate}T${input.scheduledTime}:00`;

        /*
         * The alternate windows go with it.
         *
         * The sheet has always let the seller add "Alternate Time Windows", and
         * this call dropped them — so a run reached the 4-party gate offering a
         * single time. The driver and both docks could only accept that one time
         * or refuse, because the service rejects agreement on a slot that was
         * never proposed. The windows are what makes the gate an agreement
         * rather than an instruction.
         */
        const proposedWindows = [
            scheduledRun,
            ...(input.alternateOptions ?? [])
                .filter(w => w.date && w.time)
                .map(w => `${w.date}T${w.time}:00`),
        ].filter((slot, i, all) => all.indexOf(slot) === i);

        setSubmitting(true);
        router.post(
            route("seller.shipments.store"),
            {
                origin_store_id: Number(input.origin),
                destination_store_id: Number(input.destination),
                scheduled_for: scheduledRun,
                schedule_options: proposedWindows,
            },
            {
                onSuccess: () => setAddOpen(false),
                onFinish: () => setSubmitting(false),
            },
        );
    };

    // Filter logic
    const displayedTransfers = filter === "all"
        ? transfers
        : transfers.filter(t => t.status === filter);

    return (
        <>
            <Head title="Shipments">
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            </Head>

            {/* ── Top Context Strip: Back button, centered Shipments, and NEW button ── */}
            <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <button
                    onClick={() => {
                        if (window.history.length > 1) {
                            window.history.back();
                        } else {
                            router.visit(route("seller.dashboard"));
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

                <button onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1 bg-orange-50 text-[#c2410c] px-3 py-1.5 rounded-full border border-orange-200/60 active:scale-95 transition-transform hover:bg-orange-100">
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span className="font-bold text-[11px] tracking-wide">NEW</span>
                </button>
            </div>

            <div className="px-3.5 pt-3 pb-36 space-y-3">

                {/* ── Status Filter Chips ── */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                        { id: "all",       label: "All" },
                        { id: "scheduled", label: "Scheduled" },
                        { id: "pending",   label: "Pending Manifest" },
                        { id: "en_route",  label: "En Route" },
                        { id: "shipped",   label: "Shipped" },
                        { id: "overdue",   label: "Overdue" },
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
                        <TransferCard key={t.id} t={t} />
                    ))}
                    {displayedTransfers.length === 0 && (
                        <div className="py-8 text-center bg-white rounded-2xl border border-slate-100">
                            <span className="material-symbols-outlined text-slate-300 text-[36px] mb-2">inbox</span>
                            <p className="text-[13px] font-bold text-gray-900">No shipments found</p>
                            <p className="text-[11px] text-slate-400 mt-1">Change the filter or create a new shipment.</p>
                        </div>
                    )}
                </div>

            </div>

            {/* ── Dialogs ── */}
            <AddShipmentSheet
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdd={addShipment}
                facilities={stores}
                units={stores}
                submitting={submitting}
            />
        </>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
