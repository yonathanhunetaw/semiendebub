import React, { useState } from "react";
import { Link } from "@inertiajs/react";
import PartyDetailModal from "@/Components/Seller/PartyDetailModal";
import type { PartyKey, PartyAgreementsMap, ScheduledTransfer, StatusConfigEntry } from "@/types/shipments";

/* ----------------------------------------------------------
 | Status config
 |----------------------------------------------------------*/
const statusConfig: Record<string, StatusConfigEntry> = {
    dispatched: { label: "Dispatched",       color: "bg-blue-100 text-blue-800",       icon: "local_shipping" },
    scheduled:  { label: "Scheduled",        color: "bg-emerald-100 text-emerald-800", icon: "check_circle" },
    en_route:   { label: "En Route",         color: "bg-indigo-100 text-indigo-800",   icon: "route" },
    shipped:    { label: "Shipped",          color: "bg-teal-100 text-teal-800",       icon: "task_alt" },
    pending:    { label: "Pending Manifest", color: "bg-amber-100 text-amber-800",     icon: "warning" },
    overdue:    { label: "Overdue",          color: "bg-red-100 text-red-800",         icon: "error" },
};

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
function formatDateTime(valStr: string) {
    if (!valStr) return "";
    if (valStr.includes("T")) {
        const d = new Date(valStr);
        if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            return `${dateStr} • ${timeStr}`;
        }
    }
    return valStr; // Fallback
}

export interface TransferCardProps {
    t: ScheduledTransfer;
}

/* ----------------------------------------------------------
 | Transfer Selection Card
 |----------------------------------------------------------*/
export default function TransferCard({ t }: TransferCardProps) {
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const cfg = statusConfig[t.status] || statusConfig.scheduled;
    const creator = t.created_by || "Admin";
    const createdAt = t.created_at ? formatDateTime(t.created_at) : "Today • 06:14 AM";
    const loadPercent = t.load_percentage ?? (t.vehicle_max_cbm && t.total_cbm ? Math.round((t.total_cbm / t.vehicle_max_cbm) * 100) : 60);

    // Only when the manifest has been reviewed and dispatched should Creator be ticked off as created
    const isDispatched = t.status === "dispatched";

    // 4-Party agreement details fallback
    const agreements: PartyAgreementsMap = {
        creator: t.agreements?.creator ? {
            ...t.agreements.creator,
            status: isDispatched ? "created" : "pending",
            status_label: isDispatched ? "Created" : "Pending Dispatch",
        } : {
            title: "1. Creator",
            role: "Seller",
            party: `Admin • ${createdAt}`,
            status: isDispatched ? "created" : "pending",
            status_label: isDispatched ? "Created" : "Pending Dispatch",
            detail: isDispatched ? "Manifest reviewed & dispatched by Admin." : "Manifest drafted; awaiting dispatch sign-off.",
        },
        fleet: t.agreements?.fleet ?? {
            title: "2. Fleet",
            role: "Carrier",
            party: `${t.vehicle_name} • ${t.vehicle_plate}`,
            status: (t.status === "overdue" ? "rescheduled" : (t.status === "scheduled" || isDispatched) ? "accepted" : "pending") as "accepted" | "rescheduled" | "pending",
            status_label: t.status === "overdue" ? "Rescheduled" : (t.status === "scheduled" || isDispatched) ? "Driver Accepted" : "Pending Driver",
            detail: t.status === "overdue"
                ? "Driver requested slot reschedule due to transit maintenance."
                : (t.status === "scheduled" || isDispatched)
                ? "Driver Abebe K. accepted assignment • ETA on schedule."
                : "Awaiting driver assignment & route confirmation.",
        },
        origin: t.agreements?.origin ?? {
            title: "3. Origin",
            role: "Depot",
            party: `${t.origin.name} (${t.origin.detail})`,
            status: (t.status === "overdue" ? "rescheduled" : (t.status === "pending" || isDispatched) ? "accepted" : "pending") as "accepted" | "rescheduled" | "pending",
            status_label: t.status === "overdue" ? "Rescheduled" : (t.status === "pending" || isDispatched) ? "Accepted" : "Pending Stock Keeper",
            detail: t.status === "overdue"
                ? "Stock Keeper Kidus W. sent a reschedule notice due to loading dock backlog."
                : (t.status === "pending" || isDispatched)
                ? "Stock Keeper Dawit T. accepted and packed 80 cartons."
                : "Stock Keeper Dawit T. assigned. Bay staging in progress.",
        },
        destination: t.agreements?.destination ?? {
            title: "4. Dest.",
            role: "Store",
            party: `${t.destination.name} (${t.destination.detail})`,
            status: (t.status === "pending" ? "rescheduled" : "pending") as "accepted" | "rescheduled" | "pending",
            status_label: t.status === "pending" ? "Rescheduled" : "Pending Stock Keeper",
            detail: t.status === "pending"
                ? "Store Stock Keeper Blen A. sent a reschedule request (+30 mins for shift swap)."
                : "Store Receiver Helen M. standing by for arrival confirmation.",
        },
    };

    return (
        <div className={`bg-white rounded-2xl border ${t.status === "overdue" ? "border-red-200 shadow-sm" : "border-slate-100 shadow-sm"} p-4 relative overflow-hidden`}>
            {t.status === "overdue" && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}

            {/* ── Status & Title (No redundant Created by Admin here) ── */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-[14px] font-bold text-gray-900 tracking-tight">{t.origin.name} → {t.destination.name}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{t.reference}</p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${cfg.color} shrink-0`}>
                    <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">{cfg.label}</span>
                </div>
            </div>

            {/* ── Schedule Strip (Scheduled Time) ── */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl mb-4 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-[#c2410c] flex items-center justify-center shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-[18px] text-white">schedule</span>
                </div>
                <div className="flex-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Scheduled Time</p>
                    <p className="text-[13px] font-bold text-[#c2410c]">{formatDateTime(t.scheduled_run)}</p>
                </div>
                <div className="text-right shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide uppercase ${t.status === "overdue" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                        {t.cutoff_label}
                    </span>
                </div>
            </div>

            {/* ── Stats (with Volume in between Cartons and SLOT) ── */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">SKUs</p>
                    <p className="text-[14px] font-bold font-mono text-gray-900">{t.sku_count}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cartons</p>
                    <p className="text-[14px] font-bold font-mono text-gray-900">{t.total_cartons}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Volume</p>
                    <p className="text-[14px] font-bold font-mono text-gray-900">
                        {loadPercent}%
                    </p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">{t.slot || "BAY"}</p>
                    <p className="text-[12px] font-bold font-mono text-gray-900 truncate">{t.vehicle_plate}</p>
                </div>
            </div>

            {/* ── Conditional Bottom Section: Transit Status vs 4-Party Gate ── */}
            {(t.status === "en_route" || t.status === "shipped") ? (
                <div className="border-t border-slate-100 pt-4 mt-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Transit Status</p>

                    {t.status === "en_route" && (
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                <span className="text-[12px] font-bold text-gray-800">Origin → Driver Done</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-indigo-500">sync</span>
                                <span className="text-[12px] font-bold text-gray-800">Driver → Destination Pending</span>
                            </div>
                        </div>
                    )}

                    {t.status === "shipped" && (
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                <span className="text-[12px] font-bold text-gray-800">Shipment Created ({creator})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                <span className="text-[12px] font-bold text-gray-800">Driver Accepted</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                <span className="text-[12px] font-bold text-gray-800">Origin Completed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                <span className="text-[12px] font-bold text-gray-800">Destination Received</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* ── 4-Party Agreement Gate ── */}
                    <div className="border-t border-slate-100 pt-3 mb-4">
                        <div className="flex items-center justify-between mb-2.5">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">4-Party Agreement Gate</p>
                                <p className="text-[9px] text-slate-400">Tap any party to view details</p>
                            </div>
                            <span className="text-[9px] font-bold text-[#c2410c] bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-200/50">ALL 4 REQ</span>
                        </div>

                        {/* 4 Party Status Clickable Buttons */}
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                            {[
                                { key: "creator" as PartyKey,     label: "1. Creator", sub: isDispatched ? "Created" : "Pending", icon: "person",         agreed: isDispatched },
                                { key: "fleet" as PartyKey,       label: "2. Fleet",   sub: "Carrier", icon: "local_shipping", agreed: agreements.fleet.status === "accepted" },
                                { key: "origin" as PartyKey,      label: "3. Origin",  sub: "Depot",   icon: "warehouse",      agreed: agreements.origin.status === "accepted" },
                                { key: "destination" as PartyKey, label: "4. Dest.",   sub: agreements.destination.stock_keepers ? "2 SKs" : "Store", icon: "storefront", agreed: agreements.destination.status === "accepted" },
                            ].map((p, idx) => {
                                const color = p.agreed ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200";
                                return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setActivePartyModal(p.key)}
                                    className={`flex flex-col items-center p-1.5 rounded-xl border transition-all text-center cursor-pointer hover:shadow-xs active:scale-95 ${
                                        p.agreed ? 'border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/60' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                                    }`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 border ${color} shrink-0`}>
                                        <span className="material-symbols-outlined text-[13px]">{p.icon}</span>
                                    </div>
                                    <span className={`text-[8px] font-bold leading-tight w-full truncate ${p.agreed ? 'text-emerald-900' : 'text-gray-500'}`}>{p.label}</span>
                                    <span className="text-[7px] text-slate-400 leading-tight w-full truncate">{p.sub}</span>
                                    <div className="mt-1 flex items-center justify-center w-full">
                                        {p.agreed
                                            ? <span className="material-symbols-outlined text-[12px] text-emerald-600">check_circle</span>
                                            : <span className="material-symbols-outlined text-[12px] text-slate-300">hourglass_empty</span>
                                        }
                                    </div>
                                </button>
                            )})}
                        </div>
                    </div>

                    {/* ── Party Detail Modal Window (Opens on click for each party) ── */}
                    <PartyDetailModal
                        open={activePartyModal !== null}
                        activeParty={activePartyModal ?? "creator"}
                        onClose={() => setActivePartyModal(null)}
                        onSelectParty={setActivePartyModal}
                        reference={t.reference}
                        scheduleOptions={t.schedule_options}
                        agreements={agreements}
                    />

                    {/* ── Action ── */}
                    <Link href={route("seller.shipments.show", t.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-gray-900 text-[13px] font-bold active:scale-95 transition-transform hover:bg-slate-100 hover:border-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-gray-600">build</span>
                        Build Manifest
                    </Link>
                </>
            )}
        </div>
    );
}
