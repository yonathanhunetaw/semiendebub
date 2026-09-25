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

/** Partial agreement data as it may arrive from the backend, before defaults are filled in. */
export interface ShipmentAgreements {
    creator?: PartyAgreementInfo;
    fleet?: PartyAgreementInfo;
    origin?: PartyAgreementInfo;
    destination?: PartyAgreementInfo;
}

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
    id: number;
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
    agreements?: ShipmentAgreements;
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
