/**
 * The vendor app's shapes. A vendor is a store (docs/plans/missing-areas-prompt.md §6):
 * App\Services\Vendor\VendorStore presents it.
 */

/** Old purchase-order buckets, still drawn by OrderStatusChip / StatusPill. */
export type PurchaseOrderStatus = "pending" | "received" | "canceled";

export interface VendorStoreProfile {
    id: number;
    name: string;
    slug: string | null;
    description: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    location: string | null;
    status: string | null;
    /** /s/{slug} on the shop. */
    public_url: string | null;
    owner: string | null;
}

export interface VendorStoreMetrics {
    listed_items: number;
    orders_30d: number;
    revenue_30d: number;
    to_pay: number;
    to_pack: number;
    to_deliver: number;
}

export interface VendorOrderRow {
    id: number;
    reference: string;
    customer: string;
    total: number;
    payment_status: string;
    stage: string;
    stage_label: string;
    lines: number;
    placed_at: string | null;
}

export interface VendorOrderDetail extends VendorOrderRow {
    items: Array<{ id: number; item: string; sku: string | null; quantity: number; unit_price: number; subtotal: number }>;
}

export interface VendorCatalogueRow {
    id: number;
    item: string;
    sku: string | null;
    price: number | null;
    active: boolean;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}
