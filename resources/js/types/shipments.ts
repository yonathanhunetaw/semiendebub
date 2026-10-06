/**
 * Centralized TypeScript contracts for the Seller Shipments module
 * (resources/js/Pages/Seller/Shipments/** and resources/js/Components/Seller/Shipments/**).
 *
 * Party/agreement types are owned by PartyDetailModal and re-exported here so
 * this file remains the single import surface for shipment-related types.
 */
export type { PartyKey, PartyAgreementInfo, SubStockKeeper } from "@/Components/Seller/PartyDetailModal";
import type { PartyKey, PartyAgreementInfo } from "@/Components/Seller/PartyDetailModal";

/* ----------------------------------------------------------
 | Shared primitives
 |----------------------------------------------------------*/
export interface Location {
    name: string;
    detail: string;
}

export interface LocationOption {
    value: string;
    label: string;
}

/** Fully-resolved 4-party agreement map, keyed by party, as consumed by PartyDetailModal. */
export type PartyAgreementsMap = Record<PartyKey, PartyAgreementInfo>;

export interface StatusConfigEntry {
    label: string;
    color: string;
    icon: string;
}

/* ----------------------------------------------------------
 | Vehicle
 |----------------------------------------------------------*/
export interface Vehicle {
    id: string;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
    bay?: string | null;
    icon?: string;
    is_primary?: boolean;
}

/** A car from the fleet (App\Models\Fulfillment\Vehicle). */
export interface FleetVehicle {
    id: number;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
    status: "active" | "inactive";
}

/** A driver a run can be offered to. */
export interface CourierOption {
    id: number;
    name: string;
    phone?: string | null;
}

/** The creator's fleet choice for one run. */
export interface FleetChoice {
    vehicle_id: number | null;
    /** Empty means the run is open to every driver. */
    eligible_courier_ids: number[];
    eligible_couriers: { id: number; name: string }[];
}

/* ----------------------------------------------------------
 | Manifest items
 |----------------------------------------------------------*/
export type ManifestItemStatus = "oos" | "low" | "regular" | "sold";

export type ManifestItemDestination = "store" | "remote_warehouse";

export interface ManifestItemAddedBy {
    type: "auto" | "manual";
    name?: string;
    reason: string;
}

export interface ManifestItem {
    /** The variant id. */
    id: number;
    picked_quantity?: number;
    name: string;
    sku: string;
    pack_label?: string;
    status: ManifestItemStatus;
    status_label: string;
    stock_qty: number | null;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg?: number;
    location?: string;
    icon: string;
    target_dest?: ManifestItemDestination;
    added_by?: ManifestItemAddedBy;
}

/* ----------------------------------------------------------
 | Scheduled transfers (Shipments index / overview)
 |----------------------------------------------------------*/
export type ShipmentStatus =
    | "scheduled"
    | "pending"
    | "overdue"
    | "dispatched"
    | "en_route"
    | "shipped";

export interface ScheduledTransfer {
    id: number;
    reference: string;
    status: ShipmentStatus;
    origin: Location;
    destination: Location;
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
    /** Always sent by presentAsScheduledTransfer(); never inferred client-side. */
    agreements: PartyAgreementsMap;
    /** Final slot once all four parties aligned; null while pending. */
    agreed_scheduled_for?: string | null;
    /** Parties that have not yet accepted. */
    outstanding_parties?: PartyKey[];
    /** True when all four accepted the same slot. */
    can_schedule?: boolean;
    /** The real backend status, e.g. `pending_agreement`. */
    workflow_status?: WorkflowStatus;
    /** The pick → prepare → driver → receiver process once scheduled. */
    handoff?: import("@/types/shipment").ShipmentHandoff;
    fleet?: FleetChoice;
    /** Parties the signed-in user may tick on this shipment. */
    actionable_parties?: PartyKey[];
    /** Lifecycle steps the signed-in user's role may drive next. */
    allowed_transitions?: WorkflowStatus[];
}

/**
 * The backend lifecycle, distinct from the six-value display status the cards
 * use. `pending_agreement` is the 4-party consensus gate.
 */
export type WorkflowStatus =
    | "draft"
    | "pending_agreement"
    | "scheduled"
    | "picking"
    | "ready"
    | "dispatched"
    | "in_transit"
    | "delivered"
    | "received"
    | "cancelled";

/** One party's stance on the schedule. */
export type AgreementStance = "pending" | "accepted" | "rescheduled" | "created";

/** Payload for POST /{role}/shipments/{id}/agree */
export interface PartyAgreementSubmission {
    party?: PartyKey;
    slot: string;
    stance?: "accepted" | "rescheduled";
}

/* ----------------------------------------------------------
 | New shipment creation (Add Shipment sheet)
 |----------------------------------------------------------*/
export interface NewShipmentTimeWindow {
    date: string;
    time: string;
}

export interface NewShipmentInput {
    origin: string;
    destination: string;
    scheduledDate: string;
    scheduledTime: string;
    alternateOptions: NewShipmentTimeWindow[];
}

/* ----------------------------------------------------------
 | Manifest builder (Build / Review pages)
 |----------------------------------------------------------*/

/** A SKU the Add Items sheet may put on a manifest. */
export interface VariantOption {
    id: number;
    label: string;
    sku: string | null;
}

/** Another open run a manifest line can be moved onto. */
export interface MoveTarget {
    id: number;
    reference: string;
    destination: string;
    scheduled_run: string | null;
}

export interface CourierInfo {
    name: string;
    phone: string;
}

/**
 * The 4-party gate as the server sees it, shared by every screen that renders
 * PartyDetailModal. Both Build and Review previously invented this locally.
 */
export interface PartyGateProps {
    agreements: PartyAgreementsMap;
    schedule_options: string[];
    agreed_scheduled_for: string | null;
    outstanding_parties: PartyKey[];
    actionable_parties: PartyKey[];
    allowed_transitions: WorkflowStatus[];
    workflow_status: WorkflowStatus;
}
