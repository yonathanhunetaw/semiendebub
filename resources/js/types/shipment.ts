import type { CourierOption, FleetChoice, FleetVehicle } from "@/types/shipments";

/**
 * Shared TypeScript contracts for the cross-role shipment domain
 * (Admin, Seller, StockKeeper and Delivery all render these same shapes).
 *
 * Mirrors App\Services\ShipmentWorkflowService::present().
 */

/** The one shipment lifecycle, shared by every role. */
export type ShipmentStatus =
    | "draft"
    // The 4-party consensus gate. Missing here while present() has always
    // returned it, so any screen switching on the status fell through its
    // default for exactly the stage that needs the most attention.
    | "pending_agreement"
    | "scheduled"
    | "picking"
    | "ready"
    | "dispatched"
    | "in_transit"
    | "delivered"
    | "received"
    | "cancelled";

/** Can the origin cover this manifest line right now? */
export type LineCoverage = "ok" | "low" | "oos";

/* ----------------------------------------------------------
 | The 4-party agreement gate
 |
 | A run carries a set of proposed time windows. The creator, the fleet, the
 | origin dock and the destination dock each accept one — and only when all four
 | land on the *same* window does the run become schedulable. Nothing moves
 | before that, which is why every role needs to see and act on it.
 |----------------------------------------------------------*/

export type PartyKey = "creator" | "fleet" | "origin" | "destination";

/** `created` is the creator's own accepted state, as the UI labels it. */
export type PartyStance = "pending" | "accepted" | "rescheduled" | "created";

export interface PartyAgreement {
    title: string;
    role: string;
    party: string;
    status: PartyStance;
    status_label: string;
    detail: string;
    /** The window this party accepted, or null while pending. */
    agreed_time: string | null;
    /** The person who ticked this party, when someone has. */
    actor?: string | null;
    /** Who works this end, or the drivers offered the run. */
    people?: { name: string; as: string }[];
}

export type PartyAgreements = Record<PartyKey, PartyAgreement>;

export interface ShipmentEndpoint {
    id: number;
    name: string;
    detail: string | null;
}

export interface ShipmentCourier {
    id: number;
    name: string;
    phone: string | null;
}

export interface ShipmentLine {
    id: number;
    variant_id: number;
    name: string;
    sku: string | null;
    quantity: number;
    picked_quantity: number;
    shortfall: number;
    unit: string | null;
    cbm: number | null;
    weight_kg: number | null;
    location: string | null;
    /** Units on hand at the origin store. */
    stock_qty: number;
    coverage: LineCoverage;
}

/** A hand-off step after scheduling (ShipmentHandoffService::STEPS). */
export type HandoffStep =
    | "start_picking"
    | "pick_line"
    | "prepared"
    | "courier_start"
    | "courier_check"
    | "courier_sign"
    | "courier_arrive"
    | "receiver_check"
    | "receiver_sign";

/** Where the hand-off stands (ShipmentHandoffService::stage). */
export type HandoffStage =
    | "awaiting_picking"
    | "picking"
    | "prepared"
    | "driver_on_way"
    | "driver_checked"
    | "en_route"
    | "arrived"
    | "receiver_checked"
    | "finished"
    | string;

/** The pick → prepare → driver → receiver process, as the server sees it. */
export interface ShipmentHandoff {
    stage: HandoffStage;
    preparation: {
        units_asked: number;
        units_picked: number;
        lines: number;
        lines_picked: number;
        percent: number;
        /** The pickup bay the load was prepared in. */
        bay: string | null;
    };
    times: {
        scheduled_for: string | null;
        picking_started: string | null;
        prepared: string | null;
        courier_started: string | null;
        courier_checked: string | null;
        courier_signed: string | null;
        arrived: string | null;
        receiver_checked: string | null;
        received: string | null;
    };
    people: { prepared_by: string | null; courier: string | null; received_by: string | null };
    signatures: { courier: string | null; receiver: string | null };
    /** Steps the viewer can take right now. */
    available_steps: HandoffStep[];
    labels: Record<HandoffStep, string>;
}

/** A manifest line as the hand-off panel needs it. */
export interface HandoffLine {
    variant_id: number;
    name: string;
    sku: string | null;
    quantity: number;
    picked_quantity: number;
    unit: string | null;
}

export interface Shipment {
    handoff?: ShipmentHandoff;
    id: number;
    reference: string;
    status: ShipmentStatus;
    origin: ShipmentEndpoint;
    destination: ShipmentEndpoint;
    vehicle_name: string | null;
    vehicle_plate: string | null;
    vehicle_max_cbm: number | null;
    /** The car from the fleet and the drivers the run is offered to. */
    fleet?: FleetChoice;
    load_percentage: number;
    courier: ShipmentCourier | null;
    created_by: string | null;
    sku_count: number;
    total_units: number;
    total_cbm: number;
    total_weight: number;
    distance_km: number | null;
    slot: string | null;
    gate_pass: string | null;
    notes: string | null;
    cancel_reason: string | null;
    scheduled_for: string | null;
    picked_at: string | null;
    dispatched_at: string | null;
    in_transit_at: string | null;
    delivered_at: string | null;
    received_at: string | null;
    eta: string | null;
    created_at: string | null;
    /**
     * Statuses THIS role may move the shipment to next, already intersected
     * server-side with the state machine. The UI never invents a move.
     */
    allowed_transitions: ShipmentStatus[];
    items: ShipmentLine[];

    /* -- the agreement gate -- */
    /** Windows on the table, earliest proposal first. */
    schedule_options: string[];
    agreements: PartyAgreements;
    /** The window all four aligned on; null until they do. */
    agreed_scheduled_for: string | null;
    /** Parties yet to accept. */
    outstanding_parties: PartyKey[];
    /** True once all four accepted the same window. */
    can_schedule: boolean;
    /** Parties the signed-in user may tick — drives whether to offer the action. */
    actionable_parties: PartyKey[];
}

export interface StoreOption {
    id: number;
    name: string;
    location: string | null;
}

export interface VariantOption {
    id: number;
    label: string;
    sku: string | null;
}

export interface Pagination {
    current_page: number;
    last_page: number;
    total: number;
}

export interface Flash {
    success?: string | null;
    error?: string | null;
}

export interface SharedProps {
    flash?: Flash;
}

/* ----------------------------------------------------------
 | Page props
 |----------------------------------------------------------*/

export interface AdminShipmentIndexProps extends SharedProps {
    shipments: Shipment[];
    counts: Record<string, number>;
    filters: { status: string };
    stores: StoreOption[];
    /** Main Hubs A/B — where freight leaves from. */
    origins?: Array<{ id: number; name: string }>;
    /** Store floors and Remote Hubs — where freight can land. */
    destinations?: Array<{ id: number; name: string }>;
    pagination: Pagination;
}

export interface AdminShipmentShowProps extends SharedProps {
    shipment: Shipment;
    variants: VariantOption[];
    vehicle_options?: FleetVehicle[];
    courier_options?: CourierOption[];
}

export interface StockKeeperShipmentIndexProps extends SharedProps {
    shipments: Shipment[];
    filters: { direction: string };
    pagination: Pagination;
}

export interface StockKeeperShipmentShowProps extends SharedProps {
    shipment: Shipment;
}

export interface SellerShipmentIndexProps extends SharedProps {
    shipments: Shipment[];
    filters: { direction: string };
    /** The signed-in seller's store; replenishments always land here. */
    own_store_id: number;
    counts: { inbound: number; outbound: number; awaiting_receipt: number };
    stores: StoreOption[];
    pagination: Pagination;
}

export interface SellerShipmentShowProps extends SharedProps {
    shipment: Shipment;
    variants: VariantOption[];
}

export interface DeliveryFreightIndexProps extends SharedProps {
    runs: Shipment[];
    available_runs: Shipment[];
    completed_runs: Shipment[];
    filters: { tab: string };
    metrics: {
        assigned: number;
        in_transit: number;
        available: number;
        completed: number;
    };
}
