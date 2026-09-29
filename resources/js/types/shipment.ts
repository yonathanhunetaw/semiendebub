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

export interface Shipment {
    id: number;
    reference: string;
    status: ShipmentStatus;
    origin: ShipmentEndpoint;
    destination: ShipmentEndpoint;
    vehicle_name: string | null;
    vehicle_plate: string | null;
    vehicle_max_cbm: number | null;
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
    pagination: Pagination;
}

export interface AdminShipmentShowProps extends SharedProps {
    shipment: Shipment;
    variants: VariantOption[];
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
