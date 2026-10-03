/**
 * Centralized TypeScript contracts for the StockKeeper module
 * (resources/js/Pages/StockKeeper/**).
 *
 * Mirrors App\Services\StockKeeperService and App\Services\TransferWorkflowService.
 */

/* ----------------------------------------------------------
 | Shared primitives
 |----------------------------------------------------------*/

/** Health of one ledger row against its configured minimum. */
export type StockRowStatus =
    | "healthy"
    | "low_stock"
    | "critical"
    | "out_of_stock";

/**
 * Where stock physically sits.
 *
 * `shelf` and `backroom` are areas inside a store (item_inventory_locations).
 * They matter here because a shelf is the one place whose quantities are spoken
 * in the smallest unit — see `display_mode` below.
 */
/** Kinds from the one location tree (STOCK_PLAN.md §2.1); "warehouse" is legacy. */
export type LocationKind = "warehouse" | "store" | "shelf" | "backroom" | "remote_hub" | "main_hub";

/**
 * How a quantity is spoken at a location.
 *
 * breakdown — biggest unit first: "30 Cartons · 17 Pieces". Stores, back rooms,
 *             warehouses: places where bulk is what matters.
 * smallest  — the smallest unit only: "3,617 Pieces". A shop floor, where stock
 *             is handled and sold one at a time.
 *
 * Mirrors App\Services\Inventory\PackagingLadder.
 */
export type StockDisplayMode = "breakdown" | "smallest";

/** One tier of a quantity, e.g. 30 × Carton. */
export interface StockUnitPart {
    unit: string;
    count: number;
    /** Pieces in one of these units. */
    pieces: number;
}

export interface StockLocation {
    id: number;
    name: string;
    /** Fully-qualified model class, as the ledger stores it. */
    type: string;
    kind: LocationKind;
    units: number;
    /** The store a location belongs to; null for a shared hub. */
    store_id?: number | null;
}

export interface VariantOption {
    id: number;
    label: string;
    sku: string | null;
}

/* ----------------------------------------------------------
 | Stock ledger
 |----------------------------------------------------------*/

export interface StockRow {
    id: number;
    variant_id: number;
    item_id?: number;
    product_name: string;
    sku: string | null;
    variant_label: string;
    location_name: string;
    location_kind: LocationKind;
    /**
     * In the variant's own packaging unit — 11 against a carton variant is 11
     * cartons, not 11 pieces. `unit` names it and `pieces` converts it.
     */
    quantity: number;
    unit?: string;
    pieces_per_unit?: number;
    pieces?: number;
    min_stock_level: number;
    /** quantity − min_stock_level; negative means the threshold is breached. */
    headroom: number;
    status: StockRowStatus;
    updated_at: string | null;
}

export interface StockMetrics {
    /** Products on hand — what the floor counts in. */
    items: number;
    /** How the catalogue is cut. Secondary, never the headline. */
    variants: number;
    /** @deprecated same figure as `variants`; kept for older screens. */
    tracked_skus: number;
    ledger_rows: number;
    stock_rows: number;
    /** Raw ledger sum across mixed packaging units — not comparable. */
    units_on_hand: number;
    /** The comparable total: every unit converted to pieces. */
    pieces_on_hand: number;
    low_stock: number;
    low_stock_items: number;
    out_of_stock: number;
    out_of_stock_items: number;
    warehouse_units: number;
    store_units: number;
    warehouses: number;
}

/* ----------------------------------------------------------
 | Item-level ledger
 |----------------------------------------------------------*/

/**
 * One item at one location, in that location's own units.
 *
 * Mirrors App\Services\Inventory\ItemStockReader::paginateItems(). This is the
 * row the desk reads: 182 of these rather than 1,629 variant rows.
 */
export interface ItemStockRow {
    item_id: number;
    product_name: string;
    item_sku: string | null;
    variant_count: number;
    /** Raw ledger sum in mixed units. Audit only. */
    ledger_units: number;
    pieces: number;
    units: StockUnitPart[];
    /** "30 Cartons · 17 Pieces", already in the right mode for this location. */
    display: string;
    display_mode: StockDisplayMode;
    headroom: number;
    min_stock_level: number;
    status: StockRowStatus;
    updated_at: string | null;
}

/** A variant row behind an item, which is what a count is written against. */
export interface ItemVariantStockRow {
    stock_id: number;
    variant_id: number;
    sku: string | null;
    variant_label: string;
    /** The packaging this row is counted in, e.g. "Carton". */
    unit: string;
    quantity: number;
    pieces_per_unit: number;
    pieces: number;
    min_stock_level: number;
    location_name: string;
    updated_at: string | null;
}

/* ----------------------------------------------------------
 | Transfers
 |----------------------------------------------------------*/

export type TransferStatus =
    | "pending"
    | "in_transit"
    | "completed"
    | "cancelled";

export interface TransferRow {
    id: number;
    reference: string;
    product_name: string;
    sku: string | null;
    quantity: number;
    status: TransferStatus;
    from_store: string | null;
    to_store: string | null;
    /** "Store Shelf · Main Store" — the exact places, when named. */
    source_label?: string | null;
    destination_label?: string | null;
    /** Between two sites a courier carries it; null until one claims it. */
    courier?: string | null;
    needs_courier?: boolean;
    initiated_by: string | null;
    notes: string | null;
    dispatched_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    created_at: string | null;
}

export interface TransferCounts {
    all: number;
    pending: number;
    in_transit: number;
    completed: number;
    cancelled: number;
}

/* ----------------------------------------------------------
 | Shared page scaffolding
 |----------------------------------------------------------*/

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

export interface StockKeeperDashboardProps extends SharedProps {
    metrics: StockMetrics;
    alerts: StockRow[];
    recent_movements: StockRow[];
    locations: StockLocation[];
    assigned_location: { id: number; name: string } | null;
    transfer_summary: {
        pending: number;
        in_transit: number;
        completed: number;
    };
}

export interface StockKeeperInventoryProps extends SharedProps {
    /** The item-level ledger — the main view. */
    items: ItemStockRow[];
    /** The variant-level rows, for the keeper who needs them. */
    stock: StockRow[];
    locations: StockLocation[];
    variants: VariantOption[];
    filters: {
        search: string;
        location_type: string | null;
        location_id: number | null;
    };
    metrics: StockMetrics;
    pagination: Pagination;
}

export interface StockKeeperAlertsProps extends SharedProps {
    alerts: StockRow[];
    filters: {
        search: string;
        severity: string | null;
    };
    summary: {
        low_stock: number;
        out_of_stock: number;
        items: number;
        variants: number;
        /** @deprecated same figure as `variants`. */
        tracked_skus: number;
    };
    pagination: Pagination;
}

export interface StockKeeperTransfersProps extends SharedProps {
    transfers: TransferRow[];
    filters: { status: string };
    counts: TransferCounts;
    stores: StockLocation[];
    /** Every shelf, store floor and hub, from the location tree. */
    locations?: StockLocation[];
    variants: VariantOption[];
    pagination: Pagination;
}
