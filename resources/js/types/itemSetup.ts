/** What Admin\ItemSetupController sends to the item setup page. */

export interface Check {
    key: string;
    label: string;
    required: boolean;
    done: boolean;
    detail: string;
}

export interface Part {
    percent: number;
    checks: Check[];
    done_required: number;
    required: number;
    optional_done: number;
    optional: number;
}

export interface StoreReadiness extends Part {
    store: { id: number; name: string };
}

export interface Readiness {
    percent: number;
    item: Part;
    /** Keyed by store id; only stores that have the item. */
    stores: Record<string, StoreReadiness> | StoreReadiness[];
}

export interface PriceLine {
    store_variant_id: number;
    variant: string;
    sku: string;
    active: boolean;
    on_sale: boolean;
    forced_off: boolean;
    business_pool: number | null;
    price: number | string | null;
    discount_price: number | string | null;
    discount_ends_at: string | null;
    individual_price: number | string | null;
}

export interface TierLine {
    store_variant_id: number;
    price: number | string | null;
    discount_price: number | string | null;
    discount_ends_at: string | null;
}

export interface SellerEntry {
    seller_id: number;
    name: string;
    customer_type: "business" | "individual";
    lines: TierLine[];
}

export interface CustomerEntry {
    customer_id: number;
    name: string;
    customer_type: "business" | "individual";
    lines: TierLine[];
}

export interface CountLine {
    variant_id: number;
    label: string;
    expected: number;
    counted: number | null;
}

export interface OpenCount {
    id: number;
    reference: string;
    status: "counting" | "submitted";
    started_by: string;
    submitted_by: string | null;
    by_me: boolean;
    has_this_item: boolean;
    only_this_item: boolean;
}

export interface Place {
    location_id: number;
    name: string;
    kind: string;
    can_edit: boolean;
    managers: string[];
    pieces: number;
    band: { max: number; refill: number; critical: number } | null;
    count: { lines: CountLine[]; open: OpenCount | null };
}

export interface RefillRoute {
    sources: string[];
    set: boolean;
    can_edit: boolean;
    managers: string[];
    available: string[];
}

export interface StoreSetup {
    id: number;
    name: string;
    deployed: boolean;
    readiness: StoreReadiness | null;
    lines: PriceLine[];
    seller_prices: SellerEntry[];
    customer_prices: CustomerEntry[];
    sellers: Array<{ id: number; name: string }>;
    prices_url: string | null;
    places: Place[];
    route: RefillRoute;
    count_url: string;
}

export interface HistoryRow {
    reference?: string;
    type?: string;
    reason?: string;
    place?: string;
    quantity: number;
    status?: string;
    at: string | null;
}

/** PriceHistory::forItem: one change to a store, seller, customer or individual price. */
export interface PriceChangeRow {
    id: number;
    kind: "store" | "seller" | "customer" | "individual" | string;
    store: string | null;
    variant: string | null;
    old_price: number | null;
    new_price: number | null;
    by: string | null;
    at: string | null;
}

export interface ItemSetupProps {
    /** The newest price changes of this item (catalogue history; sale lines keep their own price). */
    priceHistory?: PriceChangeRow[];
    item: {
        id: number;
        name: string;
        category: string | null;
        status: string;
        variants: Array<{ id: number; sku: string; label: string; status: string; barcode: string; slots: Array<{ path: string; url: string } | null> }>;
        basics: {
            product_name: string;
            product_description: string;
            packaging_details: string;
            hs_code?: string;
            item_category_id: number | null;
            status: string;
            pictures: Array<{ path: string; url: string }>;
        };
    };
    options: {
        colors: Array<{ id: number; name: string }>;
        sizes: Array<{ id: number; name: string }>;
        packaging: Array<{ id: number; name: string; quantity: number }>;
    };
    catalog: {
        categories: Array<{ id: number; path: string }>;
        colors: Array<{ id: number; name: string }>;
        sizes: Array<{ id: number; name: string }>;
        packaging: Array<{ id: number; name: string }>;
    };
    readiness: Readiness;
    stores: StoreSetup[];
    warehouses: Place[];
    stock: Array<{ location_id: number; place: string; pieces: number }>;
    history: Record<"transfers" | "shipments" | "movements" | "sales", HistoryRow[]>;
}
