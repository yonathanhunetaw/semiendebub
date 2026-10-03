import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import PartyDetailModal from "@/Components/Seller/PartyDetailModal";
import type {
    CourierInfo,
    Location,
    ManifestItem,
    ManifestItemStatus,
    PartyGateProps,
    PartyKey,
    Vehicle,
} from "@/types/shipments";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface Props extends PartyGateProps {
    transfer_id: number;
    reference: string;
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    slot: string;
    vehicle: Vehicle;
    manifest_items: ManifestItem[];
    total_cbm: number;
    total_kg: number;
    total_cartons: number;
    /** The driver, once the fleet party has taken the run. */
    courier: CourierInfo | null;
    /** False while the agreement gate is still open or the manifest is empty. */
    can_dispatch: boolean;
}

function statusBadge(status: ManifestItemStatus, label: string) {
    if (status === "oos") return <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-800">{label}</span>;
    if (status === "low") return <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">{label}</span>;
    return <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">{label}</span>;
}

function ItemStatusIcon({ icon }: { icon: string }) {
    if (icon === "report") return <span className="material-symbols-outlined text-[16px]" style={{ color: "#dc2626" }}>report</span>;
    if (icon === "warning") return <span className="material-symbols-outlined text-[16px]" style={{ color: "#d97706" }}>warning</span>;
    return <span className="material-symbols-outlined text-[16px]" style={{ color: "#475569" }}>inventory_2</span>;
}

/* ----------------------------------------------------------
 | Phase Stepper
 |----------------------------------------------------------*/
function PhaseStepper({ active }: { active: 1 | 2 | 3 }) {
    const steps = [
        { label: "Manifest", sub: active === 1 ? "Active" : "Done" },
        { label: "Review",   sub: active === 2 ? "Active" : active > 2 ? "Done" : "Pending" },
        { label: "Dispatch", sub: active === 3 ? "Active" : "Pending" },
    ];
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
            <div className="flex items-center">
                {steps.map((step, i) => (
                    <React.Fragment key={step.label}>
                        <div className="flex items-center gap-1.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                i + 1 < active ? "bg-emerald-500" : i + 1 === active ? "bg-[#c2410c]" : "bg-slate-100"
                            }`}>
                                {i + 1 < active
                                    ? <span className="material-symbols-outlined text-white text-[13px]">check</span>
                                    : <span className={`text-[11px] font-bold ${i + 1 === active ? "text-white" : "text-slate-400"}`}>{i + 1}</span>
                                }
                            </div>
                            <div>
                                <p className={`text-[11px] font-bold leading-none ${i + 1 === active ? "text-[#c2410c]" : i + 1 < active ? "text-emerald-600" : "text-slate-400"}`}>{step.label}</p>
                                <p className={`text-[9px] leading-none mt-0.5 ${i + 1 === active ? "text-[#c2410c]" : "text-slate-300"}`}>{step.sub}</p>
                            </div>
                        </div>
                        {i < 2 && <div className={`flex-1 h-0.5 mx-2 ${i + 1 < active ? "bg-emerald-400" : "bg-slate-100"}`}></div>}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Confirm Dispatch Bottom Sheet
 |----------------------------------------------------------*/
function ConfirmSheet({ open, total_cartons, destination, vehicle, courier, notes, onClose, onConfirm }: {
    open: boolean; total_cartons: number; destination: Location;
    vehicle: Vehicle; courier: CourierInfo | null; notes: string;
    onClose: () => void; onConfirm: () => void;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#c2410c] text-[24px]">local_shipping</span>
                    </div>
                    <div>
                        <h3 className="text-[16px] font-bold text-gray-900">Confirm Dispatch?</h3>
                        <p className="text-[12px] text-slate-500">This action is binding and will alert all parties.</p>
                    </div>
                </div>
                <div className="space-y-2 mb-5">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                        <span className="text-[11px] text-slate-500">Destination</span>
                        <span className="text-[12px] font-bold text-gray-900">{destination.name}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                        <span className="text-[11px] text-slate-500">Carrier</span>
                        <span className="text-[12px] font-mono font-bold text-gray-900">{vehicle.plate}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                        <span className="text-[11px] text-slate-500">Driver</span>
                        <span className="text-[12px] font-bold text-gray-900">{courier?.name ?? "Unassigned"}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                        <span className="text-[11px] text-slate-500">Cartons</span>
                        <span className="text-[12px] font-bold text-gray-900">{total_cartons}</span>
                    </div>
                    {notes && (
                        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                            <span className="text-[10px] font-bold text-amber-700 uppercase block mb-0.5">Driver Note</span>
                            <p className="text-[11px] text-amber-900">{notes}</p>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-sm font-bold shadow-sm active:scale-95 transition-transform">Confirm & Dispatch</button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function SellerReplenishReview({
    transfer_id, reference, origin, destination, distance_km,
    scheduled_run, cutoff_label, slot, vehicle, manifest_items,
    total_cbm, total_kg, total_cartons, courier, can_dispatch,
    agreements, schedule_options, agreed_scheduled_for,
    outstanding_parties, actionable_parties, workflow_status,
}: Props) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [notes, setNotes] = useState("");
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const [dispatching, setDispatching] = useState(false);
    const [agreeing, setAgreeing] = useState(false);

    /**
     * The gate as recorded, not as assumed. This screen used to show all four
     * parties ticked the moment it loaded, so a seller pressed Dispatch on a
     * run the driver and both docks had never agreed to and got a silent
     * failure back.
     */
    const hasAgreed = (party: PartyKey) =>
        party === "creator"
            ? agreements.creator.status === "created" || agreements.creator.status === "accepted"
            : agreements[party].status === "accepted";

    const slotLabel = (party: PartyKey) => {
        const agreed = agreements[party].agreed_time;
        if (!agreed) return hasAgreed(party) ? "Agreed" : "Pending";
        return agreed.replace("T", " • ").slice(5);
    };

    const cbmPercent = Math.round((total_cbm / vehicle.max_cbm) * 100);
    const kgPercent  = Math.round((total_kg  / vehicle.payload_kg) * 100);
    const loadState: "healthy" | "warning" | "over" =
        cbmPercent > 100 ? "over" : cbmPercent > 85 ? "warning" : "healthy";

    const handleDispatch = () => {
        setDispatching(true);
        setConfirmOpen(false);
        router.post(
            route("seller.shipments.dispatch", transfer_id),
            { notes },
            { onFinish: () => setDispatching(false) },
        );
    };

    const handleAgree = (party: PartyKey, agreeSlot: string, stance: "accepted" | "rescheduled") => {
        setAgreeing(true);
        router.post(
            route("seller.shipments.agree", transfer_id),
            { party, slot: agreeSlot, stance },
            {
                preserveScroll: true,
                onSuccess: () => setActivePartyModal(null),
                onFinish: () => setAgreeing(false),
            },
        );
    };

    return (
        <>
            <Head title="Review & Dispatch" />

            {/* Top Context Strip */}
            <div className="px-4 pt-3 pb-2.5 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <button onClick={() => router.get(route("seller.shipments.show", transfer_id))}
                        className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 flex items-center justify-center mr-1 active:scale-95 transition-all text-slate-600"
                        aria-label="Back">
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    </button>
                    <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>fact_check</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phase 2 of 3</p>
                        <p className="text-[15px] font-bold text-gray-900 leading-tight">Review & Dispatch</p>
                    </div>
                </div>
            </div>

            <div className="px-3.5 pt-3 pb-52 space-y-3">

                {/* Phase Stepper */}
                <PhaseStepper active={2} />

                {/* Agreement gate banner. The load being within limits is not the
                    same as the run being clear to go: picking and dispatch are
                    blocked until the driver and both docks accept a window. */}
                {!can_dispatch && (
                    <div className="p-3.5 rounded-2xl border border-amber-300 bg-amber-50 flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-600 text-[22px] shrink-0">hourglass_top</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-amber-900">
                                {manifest_items.length === 0 ? "Manifest is empty" : "Waiting on the agreement gate"}
                            </p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                {manifest_items.length === 0
                                    ? "Add at least one line before this run can be dispatched."
                                    : outstanding_parties.length > 0
                                    ? `Still awaiting ${outstanding_parties.join(", ")}.`
                                    : "All four parties must accept the same window."}
                            </p>
                        </div>
                    </div>
                )}

                {/* Load Validation Banner */}
                {can_dispatch && loadState === "healthy" && (
                    <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-center gap-3">
                        <span className="material-symbols-outlined text-emerald-600 text-[22px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-bold text-emerald-900">Ready for Dispatch</p>
                                <span className="text-[11px] font-bold text-emerald-700">{cbmPercent}% Cap</span>
                            </div>
                            <p className="text-[11px] text-emerald-700 mt-0.5">Load is within carrier limits.</p>
                        </div>
                    </div>
                )}
                {loadState === "warning" && (
                    <div className="p-3.5 rounded-2xl border border-amber-300 bg-amber-50 flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-600 text-[22px] shrink-0">warning_amber</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-bold text-amber-900">Near Capacity ({cbmPercent}%)</p>
                                <span className="text-[11px] font-bold text-amber-700">{total_cbm.toFixed(1)}/{vehicle.max_cbm} m³</span>
                            </div>
                            <p className="text-[11px] text-amber-700 mt-0.5">Load is near carrier limit — review before dispatching.</p>
                        </div>
                    </div>
                )}
                {loadState === "over" && (
                    <div className="p-3.5 rounded-2xl border border-red-300 bg-red-50">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-red-600 text-[22px] shrink-0">error</span>
                            <div>
                                <p className="text-[13px] font-bold text-red-900">Over-Capacity!</p>
                                <p className="text-[11px] text-red-700">+{(total_cbm - vehicle.max_cbm).toFixed(1)} m³ EXCEEDED. Reduce cartons.</p>
                            </div>
                        </div>
                        <button onClick={() => router.get(route("seller.shipments.show", transfer_id))}
                            className="w-full py-2 rounded-xl bg-red-600 text-white text-[12px] font-bold">
                            Return to Manifest
                        </button>
                    </div>
                )}

                {/* Corridor & Carrier Card */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Corridor & Carrier</p>
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200/60">
                            <span className="material-symbols-outlined text-amber-700 text-[12px]">timer</span>
                            <span className="text-[10px] font-bold text-amber-800">{cutoff_label}</span>
                        </div>
                    </div>

                    {/* Route */}
                    <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 mb-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Origin</p>
                            <p className="text-[13px] font-bold text-gray-900 truncate">{origin.name}</p>
                        </div>
                        <div className="flex flex-col items-center shrink-0">
                            <span className="material-symbols-outlined text-[#c2410c] text-[18px]">arrow_forward</span>
                            <span className="text-[9px] text-slate-400">{distance_km} km</span>
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Destination</p>
                            <p className="text-[13px] font-bold text-gray-900 truncate">{destination.name}</p>
                        </div>
                    </div>

                    {/* Carrier Row */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Carrier</p>
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-slate-500">local_shipping</span>
                                <span className="text-[12px] font-mono font-bold text-gray-900 truncate">{vehicle.plate}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{vehicle.name}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Scheduled Time</p>
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-[#c2410c]">schedule</span>
                                <span className="text-[12px] font-bold text-[#c2410c]">{slot}</span>
                            </div>
                        </div>
                    </div>

                    {/* Load Metrics */}
                    <div className="mt-3 space-y-2">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-slate-500">Volume</span>
                                <span className="text-[11px] font-bold font-mono text-gray-800">{total_cbm.toFixed(1)} / {vehicle.max_cbm} m³ ({cbmPercent}%)</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${cbmPercent > 85 ? "bg-red-500" : "bg-[#c2410c]"}`}
                                    style={{ width: `${Math.min(cbmPercent, 100)}%` }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-slate-500">Mass</span>
                                <span className="text-[11px] font-bold font-mono text-gray-800">{Math.round(total_kg).toLocaleString()} / {vehicle.payload_kg.toLocaleString()} kg ({kgPercent}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${kgPercent > 90 ? "bg-red-500" : "bg-slate-400"}`}
                                    style={{ width: `${Math.min(kgPercent, 100)}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4-Party Consensus Gate */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[13px] font-bold text-gray-900">4-Party Agreement Gate</p>
                            <p className="text-[10px] text-slate-400">
                                {outstanding_parties.length === 0
                                    ? "All four agreed — clear to dispatch"
                                    : `Awaiting ${outstanding_parties.join(", ")}`}
                            </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#c2410c] bg-orange-50 px-2 py-0.5 rounded-full">
                            {4 - outstanding_parties.length}/4 AGREED
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            { key: "creator" as PartyKey,     label: "1. Creator" },
                            { key: "fleet" as PartyKey,       label: "2. Fleet" },
                            { key: "origin" as PartyKey,      label: "3. Origin" },
                            { key: "destination" as PartyKey, label: "4. Destination" },
                        ]).map(({ key, label }) => ({
                            key,
                            label: `${label} (${agreements[key].role})`,
                            check: hasAgreed(key),
                            slot: slotLabel(key),
                        })).map(party => (
                            <button
                                key={party.key}
                                type="button"
                                onClick={() => setActivePartyModal(party.key)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left cursor-pointer active:scale-95 ${
                                    party.check ? "bg-emerald-50/60 border-emerald-100 hover:bg-emerald-100/60" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                                }`}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`material-symbols-outlined text-[16px] ${party.check ? "text-emerald-600" : "text-slate-400"}`}
                                        style={{ fontVariationSettings: party.check ? "'FILL' 1" : undefined }}>
                                        {party.check ? "check_circle" : "hourglass_empty"}
                                    </span>
                                    <span className={`text-[11px] font-bold truncate ${party.check ? "text-gray-800" : "text-slate-600"}`}>{party.label}</span>
                                </div>
                                <span className={`text-[10px] font-mono font-bold shrink-0 ml-1 ${party.check ? "text-emerald-700" : "text-amber-700"}`}>{party.slot}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Party Detail Modal Window (Opens on click for each party) ── */}
                <PartyDetailModal
                    open={activePartyModal !== null}
                    activeParty={activePartyModal ?? "creator"}
                    onClose={() => setActivePartyModal(null)}
                    onSelectParty={setActivePartyModal}
                    reference={reference}
                    scheduleOptions={schedule_options}
                    selectedSchedule={agreed_scheduled_for ?? schedule_options[0]}
                    agreedSlot={agreed_scheduled_for}
                    outstandingParties={outstanding_parties}
                    actionableParties={actionable_parties}
                    submitting={agreeing}
                    onAgree={handleAgree}
                    agreements={agreements}
                />

                {/* Manifest Summary */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[13px] font-bold text-gray-900">Manifest ({manifest_items.length} items)</p>
                        <button onClick={() => router.get(route("seller.shipments.show", transfer_id))}
                            className="flex items-center gap-1 text-[12px] font-semibold text-[#c2410c]">
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Adjust
                        </button>
                    </div>
                    <div className="space-y-2">
                        {manifest_items.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                                    <ItemStatusIcon icon={item.icon} />
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-gray-900 truncate">{item.name}</p>
                                        {statusBadge(item.status, item.status_label)}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[13px] font-bold text-[#c2410c]">{item.quantity}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{item.cbm.toFixed(1)} m³</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dispatch Notes */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[13px] font-bold text-gray-900 mb-2">Dispatch Notes</p>
                    <p className="text-[10px] text-slate-400 mb-2">Optional — driver instructions or special handling</p>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value.slice(0, 280))}
                        placeholder="Add driver instructions..."
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-[#c2410c]/30"
                    />
                    <p className="text-[10px] text-slate-300 text-right mt-1">{notes.length}/280</p>
                </div>

            </div>

            {/* Sticky Floating Action Bar (Positioned ABOVE SellerBottomNav) */}
            <div className="fixed left-0 right-0 z-40 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 pb-2 px-3.5 pointer-events-none" style={{ bottom: "calc(82px + env(safe-area-inset-bottom, 0px))" }}>
                <div className="max-w-[425px] mx-auto bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-xl rounded-2xl p-3 pointer-events-auto">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <span className="text-[15px] font-bold text-[#c2410c]">{total_cbm.toFixed(1)} / {vehicle.max_cbm} m³</span>
                            <span className="text-[11px] text-slate-400 ml-2">{total_cartons} Ctns</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            loadState === "healthy" ? "bg-emerald-100 text-emerald-700" :
                            loadState === "warning" ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                        }`}>{cbmPercent}% Cap</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => router.get(route("seller.shipments.show", transfer_id))}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-[13px] active:scale-95 transition-transform hover:bg-slate-50">
                            Back
                        </button>
                        <button onClick={() => setConfirmOpen(true)}
                            disabled={loadState === "over" || !can_dispatch || dispatching}
                            title={can_dispatch ? undefined : "All four parties must agree on a window first"}
                            className="flex-1 py-2.5 rounded-xl bg-[#c2410c] text-white font-bold text-[13px] shadow-sm disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-2 hover:bg-[#b23b0a]">
                            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                            {dispatching ? "Dispatching…" : can_dispatch ? "Confirm Dispatch" : "Awaiting Agreement"}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmSheet
                open={confirmOpen}
                total_cartons={total_cartons}
                destination={destination}
                vehicle={vehicle}
                courier={courier}
                notes={notes}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleDispatch}
            />
        </>
    );
}

SellerReplenishReview.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
