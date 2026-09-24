import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router } from "@inertiajs/react";
import PartyDetailModal, { PartyKey, PartyAgreementInfo } from "@/Components/Seller/PartyDetailModal";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface ScheduledTransfer {
    id: number;
    reference: string;
    status: "scheduled" | "pending" | "overdue" | "dispatched" | "en_route" | "shipped";
    origin: { name: string; detail: string };
    destination: { name: string; detail: string };
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    sku_count: number;
    total_cartons: number;
    total_cbm?: number;
    vehicle_max_cbm?: number;
    load_percentage?: number;
    vehicle_name: string;
    vehicle_plate: string;
    slot: string;
    created_by?: string;
    created_at?: string;
    schedule_options?: string[];
    agreements?: {
        creator?: PartyAgreementInfo;
        fleet?: PartyAgreementInfo;
        origin?: PartyAgreementInfo;
        destination?: PartyAgreementInfo;
    };
}

interface Props {
    scheduled_transfers: ScheduledTransfer[];
}

/* ----------------------------------------------------------
 | Status config
 |----------------------------------------------------------*/
const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    dispatched: { label: "Dispatched",       color: "bg-blue-100 text-blue-800",       icon: "local_shipping" },
    scheduled:  { label: "Scheduled",        color: "bg-emerald-100 text-emerald-800", icon: "check_circle" },
    en_route:   { label: "En Route",         color: "bg-indigo-100 text-indigo-800",   icon: "route" },
    shipped:    { label: "Shipped",          color: "bg-teal-100 text-teal-800",       icon: "task_alt" },
    pending:    { label: "Pending Manifest", color: "bg-amber-100 text-amber-800",     icon: "warning" },
    overdue:    { label: "Overdue",          color: "bg-red-100 text-red-800",         icon: "error" },
};

/* ----------------------------------------------------------
 | DEMO facility / unit options
 |----------------------------------------------------------*/
const FACILITIES = [
    { value: "central-hub", label: "Central Hub — Kality Logistics Center" },
    { value: "piazza-hub",  label: "Piazza Hub — Piazza Terminal 01" },
    { value: "bole-hub",    label: "Bole Hub — Bole Logistics Center" },
];

const UNITS = [
    { value: "main-store",   label: "Main Store — Merkato Terminal 01" },
    { value: "branch-store", label: "Branch Store — Piazza Terminal 02" },
    { value: "bole-store",   label: "Bole Store — Bole Terminal 03" },
];

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

/* ----------------------------------------------------------
 | Add Shipment Bottom Sheet (z-[60] to stay above bottom nav)
 |----------------------------------------------------------*/
function AddShipmentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const tomorrow = new Date(Date.now() + 86400000 - tzOffset).toISOString().split('T')[0];
    const today = new Date(Date.now() - tzOffset).toISOString().split('T')[0];

    const [origin, setOrigin] = useState(FACILITIES[0].value);
    const [dest, setDest]     = useState(UNITS[0].value);
    const [schedDate, setSchedDate] = useState(tomorrow);
    const [schedTime, setSchedTime] = useState("08:30");
    const [altOptions, setAltOptions] = useState<{date: string, time: string}[]>([]);

    if (!open) return null;

    const handleAdd = () => {
        alert(`Shipment request submitted!\nOrigin: ${origin}\nTarget: ${dest}\nScheduled: ${schedDate} ${schedTime}\nAlt Options: ${altOptions.length}`);
        onClose();
    };

    const addOption = () => setAltOptions([...altOptions, { date: schedDate, time: "17:00" }]);
    const removeOption = (idx: number) => setAltOptions(altOptions.filter((_, i) => i !== idx));
    const updateOption = (idx: number, field: 'date'|'time', val: string) => {
        const newOpts = [...altOptions];
        newOpts[idx][field] = val;
        setAltOptions(newOpts);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    </div>
                    <h3 className="text-[16px] font-bold text-gray-900">New Shipment</h3>
                </div>
                <div className="space-y-3 mb-5 max-h-[50vh] overflow-y-auto custom-scrollbar px-1">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Origin Facility</label>
                        <select value={origin} onChange={e => setOrigin(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c2410c]/30">
                            {FACILITIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Target Unit</label>
                        <select value={dest} onChange={e => setDest(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c2410c]/30">
                            {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Primary Target Time</label>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <input type="date" value={schedDate} min={today} onChange={e => setSchedDate(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-white focus:outline-none" />
                            </div>
                            <div className="w-1/3">
                                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-white focus:outline-none" />
                            </div>
                        </div>

                        {altOptions.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Alternate Time Windows</label>
                                {altOptions.map((opt, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <input type="date" value={opt.date} min={today} onChange={e => updateOption(idx, 'date', e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-[12px] font-semibold text-gray-900 bg-white focus:outline-none" />
                                        </div>
                                        <div className="w-1/3">
                                            <input type="time" value={opt.time} onChange={e => updateOption(idx, 'time', e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-[12px] font-semibold text-gray-900 bg-white focus:outline-none" />
                                        </div>
                                        <button onClick={() => removeOption(idx)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 shrink-0">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={addOption} className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1 hover:bg-slate-100">
                            <span className="material-symbols-outlined text-[14px]">add</span> Add Time Window
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 active:scale-95 transition-transform">Cancel</button>
                    <button onClick={handleAdd} className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold active:scale-95 transition-transform shadow-md">Add Shipment</button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Transfer Selection Card
 |----------------------------------------------------------*/
function TransferCard({ t }: { t: ScheduledTransfer }) {
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const cfg = statusConfig[t.status] || statusConfig.scheduled;
    const creator = t.created_by || "Admin";
    const createdAt = t.created_at ? formatDateTime(t.created_at) : "Today • 06:14 AM";
    const loadPercent = t.load_percentage ?? (t.vehicle_max_cbm && t.total_cbm ? Math.round((t.total_cbm / t.vehicle_max_cbm) * 100) : 60);

    // Only when the manifest has been reviewed and dispatched should Creator be ticked off as created
    const isDispatched = t.status === "dispatched";

    // 4-Party agreement details fallback
    const agreements: {
        creator: PartyAgreementInfo;
        fleet: PartyAgreementInfo;
        origin: PartyAgreementInfo;
        destination: PartyAgreementInfo;
    } = {
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

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [filter, setFilter] = useState("all");

    // Filter logic
    const displayedTransfers = filter === "all" 
        ? scheduled_transfers 
        : scheduled_transfers.filter(t => t.status === filter);

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
                        { id: "all",       label: `All (${scheduled_transfers.length})` },
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
                            {f.label}
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
            <AddShipmentSheet open={addOpen} onClose={() => setAddOpen(false)} />
        </>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;