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

/** Where stock physically sits. */
export type LocationKind = "warehouse" | "store";

export interface StockLocation {
    id: number;
    name: string;
    /** Fully-qualified model class, as the ledger stores it. */
    type: string;
    kind: LocationKind;
    units: number;
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
    product_name: string;
    sku: string | null;
    variant_label: string;
    location_name: string;
    location_kind: LocationKind;
    quantity: number;
    min_stock_level: number;
    /** quantity − min_stock_level; negative means the threshold is breached. */
    headroom: number;
    status: StockRowStatus;
    updated_at: string | null;
}

export interface StockMetrics {
    tracked_skus: number;
    units_on_hand: number;
    stock_rows: number;
    low_stock: number;
    out_of_stock: number;
    warehouse_units: number;
    store_units: number;
    warehouses: number;
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
        tracked_skus: number;
    };
    pagination: Pagination;
}

export interface StockKeeperTransfersProps extends SharedProps {
    transfers: TransferRow[];
    filters: { status: string };
    counts: TransferCounts;
    stores: StockLocation[];
    variants: VariantOption[];
    pagination: Pagination;
}
