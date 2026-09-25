import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import AddShipmentSheet, { FACILITIES, UNITS } from "@/Components/Seller/Shipments/AddShipmentSheet";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import type { NewShipmentInput, ScheduledTransfer } from "@/types/shipments";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [filter, setFilter] = useState("all");
    const [transfers, setTransfers] = useState<ScheduledTransfer[]>(scheduled_transfers);

    const addShipment = (input: NewShipmentInput) => {
        const originOption = FACILITIES.find(f => f.value === input.origin) ?? FACILITIES[0];
        const destinationOption = UNITS.find(u => u.value === input.destination) ?? UNITS[0];
        const [originName, originDetail = ""] = originOption.label.split(" — ");
        const [destinationName, destinationDetail = ""] = destinationOption.label.split(" — ");
        const shipmentId = Date.now();
        const scheduledRun = `${input.scheduledDate}T${input.scheduledTime}:00`;

        const newShipment: ScheduledTransfer = {
            id: shipmentId,
            reference: `SHP-${String(shipmentId).slice(-6)}`,
            status: "pending",
            origin: { name: originName, detail: originDetail },
            destination: { name: destinationName, detail: destinationDetail },
            distance_km: 0,
            scheduled_run: scheduledRun,
            cutoff_label: "NEW",
            sku_count: 0,
            total_cartons: 0,
            total_cbm: 0,
            vehicle_max_cbm: 0,
            load_percentage: 0,
            vehicle_name: "To be assigned",
            vehicle_plate: "TBD",
            slot: "TBD",
            created_by: "Admin",
            created_at: new Date().toISOString(),
            schedule_options: [scheduledRun, ...input.alternateOptions.map(option => `${option.date}T${option.time}:00`)],
        };

        setTransfers(current => [newShipment, ...current]);
        setAddOpen(false);
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
            <AddShipmentSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addShipment} />
        </>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
