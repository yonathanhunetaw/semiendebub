import { Head, Link } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import HandoffPanel from "@/Components/Shipment/HandoffPanel";
import { AgreementPanel, ManifestTable, ShipmentTimeline } from "@/Components/Shipment/shipmentUi";
import ShipmentReceiptPanel from "@/Components/StockKeeper/ShipmentReceiptPanel";
import { StatusPill, type Tone } from "@/Components/Shared/ui";
import { SkCard, SkCardHeader, fmt, when } from "@/Components/StockKeeper/skKit";
import type { ShipmentStatus, StockKeeperShipmentShowProps } from "@/types/shipment";

/** Statuses after the four parties agreed, when the hand-off is under way. */
const HANDOFF_STATUSES = ["scheduled", "picking", "ready", "dispatched", "in_transit", "delivered", "received"];

const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; tone: Tone; icon: string }> = {
    draft: { label: "Draft", tone: "neutral", icon: "edit_note" },
    pending_agreement: { label: "Waiting for agreement", tone: "warning", icon: "handshake" },
    scheduled: { label: "Scheduled", tone: "info", icon: "event" },
    picking: { label: "Picking", tone: "warning", icon: "inventory" },
    ready: { label: "Ready for pickup", tone: "info", icon: "inventory_2" },
    dispatched: { label: "Dispatched", tone: "info", icon: "local_shipping" },
    in_transit: { label: "On the road", tone: "info", icon: "route" },
    delivered: { label: "Arrived", tone: "success", icon: "flag" },
    received: { label: "Received", tone: "success", icon: "task_alt" },
    cancelled: { label: "Cancelled", tone: "error", icon: "cancel" },
};

/**
 * One shipment (a hub run of many items) at the keeper's dock.
 *
 * Before scheduling: agree to a window. After: the origin keeper picks and
 * prepares the load; the destination keeper counts what arrived and signs it
 * in. The hand-off panel only offers the steps this keeper can take.
 */
export default function StockKeeperShipmentShow({ shipment }: StockKeeperShipmentShowProps): React.ReactElement {
    const underway = HANDOFF_STATUSES.includes(shipment.status) && shipment.handoff;
    const status = SHIPMENT_STATUS[shipment.status];
    const load = Math.min(100, Math.max(0, shipment.load_percentage ?? 0));
    const receiving = shipment.status === "delivered" && shipment.handoff?.available_steps.some((step) => step === "receiver_check" || step === "receiver_sign");

    return (
        <>
            <Head title={`Shipment ${shipment.reference}`} />

            <Link href={route("stock_keeper.shipments.index")} className="mb-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Shipments
            </Link>

            {/* Route, status, vehicle and load */}
            <SkCard className="mb-4 overflow-hidden lg:mb-6">
                <div className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <p className="font-mono text-[13px] font-bold text-on-surface-variant">{shipment.reference}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[20px] font-extrabold text-on-surface sm:text-[24px]">
                            <span className="truncate">{shipment.origin.name}</span>
                            <span className="material-symbols-outlined text-[24px] text-primary">arrow_forward</span>
                            <span className="truncate">{shipment.destination.name}</span>
                        </div>
                        <p className="text-[13px] text-on-surface-variant">
                            {[shipment.origin.detail, shipment.destination.detail].filter(Boolean).join(" → ")}
                            {shipment.distance_km ? ` · ${fmt(shipment.distance_km, 1)} km` : ""}
                        </p>
                    </div>
                    <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
                </div>

                <div className="grid grid-cols-2 gap-px border-t border-outline-variant/70 bg-outline-variant/50 sm:grid-cols-4">
                    {[
                        { label: "Vehicle", value: shipment.vehicle_name ?? "Not set", hint: shipment.vehicle_plate ?? undefined },
                        { label: "Courier", value: shipment.courier?.name ?? "Not claimed", hint: shipment.courier?.phone ?? undefined },
                        { label: "Scheduled", value: when(shipment.scheduled_for), hint: shipment.eta ? `ETA ${when(shipment.eta)}` : undefined },
                        { label: "Load", value: `${fmt(shipment.sku_count)} SKUs · ${fmt(shipment.total_units)} units`, hint: `${fmt(shipment.total_cbm, 2)} m³ · ${fmt(shipment.total_weight, 1)} kg` },
                    ].map((cell) => (
                        <div key={cell.label} className="bg-surface-container-lowest px-4 py-3">
                            <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{cell.label}</p>
                            <p className="truncate text-[14px] font-bold text-on-surface">{cell.value}</p>
                            {cell.hint && <p className="truncate text-[12px] text-on-surface-variant">{cell.hint}</p>}
                        </div>
                    ))}
                </div>

                {shipment.vehicle_max_cbm ? (
                    <div className="border-t border-outline-variant/70 px-4 py-3">
                        <div className="mb-1 flex justify-between text-[12px] font-bold text-on-surface-variant">
                            <span>Vehicle load</span>
                            <span>
                                {load}% of {fmt(shipment.vehicle_max_cbm, 1)} m³
                            </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-[999px] bg-surface-container">
                            <div className={`h-full rounded-[999px] ${load >= 100 ? "bg-error" : load >= 85 ? "bg-warning" : "bg-primary"}`} style={{ width: `${load}%` }} />
                        </div>
                    </div>
                ) : null}
                {(shipment.notes || shipment.cancel_reason || shipment.gate_pass) && (
                    <div className="border-t border-outline-variant/70 px-4 py-3 text-[13px] text-on-surface-variant">
                        {shipment.gate_pass && (
                            <p>
                                Gate pass <b className="font-mono text-on-surface">{shipment.gate_pass}</b>
                            </p>
                        )}
                        {shipment.notes && <p>“{shipment.notes}”</p>}
                        {shipment.cancel_reason && <p className="font-bold text-error">Cancelled: {shipment.cancel_reason}</p>}
                    </div>
                )}
            </SkCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-6">
                <div className="min-w-0">
                    {/* The receiving dock counts what arrived before signing it in. */}
                    {receiving ? <ShipmentReceiptPanel shipmentId={shipment.id} lines={shipment.items} /> : null}
                    {underway && shipment.handoff ? (
                        <HandoffPanel
                            shipmentId={shipment.id}
                            reference={shipment.reference}
                            handoff={shipment.handoff}
                            lines={shipment.items}
                            stepRoute="stock_keeper.shipments.step"
                            originName={shipment.origin.name}
                            destinationName={shipment.destination.name}
                        />
                    ) : (
                        <AgreementPanel shipment={shipment} agreeRoute="stock_keeper.shipments.agree" />
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
                    {underway ? <AgreementPanel shipment={shipment} agreeRoute="stock_keeper.shipments.agree" /> : null}

                    <SkCard className="overflow-hidden">
                        <SkCardHeader icon="list_alt" title={`Manifest (${shipment.items.length})`} />
                        <ManifestTable shipment={shipment} showPicked showCoverage />
                    </SkCard>

                    <SkCard>
                        <SkCardHeader icon="timeline" title="Timeline" />
                        <div className="p-4">
                            <ShipmentTimeline shipment={shipment} />
                        </div>
                    </SkCard>
                </div>
            </div>
        </>
    );
}

StockKeeperShipmentShow.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
