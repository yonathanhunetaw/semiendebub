import React, { useState } from "react";
import { Link, router } from "@inertiajs/react";
import PartyDetailModal from "@/Components/Seller/PartyDetailModal";
import { TONES, statusTone } from "@/Components/Shared/ui";
import type { PartyKey, PartyAgreementsMap, ScheduledTransfer, StatusConfigEntry } from "@/types/shipments";

/* ----------------------------------------------------------
 | Status config
 |----------------------------------------------------------*/
// Colors come from the shared status map (Components/Shared/ui), so a status
// reads the same here as everywhere else; labels and icons stay card-specific.
const tone = (status: string) => TONES[statusTone(status)].pill;

const statusConfig: Record<string, StatusConfigEntry> = {
    dispatched: { label: "Dispatched",       color: tone("dispatched"), icon: "local_shipping" },
    scheduled:  { label: "Scheduled",        color: tone("scheduled"),  icon: "check_circle" },
    en_route:   { label: "En Route",         color: tone("en_route"),   icon: "route" },
    shipped:    { label: "Shipped",          color: tone("shipped"),    icon: "task_alt" },
    pending:    { label: "Pending Manifest", color: tone("pending"),    icon: "warning" },
    overdue:    { label: "Overdue",          color: tone("overdue"),    icon: "error" },
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
    /**
     * Route name for the card's "open" link. Defaults to the seller route so
     * the Seller screen is unchanged; the Delivery and StockKeeper screens
     * reuse this card by pointing it at their own show route.
     */
    showRoute?: string;
    /** Route name for POST {party, slot, stance}; defaults to the seller route. */
    agreeRoute?: string;
    /** Route name for PATCH {status}; defaults to the seller route. */
    transitionRoute?: string;
}

/** Button copy for each lifecycle step a role may drive. */
const STEP_LABELS: Record<string, string> = {
    scheduled: "Schedule",
    picking: "Start Picking",
    ready: "Mark Ready",
    dispatched: "Hand Over & Dispatch",
    in_transit: "Start Run",
    delivered: "Mark Delivered",
    received: "Confirm Receipt",
    cancelled: "Cancel Shipment",
};

const STEP_ICONS: Record<string, string> = {
    scheduled: "event_available",
    picking: "inventory",
    ready: "check_box",
    dispatched: "local_shipping",
    in_transit: "route",
    delivered: "where_to_vote",
    received: "inventory_2",
    cancelled: "cancel",
};

/* ----------------------------------------------------------
 | Transfer Selection Card
 |----------------------------------------------------------*/
/** Short copy for each hand-off stage (ShipmentHandoffService::stage). */
const HANDOFF_STAGE: Record<string, string> = {
    awaiting_picking: "Waiting for picking",
    picking: "Origin picking",
    prepared: "Ready for pickup",
    driver_on_way: "Driver on the way",
    driver_checked: "Driver checked load",
    en_route: "En route",
    arrived: "Arrived",
    receiver_checked: "Being signed in",
    finished: "Finished",
};

export default function TransferCard({
    t,
    showRoute = "seller.shipments.show",
    agreeRoute = "seller.shipments.agree",
    transitionRoute = "seller.shipments.transition",
}: TransferCardProps) {
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const [agreeing, setAgreeing] = useState(false);
    const [advancing, setAdvancing] = useState(false);
    const cfg = statusConfig[t.status] || statusConfig.scheduled;
    const creator = t.created_by || "Admin";
    const createdAt = t.created_at ? formatDateTime(t.created_at) : "Today • 06:14 AM";
    const loadPercent = t.load_percentage ?? (t.vehicle_max_cbm && t.total_cbm ? Math.round((t.total_cbm / t.vehicle_max_cbm) * 100) : 60);

    /**
     * 4-party agreement state, exactly as the server recorded it.
     *
     * Every screen that renders this card is fed by presentAsScheduledTransfer(),
     * which always sends the real stances, so the ticks reflect who has actually
     * agreed. There used to be a fallback here that invented a driver, two
     * keepers and a receiver and derived their stances from the shipment status —
     * it showed the origin dock as "packed 80 cartons" on runs nobody had
     * touched.
     */
    const agreements: PartyAgreementsMap = t.agreements;

    // Proposing the schedule is the creator's agreement; the server records it
    // as "created" (or "accepted" when ticked by hand). It used to wait for
    // dispatch, so the card said "Pending" while Build showed the creator ticked.
    // Past the gate: the card shows the hand-off instead.
    const underway = !["draft", "pending_agreement", "cancelled", undefined].includes(t.workflow_status);

    const creatorAgreed = agreements.creator.status === "created" || agreements.creator.status === "accepted";

    /*
     * Lifecycle steps come from the server (`allowed_transitions`), already
     * narrowed to this viewer's role, so a button here can never trigger a
     * transition the backend would refuse.
     */
    const StepButtons = (): React.ReactElement => (
        <>
            {(t.allowed_transitions ?? [])
                            .filter(step => step in STEP_LABELS)
                            .map(step => (
                                <button
                                    key={step}
                                    type="button"
                                    disabled={advancing}
                                    onClick={() => {
                                        setAdvancing(true);
                                        router.patch(
                                            route(transitionRoute, t.id),
                                            { status: step },
                                            { preserveScroll: true, onFinish: () => setAdvancing(false) },
                                        );
                                    }}
                                    className={`w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50 ${
                                        step === "cancelled"
                                            ? "bg-surface-container-lowest border border-error/30 text-error"
                                            : "bg-primary text-on-primary shadow-md"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{STEP_ICONS[step]}</span>
                                    {STEP_LABELS[step]}
                                </button>
                            ))}
        </>
    );

    return (
        <div className={`bg-surface-container-lowest rounded-2xl border ${t.status === "overdue" ? "border-error/30 shadow-sm" : "border-outline-variant/60 shadow-sm"} p-4 relative overflow-hidden`}>
            {t.status === "overdue" && <div className="absolute left-0 top-0 bottom-0 w-1 bg-error"></div>}

            {/* ── Status & Title (No redundant Created by Admin here) ── */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-[14px] font-bold text-on-surface tracking-tight">{t.origin.name} → {t.destination.name}</p>
                    <p className="text-[10px] font-mono text-outline mt-0.5">{t.reference}</p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${cfg.color} shrink-0`}>
                    <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">{cfg.label}</span>
                </div>
            </div>

            {/* ── Schedule Strip (Scheduled Time) ── */}
            <div className="flex items-center gap-3 bg-surface-container-low p-2.5 rounded-xl mb-4 border border-outline-variant/60">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-[18px] text-on-primary">schedule</span>
                </div>
                <div className="flex-1">
                    <p className="text-[9px] font-bold text-outline uppercase tracking-wider mb-0.5">Scheduled Time</p>
                    <p className="text-[13px] font-bold text-primary">{formatDateTime(t.scheduled_run)}</p>
                </div>
                <div className="text-right shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide uppercase ${t.status === "overdue" ? "bg-error-container text-on-error-container" : "bg-warning-container text-on-warning-container"}`}>
                        {t.cutoff_label}
                    </span>
                </div>
            </div>

            {/* ── Stats (with Volume in between Cartons and SLOT) ── */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-surface-container-low p-2 rounded-xl text-center border border-outline-variant/60">
                    <p className="text-[9px] font-bold text-outline uppercase tracking-wider mb-0.5">SKUs</p>
                    <p className="text-[14px] font-bold font-mono text-on-surface">{t.sku_count}</p>
                </div>
                <div className="bg-surface-container-low p-2 rounded-xl text-center border border-outline-variant/60">
                    <p className="text-[9px] font-bold text-outline uppercase tracking-wider mb-0.5">Cartons</p>
                    <p className="text-[14px] font-bold font-mono text-on-surface">{t.total_cartons}</p>
                </div>
                <div className="bg-surface-container-low p-2 rounded-xl text-center border border-outline-variant/60">
                    <p className="text-[9px] font-bold text-outline uppercase tracking-wider mb-0.5">Volume</p>
                    <p className="text-[14px] font-bold font-mono text-on-surface">
                        {loadPercent}%
                    </p>
                </div>
                <div className="bg-surface-container-low p-2 rounded-xl text-center border border-outline-variant/60">
                    <p className="text-[9px] font-bold text-outline uppercase tracking-wider mb-0.5 truncate">{t.slot || "BAY"}</p>
                    <p className="text-[12px] font-bold font-mono text-on-surface truncate">{t.vehicle_plate}</p>
                </div>
            </div>

            {/* ── Conditional Bottom Section: hand-off progress vs 4-Party Gate ── */}
            {underway && t.handoff ? (
                <div className="border-t border-outline-variant/60 pt-4 mt-2">
                    <div className="flex items-center justify-between mb-2.5">
                        <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Hand-off</p>
                        <span className="text-[10px] font-bold text-primary">{HANDOFF_STAGE[t.handoff.stage] ?? t.handoff.stage}</span>
                    </div>
                    {/* Pick → driver → road → receive */}
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {([
                            { label: "Prepared", done: !!t.handoff.times.prepared, icon: "inventory_2" },
                            { label: "Driver signed", done: !!t.handoff.times.courier_signed, icon: "draw" },
                            { label: "Arrived", done: !!t.handoff.times.arrived, icon: "flag" },
                            { label: "Received", done: !!t.handoff.times.received, icon: "move_to_inbox" },
                        ]).map(s => (
                            <div key={s.label} className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border ${s.done ? "bg-success-container/40 border-success/25" : "bg-surface-container-low border-outline-variant/60"}`}>
                                <span className={`material-symbols-outlined text-[16px] ${s.done ? "text-success" : "text-outline"}`}>{s.done ? "check_circle" : s.icon}</span>
                                <span className={`text-[9px] font-bold leading-tight text-center ${s.done ? "text-on-success-container" : "text-on-surface-variant"}`}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                    {!t.handoff.times.prepared && (
                        <div>
                            <div className="flex justify-between text-[10px] font-bold text-on-surface-variant mb-1">
                                <span>Origin preparation</span>
                                <span>{t.handoff.preparation.lines_picked}/{t.handoff.preparation.lines} lines · {t.handoff.preparation.percent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${t.handoff.preparation.percent}%` }} />
                            </div>
                        </div>
                    )}
                    {showRoute && (
                        <button type="button" onClick={() => router.visit(route(showRoute, t.id))}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary text-[12px] font-bold active:scale-95 transition-transform">
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            {t.handoff.available_steps.length > 0 ? "Open — your step is ready" : "Open hand-off"}
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* ── 4-Party Agreement Gate ── */}
                    <div className="border-t border-outline-variant/60 pt-3 mb-4">
                        <div className="flex items-center justify-between mb-2.5">
                            <div>
                                <p className="text-[10px] font-bold text-outline uppercase tracking-wider">4-Party Agreement Gate</p>
                                <p className="text-[9px] text-outline">Tap any party to view details</p>
                            </div>
                            <span className="text-[9px] font-bold text-primary bg-primary-container/60 px-1.5 py-0.5 rounded-full border border-primary/15">ALL 4 REQ</span>
                        </div>

                        {/* 4 Party Status Clickable Buttons */}
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                            {[
                                { key: "creator" as PartyKey,     label: "1. Creator", sub: creatorAgreed ? "Created" : "Pending", icon: "person",         agreed: creatorAgreed },
                                { key: "fleet" as PartyKey,       label: "2. Fleet",   sub: "Carrier", icon: "local_shipping", agreed: agreements.fleet.status === "accepted" },
                                { key: "origin" as PartyKey,      label: "3. Origin",  sub: "Depot",   icon: "warehouse",      agreed: agreements.origin.status === "accepted" },
                                { key: "destination" as PartyKey, label: "4. Dest.",   sub: agreements.destination.stock_keepers ? "2 SKs" : "Store", icon: "storefront", agreed: agreements.destination.status === "accepted" },
                            ].map((p, idx) => {
                                const color = p.agreed ? "bg-success-container text-on-success-container border-success/30" : "bg-surface-container-low text-outline border-outline-variant";
                                return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setActivePartyModal(p.key)}
                                    className={`flex flex-col items-center p-1.5 rounded-xl border transition-all text-center cursor-pointer hover:shadow-xs active:scale-95 ${
                                        p.agreed ? 'border-success/20 bg-success-container/30 hover:bg-success-container/60' : 'border-outline-variant/60 bg-surface-container-low hover:bg-surface-container'
                                    }`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 border ${color} shrink-0`}>
                                        <span className="material-symbols-outlined text-[13px]">{p.icon}</span>
                                    </div>
                                    <span className={`text-[8px] font-bold leading-tight w-full truncate ${p.agreed ? 'text-on-success-container' : 'text-on-surface-variant'}`}>{p.label}</span>
                                    <span className="text-[7px] text-outline leading-tight w-full truncate">{p.sub}</span>
                                    <div className="mt-1 flex items-center justify-center w-full">
                                        {p.agreed
                                            ? <span className="material-symbols-outlined text-[12px] text-success">check_circle</span>
                                            : <span className="material-symbols-outlined text-[12px] text-outline">hourglass_empty</span>
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
                    selectedSchedule={t.agreed_scheduled_for ?? t.schedule_options?.[0]}
                    agreedSlot={t.agreed_scheduled_for ?? null}
                    outstandingParties={t.outstanding_parties ?? []}
                    actionableParties={t.actionable_parties ?? []}
                    submitting={agreeing}
                    onAgree={(party, slot, stance) => {
                        setAgreeing(true);
                        router.post(
                            route(agreeRoute, t.id),
                            { party, slot, stance },
                            {
                                preserveScroll: true,
                                onFinish: () => setAgreeing(false),
                                onSuccess: () => setActivePartyModal(null),
                            },
                        );
                    }}
                    agreements={agreements}
                />

                    {/* ── Actions ── */}
                    <div className="space-y-1.5">
                        <Link href={route(showRoute, t.id)}
                            className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-[13px] font-bold active:scale-95 transition-transform hover:bg-surface-container hover:border-outline/50">
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">build</span>
                            Build Manifest
                        </Link>

                        <StepButtons />
                    </div>
                </>
            )}
        </div>
    );
}
