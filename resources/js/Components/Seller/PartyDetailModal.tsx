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
    /** The person who ticked this party, when someone has. */
    actor?: string | null;
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
    /** Parties the signed-in user may tick; drives the action bar. */
    actionableParties?: PartyKey[];
    /** Parties still outstanding, straight from the server. */
    outstandingParties?: PartyKey[];
    /** The slot all four aligned on, once consensus is reached. */
    agreedSlot?: string | null;
    /** Submits this user's agreement on the chosen slot. */
    onAgree?: (party: PartyKey, slot: string, stance: "accepted" | "rescheduled") => void;
    submitting?: boolean;
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
    actionableParties = [],
    outstandingParties = [],
    agreedSlot = null,
    onAgree,
    submitting = false,
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
                    badge: "bg-success-container text-on-success-container border-success/30",
                    bannerBg: "bg-success-container/60 border-success/30",
                    iconColor: "text-success",
                    icon: "check_circle",
                    headline: "Manifest Reviewed & Dispatched (Created)",
                };
            }
            return {
                badge: "bg-warning-container text-on-warning-container border-warning/30",
                bannerBg: "bg-warning-container/40 border-warning/30",
                iconColor: "text-warning",
                icon: "hourglass_empty",
                headline: "Awaiting Review & Dispatch Sign-Off",
            };
        }

        if (status === "accepted") {
            return {
                badge: "bg-success-container text-on-success-container border-success/30",
                bannerBg: "bg-success-container/60 border-success/30",
                iconColor: "text-success",
                icon: "check_circle",
                headline: "Party Agreement Confirmed",
            };
        }
        if (status === "rescheduled") {
            return {
                badge: "bg-warning-container text-on-warning-container border-warning/30",
                bannerBg: "bg-warning-container/60 border-warning/30",
                iconColor: "text-warning",
                icon: "schedule",
                headline: "Reschedule Notice Proposed",
            };
        }
        return {
            badge: "bg-surface-container text-on-surface-variant border-outline-variant",
            bannerBg: "bg-surface-container-low border-outline-variant",
            iconColor: "text-on-surface-variant",
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
            <div className="w-full max-w-[440px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Drag handle */}
                <div className="w-10 h-1 bg-surface-container-high rounded-full mx-auto mb-3 sm:hidden" />

                {/* Top strip */}
                <div className="flex items-center justify-between mb-3.5">
                    <div>
                        <h3 className="text-[16px] font-bold text-on-surface leading-tight">4-Party Agreement Gate</h3>
                        <p className="text-[11px] text-outline mt-0.5">
                            {reference ? `Run Ref: ${reference}` : "Mutual Clearance Verification"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors"
                        aria-label="Close"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Quick Party Switcher Tabs (Click each to view on its own) */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-surface-container/90 rounded-2xl mb-4 border border-outline-variant/50">
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
                                        ? "bg-surface-container-lowest text-on-surface shadow-sm border border-outline-variant/80"
                                        : "text-on-surface-variant hover:text-on-surface"
                                }`}
                            >
                                <div className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px]">{p.icon}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isAgreed ? 'bg-success' : isRescheduled ? 'bg-warning' : 'bg-surface-container-highest'}`} />
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
                            isPartyAgreed(current, activeParty) ? 'bg-success-container' : current.status === 'rescheduled' ? 'bg-warning-container' : 'bg-surface-container-high/70'
                        }`}>
                            <span className={`material-symbols-outlined text-[20px] ${theme.iconColor}`}>
                                {theme.icon}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                                <h4 className="text-[13px] font-bold text-on-surface">{current.title} ({current.role})</h4>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${theme.badge} shrink-0`}>
                                    {activeParty === "creator" 
                                        ? (current.status === "created" ? "Created" : (current.status_label || "Pending Dispatch"))
                                        : current.status_label}
                                </span>
                            </div>
                            <p className="text-[11px] font-semibold text-on-surface-variant mt-0.5">{theme.headline}</p>
                            <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">{current.detail}</p>
                        </div>
                    </div>

                    {/* Detailed Properties Card */}
                    <div className="bg-surface-container-low/80 rounded-2xl border border-outline-variant/60 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-outline-variant/60">
                            <span className="text-[11px] font-medium text-outline shrink-0">Assigned Entity</span>
                            <span className="text-[11px] font-bold text-on-surface text-right">{current.party}</span>
                        </div>

                        {activeParty === "creator" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Authority Role</span>
                                    <span className="text-[11px] font-semibold text-on-surface">Seller Admin</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Creation Status</span>
                                    <span className={`text-[11px] font-bold ${current.status === "created" ? "text-success font-mono" : "text-warning"}`}>
                                        {current.status === "created" ? "Created & Dispatched (Ticked)" : "Pending Review & Dispatch"}
                                    </span>
                                </div>
                                <div className="p-2 rounded-xl bg-warning-container/35 border border-warning/20 text-[10px] text-on-warning-container">
                                    Creator is only ticked off as <strong>Created</strong> once the replenishment manifest has been fully reviewed and dispatched.
                                </div>
                            </>
                        )}

                        {activeParty === "fleet" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Driver Action</span>
                                    <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-success' : current.status === 'rescheduled' ? 'text-warning' : 'text-on-surface-variant'}`}>
                                        {current.status === 'accepted' ? 'Accepted Route & Time' : current.status === 'rescheduled' ? 'Sent Reschedule Notice' : 'Awaiting Driver Response'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Transit Type</span>
                                    <span className="text-[11px] font-semibold text-on-surface">Dedicated Fleet Transfer</span>
                                </div>
                            </>
                        )}

                        {activeParty === "origin" && (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Stock Keeper</span>
                                    <span className="text-[11px] font-semibold text-on-surface">{current.actor ?? "Not yet confirmed"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                    <span className="text-[11px] font-medium text-outline">Staging Status</span>
                                    <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-success' : current.status === 'rescheduled' ? 'text-warning' : 'text-on-surface-variant'}`}>
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
                                            <span className="text-[11px] font-bold text-on-surface">Dual Destination Stock Keepers</span>
                                            <span className="text-[9px] font-bold bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">Both Required</span>
                                        </div>
                                        {current.stock_keepers.map((sk, idx) => (
                                            <div key={idx} className="p-2 rounded-xl bg-surface-container-lowest border border-outline-variant space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-on-surface">{sk.name}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                        sk.status === "accepted" ? "bg-success-container text-on-success-container" :
                                                        sk.status === "rescheduled" ? "bg-warning-container text-on-warning-container" : "bg-surface-container text-on-surface-variant"
                                                    }`}>
                                                        {sk.status_label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                                                    <span>Stock Keeper: <strong className="text-on-surface">{sk.keeper}</strong></span>
                                                    <span className="text-outline">{sk.location}</span>
                                                </div>
                                                <p className="text-[10px] text-on-surface-variant">{sk.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                            <span className="text-[11px] font-medium text-outline">Store Stock Keeper</span>
                                            <span className="text-[11px] font-semibold text-on-surface">Helen M. (Receiving Lead)</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
                                            <span className="text-[11px] font-medium text-outline">Inbound Readiness</span>
                                            <span className={`text-[11px] font-bold ${current.status === 'accepted' ? 'text-success' : current.status === 'rescheduled' ? 'text-warning' : 'text-on-surface-variant'}`}>
                                                {current.status === 'accepted' ? 'Receiving Bay Reserved' : current.status === 'rescheduled' ? 'Shift Reschedule Requested' : 'Pending Stock Keeper Confirmation'}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-[10px] text-outline">Consensus Gate Rule</span>
                            <span className="text-[10px] font-bold text-primary">All Required Parties Must Agree</span>
                        </div>
                    </div>

                    {/* ── Scheduled Time Consensus & Reschedule Gap ── */}
                    <div className="bg-surface-container-low/80 rounded-2xl border border-outline-variant/60 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                                <span className="text-[11px] font-bold text-on-surface">Scheduled Time Gap & Consensus</span>
                            </div>
                            <span className="text-[9px] font-bold text-outline uppercase tracking-wider">Multi-Party Agreement</span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant leading-snug">
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
                                                ? "bg-surface-container-lowest border-primary shadow-xs text-primary" 
                                                : "bg-surface-container-lowest/70 border-outline-variant/80 text-on-surface-variant hover:bg-surface-container-lowest hover:border-outline/50"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-[9px] font-bold uppercase text-outline">Option {i + 1}</span>
                                            {isSelected && <span className="material-symbols-outlined text-[13px] text-primary">check</span>}
                                        </div>
                                        <p className="text-[11px] font-bold font-mono">{opt}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Alignment summary — derived from real party stances */}
                        <div className="p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/70 text-[10px] space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-on-surface-variant">{agreedSlot ? "Agreed Run Time:" : "Your Selection:"}</span>
                                <strong className="text-on-surface font-mono font-bold">{agreedSlot ?? selectedSlot}</strong>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-on-surface-variant text-[9px]">
                                {(["fleet", "origin", "destination"] as PartyKey[]).map(key => {
                                    const a = agreements[key];
                                    const aligned = a.status === "accepted";
                                    return (
                                        <span key={key}>
                                            {key === "fleet" ? "Driver" : key === "origin" ? "Origin SK" : "Dest SK"}:{" "}
                                            <strong className={aligned ? "text-success" : a.status === "rescheduled" ? "text-warning" : "text-on-surface-variant"}>
                                                {aligned ? "Aligned" : a.status === "rescheduled" ? "Reschedule" : "Pending"}
                                            </strong>
                                        </span>
                                    );
                                })}
                            </div>
                            {outstandingParties.length > 0 ? (
                                <p className="text-[9px] text-warning font-bold pt-0.5">
                                    Awaiting {outstandingParties.length} of 4 — cannot schedule yet.
                                </p>
                            ) : (
                                <p className="text-[9px] text-success font-bold pt-0.5">
                                    All 4 parties aligned — shipment scheduled.
                                </p>
                            )}
                        </div>

                        {/* ── Action bar: only for parties this user may tick ── */}
                        {onAgree && actionableParties.length > 0 && (
                            <div className="pt-1 space-y-1.5">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-outline">
                                    You can respond as {actionableParties.join(" / ")}
                                </p>
                                {actionableParties.map(party => (
                                    <div key={party} className="flex gap-1.5">
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => onAgree(party, selectedSlot, "accepted")}
                                            className="flex-1 py-2 rounded-xl bg-primary text-on-primary text-[11px] font-bold active:scale-95 transition-transform disabled:bg-surface-container-highest"
                                        >
                                            Agree as {party} @ {selectedSlot}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => onAgree(party, selectedSlot, "rescheduled")}
                                            className="px-3 py-2 rounded-xl bg-surface-container-lowest border border-warning/40 text-warning text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50"
                                        >
                                            Reschedule
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full mt-4 py-3 rounded-xl bg-inverse-surface hover:bg-inverse-surface/90 text-inverse-on-surface font-bold text-[13px] active:scale-95 transition-all shadow-md"
                >
                    Close Window
                </button>
            </div>
        </div>
    );
}
