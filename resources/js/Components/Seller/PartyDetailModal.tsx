import React, { useState } from "react";

export type PartyKey = "creator" | "fleet" | "origin" | "destination";

export interface SubStockKeeper {
    name: string;
    location: string;
    role: string;
    keeper: string;
    status: "accepted" | "rescheduled" | "pending";
    status_label: string;
    detail: string;
}

export interface PartyAgreementInfo {
    title: string;
    role: string;
    party: string;
    status: "accepted" | "rescheduled" | "pending" | "created";
    status_label: string;
    detail: string;
    agreed_time?: string;
    stock_keepers?: SubStockKeeper[];
    extra?: {
        label: string;
        value: string;
    }[];
}

interface Props {
    open: boolean;
    activeParty: PartyKey;
    onClose: () => void;
    onSelectParty: (p: PartyKey) => void;
    reference?: string;
    scheduleOptions?: string[];
    selectedSchedule?: string;
    onSelectSchedule?: (slot: string) => void;
    agreements: {
        creator: PartyAgreementInfo;
        fleet: PartyAgreementInfo;
        origin: PartyAgreementInfo;
        destination: PartyAgreementInfo;
    };
}

const DEFAULT_SCHEDULE_OPTIONS = [
    "10/25/2024, 08:30 AM",
    "10/25/2024, 05:00 PM",
    "10/26/2024, 08:30 AM",
    "10/26/2024, 05:00 PM",
];

export default function PartyDetailModal({
    open,
    activeParty,
    onClose,
    onSelectParty,
    reference,
    scheduleOptions = DEFAULT_SCHEDULE_OPTIONS,
    selectedSchedule: initialSchedule,
    onSelectSchedule,
    agreements,
}: Props) {
    const [selectedSlot, setSelectedSlot] = useState(initialSchedule || scheduleOptions[0]);

    if (!open) return null;

    const current = agreements[activeParty] ?? agreements.creator;

    const isPartyAgreed = (p: PartyAgreementInfo, key: PartyKey) => {
        if (key === "creator") {
            return p.status === "created";
        }
        return p.status === "accepted";
    };

    const parties: { key: PartyKey; label: string; icon: string; status: "accepted" | "rescheduled" | "pending" | "created" }[] = [
        { key: "creator",     label: "1. Creator", icon: "person",         status: agreements.creator.status },
        { key: "fleet",       label: "2. Fleet",   icon: "local_shipping", status: agreements.fleet.status },
        { key: "origin",      label: "3. Origin",  icon: "warehouse",      status: agreements.origin.status },
        { key: "destination", label: "4. Dest.",   icon: "storefront",     status: agreements.destination.status },
    ];

    const getStatusTheme = (status: "accepted" | "rescheduled" | "pending" | "created", partyKey: PartyKey) => {
        if (partyKey === "creator") {
            if (status === "created") {
                return {
                    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
                    bannerBg: "bg-emerald-50 border-emerald-200",
                    iconColor: "text-emerald-600",
                    icon: "check_circle",
                    headline: "Manifest Reviewed & Dispatched (Created)",
                };
            }
            return {
                badge: "bg-amber-100 text-amber-800 border-amber-200",
                bannerBg: "bg-amber-50/70 border-amber-200",
                iconColor: "text-amber-600",
                icon: "hourglass_empty",
                headline: "Awaiting Review & Dispatch Sign-Off",
            };
        }

        if (status === "accepted") {
            return {
                badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
                bannerBg: "bg-emerald-50 border-emerald-200",
                iconColor: "text-emerald-600",
                icon: "check_circle",
                headline: "Party Agreement Confirmed",
            };
        }
        if (status === "rescheduled") {
            return {
                badge: "bg-amber-100 text-amber-800 border-amber-200",
                bannerBg: "bg-amber-50 border-amber-200",
                iconColor: "text-amber-600",
                icon: "schedule",
                headline: "Reschedule Notice Proposed",
            };
        }
        return {
            badge: "bg-slate-100 text-slate-700 border-slate-200",
            bannerBg: "bg-slate-50 border-slate-200",
            iconColor: "text-slate-500",
            icon: "hourglass_empty",
            headline: "Pending Stock Keeper / Party Acknowledgment",
        };
    };

    const theme = getStatusTheme(current.status, activeParty);

    const handleSlotClick = (slot: string) => {
        setSelectedSlot(slot);
        if (onSelectSchedule) {
            onSelectSchedule(slot);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4" onClick={onClose}>
            <div className="w-full max-w-[440px] bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Drag handle */}
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />

                {/* Top strip */}
                <div className="flex items-center justify-between mb-3.5">
                    <div>
                        <h3 className="text-[16px] font-bold text-gray-900 leading-tight">4-Party Agreement Gate</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {reference ? `Run Ref: ${reference}` : "Mutual Clearance Verification"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                        aria-label="Close"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Quick Party Switcher Tabs (Click each to view on its own) */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 rounded-2xl mb-4 border border-slate-200/50">
                    {parties.map(p => {
                        const isActive = activeParty === p.key;
                        const partyInfo = agreements[p.key];
                        const isAgreed = isPartyAgreed(partyInfo, p.key);
                        const isRescheduled = p.status === "rescheduled";
                        return (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => onSelectParty(p.key)}
                                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all flex flex-col items-center gap-0.5 ${
                                    isActive
                                        ? "bg-white text-gray-900 shadow-sm border border-slate-200/80"
                                        : "text-slate-500 hover:text-slate-900"
                                }`}
                            >
                                <div className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px]">{p.icon}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isAgreed ? 'bg-emerald-500' : isRescheduled ? 'bg-amber-500' : 'bg-slate-300'}`} />
                                </div>
                                <span className="truncate w-full text-center">{p.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Details Window for Selected Party */}
                <div className="space-y-3">
                    {/* Status Header Banner */}
                    <div className={`p-3.5 rounded-2xl border ${theme.bannerBg} flex items-start gap-3`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isPartyAgreed(current, activeParty) ? 'bg-emerald-100' : current.status === 'rescheduled' ? 'bg-amber-100' : 'bg-slate-200/70'
                        }`}>
                            <span className={`material-symbols-outlined text-[20px] ${theme.iconColor}`}>
                                {theme.icon}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                                <h4 className="text-[13px] font-bold text-gray-900">{current.title} ({current.role})</h4>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${theme.badge} shrink-0`}>
                                    {activeParty === "creator" 
                                        ? (current.status === "created" ? "Created" : (current.status_label || "Pending Dispatch"))
                                        : current.status_label}
                                </span>
                            </div>
                            <p className="text-[11px] font-semibold text-gray-700 mt-0.5">{theme.headline}</p>
                            <p className="text-[11px] text-slate-600 mt-1 leading-snug">{current.detail}</p>
                        </div>
                    </div>

                    {/* Detailed Properties Card */}
                    <div className="bg-slate-50/80 rounded-2xl border border-slate-100 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-200/60">
                            <span className="text-[11px] font-medium text-slate-400 shrink-0">Assigned Entity</span>
                            <span className="text-[11px] font-bold text-gray-900 text-right">{current.party}</span>
                        </div>

                        {activeParty === "creator" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Authority Role</span>
                                    <span className="text-[11px] font-semibold text-gray-800">Seller Admin</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Creation Status</span>
                                    <span className={`text-[11px] font-bold ${current.status === "created" ? "text-emerald-700 font-mono" : "text-amber-700"}`}>
                                        {current.status === "created" ? "Created & Dispatched (Ticked)" : "Pending Review & Dispatch"}
                                    </span>
                                </div>
                                <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-200/60 text-[10px] text-amber-800">
                                    Creator is only ticked off as <strong>Created</strong> once the replenishment manifest has been fully reviewed and dispatched.
                                </div>
                            </>
                        )}

                        {activeParty === "fleet" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Driver Action</span>
                                    <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-emerald-700' : current.status === 'rescheduled' ? 'text-amber-700' : 'text-slate-600'}`}>
                                        {current.status === 'accepted' ? 'Accepted Route & Time' : current.status === 'rescheduled' ? 'Sent Reschedule Notice' : 'Awaiting Driver Response'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Transit Type</span>
                                    <span className="text-[11px] font-semibold text-gray-800">Dedicated Fleet Transfer</span>
                                </div>
                            </>
                        )}

                        {activeParty === "origin" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Stock Keeper</span>
                                    <span className="text-[11px] font-semibold text-gray-800">Dawit T.</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                    <span className="text-[11px] font-medium text-slate-400">Staging Status</span>
                                    <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-emerald-700' : current.status === 'rescheduled' ? 'text-amber-700' : 'text-slate-600'}`}>
                                        {current.status === 'accepted' ? 'Cartons Staged & Verified' : current.status === 'rescheduled' ? 'Loading Queue Delay' : 'Pending Stock Keeper Staging'}
                                    </span>
                                </div>
                            </>
                        )}

                        {activeParty === "destination" && (
                            <>
                                {current.stock_keepers && current.stock_keepers.length > 0 ? (
                                    <div className="space-y-2 pb-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-gray-800">Dual Destination Stock Keepers</span>
                                            <span className="text-[9px] font-bold bg-orange-100 text-[#c2410c] px-2 py-0.5 rounded-full">Both Required</span>
                                        </div>
                                        {current.stock_keepers.map((sk, idx) => (
                                            <div key={idx} className="p-2 rounded-xl bg-white border border-slate-200 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-gray-900">{sk.name}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                        sk.status === "accepted" ? "bg-emerald-100 text-emerald-800" :
                                                        sk.status === "rescheduled" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                                                    }`}>
                                                        {sk.status_label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                                    <span>Stock Keeper: <strong className="text-gray-700">{sk.keeper}</strong></span>
                                                    <span className="text-slate-400">{sk.location}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600">{sk.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                            <span className="text-[11px] font-medium text-slate-400">Store Stock Keeper</span>
                                            <span className="text-[11px] font-semibold text-gray-800">Helen M. (Receiving Lead)</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                            <span className="text-[11px] font-medium text-slate-400">Inbound Readiness</span>
                                            <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-emerald-700' : current.status === 'rescheduled' ? 'text-amber-700' : 'text-slate-600'}`}>
                                                {current.status === 'accepted' ? 'Receiving Bay Reserved' : current.status === 'rescheduled' ? 'Shift Reschedule Requested' : 'Pending Stock Keeper Confirmation'}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-[10px] text-slate-400">Consensus Gate Rule</span>
                            <span className="text-[10px] font-bold text-[#c2410c]">All Required Parties Must Agree</span>
                        </div>
                    </div>

                    {/* ── Scheduled Time Consensus & Reschedule Gap ── */}
                    <div className="bg-slate-50/80 rounded-2xl border border-slate-100 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#c2410c]">schedule</span>
                                <span className="text-[11px] font-bold text-gray-900">Scheduled Time Gap & Consensus</span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Multi-Party Agreement</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">
                            Driver, Origin Stock Keeper, and Destination Stock Keeper(s) can align or propose a reschedule among these proposed run times:
                        </p>

                        <div className="grid grid-cols-2 gap-1.5">
                            {scheduleOptions.map((opt, i) => {
                                const isSelected = selectedSlot === opt;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handleSlotClick(opt)}
                                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                                            isSelected 
                                                ? "bg-white border-[#c2410c] shadow-xs text-[#c2410c]" 
                                                : "bg-white/70 border-slate-200/80 text-gray-700 hover:bg-white hover:border-slate-300"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-[9px] font-bold uppercase text-slate-400">Option {i + 1}</span>
                                            {isSelected && <span className="material-symbols-outlined text-[13px] text-[#c2410c]">check</span>}
                                        </div>
                                        <p className="text-[11px] font-bold font-mono">{opt}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Alignment summary */}
                        <div className="p-2 rounded-xl bg-white border border-slate-200/70 text-[10px] space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Agreed Run Time:</span>
                                <strong className="text-gray-900 font-mono font-bold">{selectedSlot}</strong>
                            </div>
                            <div className="flex items-center justify-between text-slate-500 text-[9px]">
                                <span>Driver: <strong className="text-emerald-700">Aligned</strong></span>
                                <span>Origin SK: <strong className="text-emerald-700">Aligned</strong></span>
                                <span>Dest SK: <strong className="text-amber-700">Reschedule Opt 2</strong></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full mt-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[13px] active:scale-95 transition-all shadow-md"
                >
                    Close Window
                </button>
            </div>
        </div>
    );
}
