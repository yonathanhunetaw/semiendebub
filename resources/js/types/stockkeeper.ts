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
    /** The courier handed it over; it lands when the keeper receives it. */
    handed_over_at: string | null;
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
    /** Jobs waiting on the keeper today (DashboardController::todo). */
    todo?: {
        shipments_to_pick: number;
        shipments_to_receive: number;
        orders_to_pick: number;
        to_shelve: number;
        to_accept: number;
        transfers_pending: number;
        levels_low: number;
        levels_critical: number;
    };
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
    /** No longer sent: the raise sheet searches items on the server. */
    variants?: VariantOption[];
    pagination: Pagination;
}

/* ----------------------------------------------------------
 | Levels (App\Services\Inventory\LocationLevels)
 |----------------------------------------------------------*/

/** full ≥ max · ok · low ≤ low line · critical ≤ crit line · empty = none. */
export type LevelStatus = "full" | "ok" | "low" | "critical" | "empty";

export interface PackUnit {
    id: number | null;
    name: string;
    pieces: number;
}

export interface LevelRow {
    item_id: number;
    name: string;
    image: string | null;
    skus: string[];
    pieces: number;
    /** Biggest packaging first, e.g. "50 Cartons · 6 Pieces". */
    display: string;
    lead: { unit: string; count: number; pieces: number } | null;
    /** Stock in the lines' unit, e.g. 50.5 (Cartons). */
    in_unit: number;
    unit: PackUnit;
    units: PackUnit[];
    level: { max: number; low: number; critical: number } | null;
    /** 0–1 against full; null without lines. */
    fill: number | null;
    /** How many of `unit` until full. */
    to_full: number | null;
    cbm: number;
    status: LevelStatus;
    assigned: boolean;
    /** Floor-plan areas holding it here, e.g. ["A1", "B3"]. */
    areas?: string[];
}

export interface LevelsBoard {
    location: { id: number; name: string; kind: string; code: string | null };
    capacity: { cbm: number | null; used_cbm: number; free_cbm: number | null; percent: number | null };
    counts: Record<"items" | "with_levels" | LevelStatus, number>;
    items: LevelRow[];
}

export interface StockKeeperLevelsProps extends SharedProps {
    locations: Array<{ id: number; name: string; kind: string; store: string | null }>;
    board: LevelsBoard | null;
    can_edit: boolean;
}

/* ----------------------------------------------------------
 | Floor plan (App\Services\Inventory\FloorPlan)
 |----------------------------------------------------------*/

export interface FloorAreaItem {
    item_id: number;
    name: string;
    image: string | null;
    display: string;
    status: LevelStatus;
    /** This area's share of the item's volume at the location. */
    cbm: number;
    shared: boolean;
}

export interface FloorAreaRow {
    id: number;
    code: string;
    name: string | null;
    kind: string;
    /** Metres from the floor's top-left corner. */
    x: number;
    y: number;
    width: number;
    length: number;
    area_m2: number;
    notes: string | null;
    cbm: number;
    items: FloorAreaItem[];
}

export interface FloorPlanData {
    location: LevelsBoard["location"];
    floor: { width: number | null; length: number | null; area_m2: number | null };
    capacity: LevelsBoard["capacity"];
    areas: FloorAreaRow[];
    unplaced: Array<Pick<LevelRow, "item_id" | "name" | "image" | "display" | "status" | "cbm" | "skus">>;
    items: Array<{ item_id: number; name: string; display: string }>;
    kinds: string[];
}

export interface StockKeeperFloorProps extends SharedProps {
    locations: StockKeeperLevelsProps["locations"];
    plan: FloorPlanData | null;
    can_edit: boolean;
    focus: number | null;
}

/* ----------------------------------------------------------
 | Item detail (App\Services\Inventory\ItemLookup)
 |----------------------------------------------------------*/

export interface ItemDetail {
    id: number;
    name: string;
    description: string | null;
    packaging_details: string | null;
    status: string;
    is_incomplete: boolean;
    category: string[];
    images: string[];
    packaging: Array<{ id: number; name: string; image: string | null; pieces: number }>;
    variants: Array<{
        id: number;
        sku: string | null;
        barcode: string | null;
        status: string | null;
        color: { name: string; image: string | null } | null;
        size: string | null;
        packaging: { name: string; image: string | null; pieces: number } | null;
        volumes: Array<{ packaging: string; quantity: number; cbm: number | null }>;
        images: string[];
        owner: string | null;
    }>;
    stock: Array<{
        location: { id: number; name: string; kind: string; store: string | null };
        pieces: number;
        display: string;
        by_sku: Array<{ sku: string | null; quantity: number }>;
        level: { max: number; low: number; critical: number; unit: string } | null;
        areas: Array<{ code: string; name: string | null }>;
    }>;
}

/* ----------------------------------------------------------
 | Receiving (App\Services\Inventory\ReceivingService)
 |----------------------------------------------------------*/

export type DiscrepancyKind = "short" | "damaged" | "over";

export interface DiscrepancyRow {
    id: number;
    reference: string;
    kind: DiscrepancyKind;
    status: "open" | "resolved";
    resolution: string | null;
    item: { id: number; name: string; sku: string | null };
    expected: number;
    received: number;
    quantity: number;
    note: string | null;
    resolution_note: string | null;
    location: string;
    courier: string | null;
    recorded_by: string | null;
    resolved_by: string | null;
    source: { type: string; reference: string; url: string | null };
    created_at: string | null;
    resolved_at: string | null;
    can_resolve: boolean;
}

/* ----------------------------------------------------------
 | Stocktakes (App\Services\Inventory\StocktakeService)
 |----------------------------------------------------------*/

export type StocktakeStatus = "counting" | "submitted" | "posted" | "voided";

export interface StocktakeLine {
    id: number;
    item_variant_id: number;
    item_id: number;
    name: string;
    variant: string;
    sku: string | null;
    barcode: string | null;
    unit: string;
    pieces_per_unit: number;
    expected: number;
    counted: number | null;
    variance: number | null;
    counted_at: string | null;
}

export interface StocktakeDetail {
    id: number;
    reference: string;
    status: StocktakeStatus;
    note: string | null;
    location: { id: number; name: string; kind: string };
    started_by: string | null;
    submitted_by: string | null;
    approved_by: string | null;
    created_at: string | null;
    submitted_at: string | null;
    posted_at: string | null;
    totals: { lines: number; counted: number; matching: number; over: number; short: number };
    can_approve: boolean;
    lines: StocktakeLine[];
}
