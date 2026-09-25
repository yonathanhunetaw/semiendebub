/**
 * Shared TypeScript contracts for the cross-role shipment domain
 * (Admin, Seller, StockKeeper and Delivery all render these same shapes).
 *
 * Mirrors App\Services\ShipmentWorkflowService::present().
 */

/** The one shipment lifecycle, shared by every role. */
export type ShipmentStatus =
    | "draft"
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
