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
    price: number | string | null;
    discount_price: number | string | null;
    discount_ends_at: string | null;
    individual_price: number | string | null;
}

export interface Place {
    location_id: number;
    name: string;
    kind: string;
    can_edit: boolean;
    managers: string[];
    pieces: number;
    band: { max: number; refill: number; critical: number } | null;
}

export interface StoreSetup {
    id: number;
    name: string;
    deployed: boolean;
    readiness: StoreReadiness | null;
    lines: PriceLine[];
    seller_prices: number;
    customer_prices: number;
    prices_url: string | null;
    places: Place[];
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

export interface ItemSetupProps {
    item: {
        id: number;
        name: string;
        category: string | null;
        status: string;
        variants: Array<{ id: number; sku: string; label: string; barcode: string }>;
        edit_url: string;
    };
    readiness: Readiness;
    stores: StoreSetup[];
    stock: Array<{ location_id: number; place: string; pieces: number }>;
    history: Record<"transfers" | "shipments" | "movements" | "sales", HistoryRow[]>;
}
