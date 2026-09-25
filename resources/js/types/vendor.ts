/**
 * Centralized TypeScript contracts for the Vendor module
 * (resources/js/Pages/Vendor/**).
 *
 * Mirrors App\Services\VendorService. A vendor is a User with role `vendor`,
 * linked to the business by `item_variants.owner_id` (SKUs they supply) and
 * `purchases.vendor_id` (orders placed with them).
 */

/** Mirrors the `purchases.status` ENUM — note the single-l "canceled". */
export type PurchaseOrderStatus = "pending" | "received" | "canceled";

export interface VendorMetrics {
    catalogue_skus: number;
    /** Units of this vendor's SKUs held anywhere in the network. */
    units_in_network: number;
    orders_total: number;
    orders_pending: number;
    orders_received: number;
    orders_canceled: number;
    revenue_received: number;
    revenue_pending: number;
}

export interface VendorVariant {
    id: number;
    sku: string | null;
    barcode: string | null;
    product_name: string;
    category: string | null;
    color: string | null;
    size: string | null;
    packaging: string | null;
    pieces_per_unit: number;
    image_url: string | null;
    status: string | null;
    units_in_network: number;
}

export interface PurchaseOrder {
    id: number;
    reference_number: string;
    status: PurchaseOrderStatus;
    total_amount: number;
    store: string | null;
    warehouse: string | null;
    raised_by: string | null;
    notes: string | null;
    purchased_at: string | null;
    expected_at: string | null;
    created_at: string | null;
}

export interface OrderStatusCounts {
    all: number;
    pending: number;
    received: number;
    canceled: number;
}

export interface VendorIdentity {
    id: number;
    name: string;
    email: string;
}

export interface VendorProfileDetails {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string | null;
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

export interface VendorDashboardProps extends SharedProps {
    metrics: VendorMetrics;
    recent_orders: PurchaseOrder[];
    catalogue_preview: VendorVariant[];
    vendor: VendorIdentity;
}

export interface VendorCatalogueProps extends SharedProps {
    variants: VendorVariant[];
    metrics: VendorMetrics;
    filters: { search: string };
    pagination: Pagination;
}

export interface VendorOrdersProps extends SharedProps {
    orders: PurchaseOrder[];
    counts: OrderStatusCounts;
    metrics: VendorMetrics;
    filters: { status: string; search: string };
    pagination: Pagination;
}

export interface VendorOrderShowProps extends SharedProps {
    order: PurchaseOrder;
}

export interface VendorProfileProps extends SharedProps {
    vendor: VendorProfileDetails;
    metrics: VendorMetrics;
}
