/**
 * Procurement: suppliers and purchase orders.
 * Shapes come from App\Services\Procurement\PurchaseOrderPresenter.
 */

export type PurchaseStatus =
    | "draft"
    | "submitted"
    | "approved"
    | "ordered"
    | "partially_received"
    | "received"
    | "closed"
    | "cancelled";

export type PaymentTerms = "immediate" | "installments" | "fixed_date";

export interface SupplierContact {
    name: string;
    role?: string | null;
    phone?: string | null;
    email?: string | null;
}

export interface Supplier {
    id: number;
    name: string;
    country: string | null;
    city: string | null;
    currency: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    contacts: SupplierContact[];
    default_payment_terms: PaymentTerms;
    default_payment_days: number | null;
    notes: string | null;
    is_active: boolean;
    orders_count: number | null;
    open_orders_count: number | null;
}

export interface VariantOption {
    id: number;
    sku: string;
    name: string;
    detail: string | null;
    /** The packaging unit the quantity is counted in ("Carton"). */
    unit: string;
    image_url: string | null;
}

export interface PurchaseLine {
    id: number;
    item_variant_id: number;
    variant: VariantOption | null;
    supplier_sku: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    cbm: number | null;
    weight_kg: number | null;
    received_quantity: number;
    notes: string | null;
}

export interface PurchaseSummary {
    id: number;
    reference_number: string;
    status: PurchaseStatus;
    supplier: string | null;
    supplier_country: string | null;
    currency: string;
    exchange_rate: number;
    subtotal_foreign: number;
    total_amount: number;
    lines_count: number | null;
    raised_by: string | null;
    needs_admin: boolean;
    expected_at: string | null;
    purchased_at: string | null;
    created_at: string | null;
}

export interface PurchaseStep {
    key: string;
    label: string;
    at: string | null;
    by: string | null;
}

export interface PurchaseDetail extends PurchaseSummary {
    supplier_id: number | null;
    payment_terms: PaymentTerms;
    payment_days: number | null;
    payment_anchor: "order" | "shipping" | null;
    payment_schedule: ScheduleTemplateRow[];
    money: PurchaseMoney;
    incoterm: string | null;
    warehouse_id: number | null;
    warehouse: string | null;
    notes: string | null;
    review_note: string | null;
    cancel_reason: string | null;
    total_cbm: number;
    total_weight_kg: number;
    lines: PurchaseLine[];
    steps: PurchaseStep[];
    can: {
        edit: boolean;
        submit: boolean;
        review: boolean;
        order: boolean;
        cancel: boolean;
        close: boolean;
    };
    /** Why the viewer may not approve a submitted order, if they may not. */
    review_refusal: string | null;
}

export interface Pagination {
    current_page: number;
    last_page: number;
    total: number;
}

export interface WarehouseOption {
    id: number;
    name: string;
    code: string | null;
}

/* ── Money owed to suppliers (P2) ───────────────────────────────────── */

export type DueRule = "on_order" | "after_order" | "after_shipping" | "after_arrival" | "on_date";

/** A row of the schedule template on a draft order. */
export interface ScheduleTemplateRow {
    label?: string | null;
    percent?: number | null;
    amount?: number | null;
    due: DueRule;
    days?: number | null;
    date?: string | null;
}

/** A schedule row before approval (built from the template). */
export interface SchedulePreviewRow {
    sequence: number;
    label: string;
    percent: number | null;
    amount: number;
    due_rule: DueRule;
    due_days: number | null;
    due_date: string | null;
}

export type InstallmentState = "paid" | "overdue" | "due" | "waiting" | "cancelled";

export interface Installment {
    id: number;
    sequence: number;
    label: string;
    percent: number | null;
    amount: number;
    paid: number;
    waiting: number;
    remaining: number;
    payable_now: number;
    due_rule: DueRule;
    due_days: number | null;
    due_on: string | null;
    state: InstallmentState;
}

export interface PayableSummary {
    id: number;
    currency: string;
    amount: number;
    paid: number;
    waiting: number;
    remaining: number;
    remaining_etb_estimate: number;
    overdue: number;
    paid_etb: number;
    cancelled: boolean;
    installments: Installment[];
}

export type SupplierPaymentStatus = "claimed" | "confirmed" | "rejected";

export interface SupplierPayment {
    id: number;
    installment_id: number;
    installment: string | null;
    currency: string;
    amount: number;
    exchange_rate: number;
    amount_etb: number;
    paid_on: string | null;
    method: string;
    account: string | null;
    reference: string | null;
    notes: string | null;
    status: SupplierPaymentStatus;
    claimed_by: string | null;
    claimed_at: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
    rejected_by: string | null;
    reject_reason: string | null;
    can_confirm: boolean;
    /** Inbox only. */
    supplier?: string | null;
    reference_number?: string | null;
}

export interface PurchaseMoney {
    payable: PayableSummary | null;
    preview: SchedulePreviewRow[];
    preview_problem: string | null;
    payments: SupplierPayment[];
    can_pay: boolean;
}

/** One unpaid installment on the payables board. */
export interface OpenInstallment extends Installment {
    payable_id: number;
    kind: string;
    currency: string;
    remaining_etb_estimate: number;
    supplier_id: number | null;
    supplier: string | null;
    purchase_id: number | null;
    reference: string | null;
}

export interface PayablesTotals {
    owed_etb: number;
    overdue_etb: number;
    due_soon_etb: number;
    waiting_count: number;
}
