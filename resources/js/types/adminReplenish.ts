/**
 * Centralized TypeScript contracts for the Admin Replenish (Shipments) module
 * (resources/js/Pages/Admin/Inventory/Replenish/** and its future
 * resources/js/Components/Admin/Inventory/Replenish/** extractions).
 *
 * This module is MUI-first (unlike the Tailwind-based Seller/Shipments
 * module): status badges are rendered MUI <Chip> nodes with an MUI color,
 * not Tailwind class strings. The 4-party agreement data shapes below
 * mirror Seller/Shipments' feature (same fields, framework-agnostic data)
 * but are defined natively here rather than imported from
 * "@/Components/Seller/PartyDetailModal" — an Admin module type file
 * should not depend on a Seller component.
 */
import type { ReactElement } from "react";

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

/** MUI Chip/Button `color` prop values used throughout this module. */
export type MuiStatusColor = "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

export interface StatusConfigEntry {
    label: string;
    color: MuiStatusColor;
    /** MUI <Chip icon> requires a ReactElement, not the broader ReactNode. */
    icon: ReactElement;
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
    pack_label: string;
    status?: ManifestItemStatus;
    status_label?: string;
    stock_qty?: number | null;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg: number;
    location?: string;
    icon?: string;
    target_dest?: ManifestItemDestination;
    added_by?: ManifestItemAddedBy;
}

export interface StatusColorEntry {
    chipColor: MuiStatusColor;
}

/** Reference option used by the "Move Item" dialog to pick a sibling shipment. */
export interface SiblingTransfer {
    id: number;
    label: string;
}

/* ----------------------------------------------------------
 | Scheduled transfers (Replenish index)
 |----------------------------------------------------------*/
export type ReplenishTransferStatus =
    | "scheduled"
    | "pending"
    | "overdue"
    | "dispatched"
    | "en_route"
    | "shipped";

export interface ScheduledTransfer {
    id: number;
    reference: string;
    status: ReplenishTransferStatus;
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    sku_count: number;
    total_cartons: number;
    vehicle_name: string;
    vehicle_plate: string;
    slot: string;
    created_by?: string;
    created_at?: string;
    /** Alternate run-time proposals gathered at creation time; editable in Build Manifest. */
    schedule_options?: string[];
    agreements?: ShipmentAgreements;
}

/* ----------------------------------------------------------
 | New shipment creation (Add Shipment dialog)
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
 | 4-Party Agreement Gate (MUI-native)
 |----------------------------------------------------------*/
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

/** Fully-resolved 4-party agreement map, keyed by party — the shape an MUI PartyDetailDialog would consume. */
export type PartyAgreementsMap = Record<PartyKey, PartyAgreementInfo>;

/** Partial agreement data as it may arrive from the backend, before defaults are filled in. */
export interface ShipmentAgreements {
    creator?: PartyAgreementInfo;
    fleet?: PartyAgreementInfo;
    origin?: PartyAgreementInfo;
    destination?: PartyAgreementInfo;
}

/* ----------------------------------------------------------
 | Dispatch tracking (Dispatched page)
 |----------------------------------------------------------*/
export interface Driver {
    name: string;
    phone: string;
}
