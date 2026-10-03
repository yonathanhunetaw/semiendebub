/**
 * Contracts for variant-level location capacity and the replenishment
 * proposals it generates.
 *
 * Server counterparts:
 *   - App\Services\Inventory\LocationCapacityService::bandsFor()
 *   - App\Services\Inventory\ReplenishmentProposalService::present()
 *   - App\Http\Controllers\Admin\Inventory\VariantCapacityController
 *   - App\Http\Controllers\Admin\Inventory\ReplenishmentController
 *
 * `kind` is a node kind from App\Services\Fulfillment\MovementDomainService.
 * Capacity applies at every one of them, which is the point: a variant's floor
 * on the shop shelf, in the back room, at the remote warehouse and at the hub
 * are four different numbers for the same SKU.
 */

export type LocationKind =
    | "shelf"
    | "backroom"
    | "store"
    | "remote_warehouse"
    | "main_warehouse"
    | "other";

/** One level of the hierarchy, with the band set there and what is on hand. */
export interface CapacityBand {
    /** Fully-qualified model class, e.g. "App\\Models\\Store\\Store". */
    location_type: string;
    location_id: number;
    kind: LocationKind;
    /** e.g. "Store Back Room". */
    level_label: string;
    /** The place's own name, e.g. "Main Store". */
    name: string;
    /** True for warehouse-class nodes: freight, not localized balancing. */
    is_structural: boolean;
    min_capacity: number;
    max_capacity: number;
    on_hand: number;
    /** A floor above zero enrols this level in automated replenishment. */
    monitored: boolean;
    breached: boolean;
    shortfall: number;
}

export interface CapacityVariantRow {
    id: number;
    product_name: string;
    sku: string | null;
    variant_label: string;
    monitored_levels: number;
    levels_total: number;
}

export interface CapacityStoreOption {
    id: number;
    name: string;
    type_label: string;
}

/* ----------------------------------------------------------
 | Replenishment proposals
 |----------------------------------------------------------*/

export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";

export interface ProposalEndpoint {
    label: string;
    name: string;
    kind: LocationKind;
}

/**
 * A transfer the capacity planner raised and nobody has agreed to yet.
 *
 * It carries its own working — what was on hand, the floor it broke and the
 * ceiling it would top up to — so the manager can rule on it without going to
 * look the numbers up.
 */
export interface ReplenishmentProposal {
    id: number;
    reference: string;
    product_name: string;
    sku: string | null;
    variant_label: string;
    quantity: number;
    observed_quantity: number | null;
    min_capacity: number | null;
    max_capacity: number | null;
    origin: string;
    approval_state: ApprovalState;
    status: string;
    ui_status: string;
    source: ProposalEndpoint | null;
    destination: ProposalEndpoint | null;
    from_store: string | null;
    to_store: string | null;
    notes: string | null;
    created_at: string | null;
}

/**
 * A shortfall that cannot be a Transfer: both ends are warehouses, which makes
 * it bulk freight. No record is written for these — they are reported so the
 * Shipment builder can pick them up.
 */
export interface ShipmentCandidate {
    sku: string | null;
    product_name: string | null;
    shortfall: number;
    on_hand: number;
    source: string;
    destination: string;
    reason: string;
}
