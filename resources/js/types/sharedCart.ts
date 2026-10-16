/**
 * A seller's cart as its customer sees it on shared.<domain>/c/{token}.
 * Shapes come from App\Services\Shared\SharedCartPresenter.
 */

export type Availability = { state: "now" | "later" | "unavailable"; text: string };

export interface SharedCartLine {
    variant_id: number;
    title: string;
    detail: string | null;
    unit: string;
    sku: string;
    image_url: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    availability: Availability;
}

export interface StoreAccount {
    id: number;
    type: string;
    provider: string;
    account_name: string;
    account_number: string;
}

export interface SavedAddress {
    id: number;
    label: string | null;
    address: string;
    recipient_name: string | null;
    recipient_phone: string | null;
}

export interface SharedCart {
    store: string | null;
    customer: string | null;
    seller: string | null;
    lines: SharedCartLine[];
    total: number;
    requires_delay_agreement: boolean;
    expires_at: string;
    accounts: StoreAccount[];
    addresses: SavedAddress[];
    recipient: { name: string | null; phone: string | null };
}

export interface CatalogueItem {
    variant_id: number;
    title: string;
    detail: string | null;
    unit: string;
    image_url: string | null;
    unit_price: number;
    in_stock: boolean;
}

export interface SharedOrder {
    reference: string;
    store: string | null;
    stage: "to_pay" | "paid" | "packing" | "to_deliver" | "delivered" | "canceled";
    total: number;
    payment_status: string;
    placed_at: string | null;
    delivery: { method: string; address: string | null; status: string } | null;
    lines: Array<{ title: string; unit: string | null; quantity: number; line_total: number }>;
    payments: Array<{ id: number; amount: number; status: string; reference: string | null; account: StoreAccount | null; can_claim: boolean }>;
    events: Array<{ at: string | null; title: string; icon: string }>;
}
