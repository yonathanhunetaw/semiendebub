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

/** Product ideas (App\Services\Procurement\ProductIdeaService::present). */
export type ProductIdeaStatus = "suggested" | "scouting" | "scouted" | "sourcing" | "approved" | "rejected" | "bought";

export interface ProductIdeaMove {
    to: ProductIdeaStatus;
    label: string;
    needs_note: boolean;
    asks_target_price: boolean;
    /** The first trip to price check opens a check: shops, due date, who. */
    opens_check: boolean;
    /** An idea for every store names the store whose sellers check. */
    needs_store: boolean;
}

export interface ProductIdeaEvent {
    from: ProductIdeaStatus | null;
    to: ProductIdeaStatus;
    by: string | null;
    note: string | null;
    at: string | null;
}

export interface ProductIdea {
    id: number;
    name: string;
    spec: string | null;
    reason: string | null;
    /** What the store would sell one piece for, ETB. */
    target_price: number | null;
    status: ProductIdeaStatus;
    source: "store" | "procurement";
    store: { id: number; name: string } | null;
    suggested_by: string | null;
    created_at: string | null;
    status_changed_at: string | null;
    /** Procurement or a global admin, on an approved idea. */
    can_mark_bought?: boolean;
    moves: ProductIdeaMove[];
    checks: Array<{ id: number; store: string; status: PriceCheckStatus; shops_wanted: number; shops_done: number }>;
    /** Verified prices; null for sellers. */
    prices: PriceSummary | null;
    /** Quotes and the cheapest complete one per piece; null for sellers and store managers. */
    costs: { quotes: number; best_cost_per_piece: number | null } | null;
    events: ProductIdeaEvent[];
}

export interface ProductIdeaBoardProps {
    ideas?: ProductIdea[];
    counts?: Partial<Record<ProductIdeaStatus, number>>;
    tab: string;
    canSuggest: boolean;
    stores?: Array<{ id: number; name: string }>;
    /** "{app}.ideas" */
    routePrefix: string;
    /** Sellers and managers who can be named on a price check, by store id (admin app). */
    staff?: Record<string, Array<{ id: number; name: string }>>;
    /** "{app}.price_checks", or null where there is no price check screen (procurement). */
    checkRoutePrefix?: string | null;
    /** "{app}.ideas.quotes", or null for sellers. */
    quotesRoute?: string | null;
    /** Order lines an approved idea can be marked bought on (procurement app). */
    orderLines?: Array<{ id: number; label: string }>;
}

/** Price checks (App\Services\Procurement\PriceCheckService::present). */
export type PriceCheckStatus = "open" | "closed";
export type PackType = "piece" | "packet" | "carton";
export type PriceState = "pending" | "verified" | "rejected";

export interface PriceSummary {
    shops: number;
    prices: number;
    lowest: number | null;
    median: number | null;
    tiers: Array<{ from_pieces: number; prices: number; lowest: number; median: number }>;
}

export interface PriceObservation {
    id: number;
    shop: string;
    observed_on: string | null;
    pack_type: PackType;
    pieces_per_pack: number;
    min_qty: number;
    price: number;
    price_per_piece: number;
    note: string | null;
    recorded_by: string;
    state: PriceState;
    reject_reason: string | null;
    can_verify: boolean;
}

export interface PriceCheck {
    id: number;
    subject: string;
    idea_id: number | null;
    item_id: number | null;
    store: { id: number; name: string };
    spec: string | null;
    target_price: number | null;
    shops_wanted: number;
    shops_done: number;
    due_on: string | null;
    note: string | null;
    status: PriceCheckStatus;
    assignees: string[];
    shops: Array<{ id: number; name: string; area: string | null; done: boolean }>;
    observations: PriceObservation[];
    can_record: boolean;
    can_manage: boolean;
    /** Verified prices; null for sellers. */
    summary: PriceSummary | null;
}

export interface PriceCheckListProps {
    checks?: PriceCheck[];
    tab: PriceCheckStatus;
    counts: Record<PriceCheckStatus, number>;
    toVerify: number;
    /** "{app}.price_checks" */
    routePrefix: string;
    /** Admin app: the stores this admin runs, and who can be named, by store id. */
    stores?: Array<{ id: number; name: string }>;
    staff?: Record<string, Array<{ id: number; name: string }>>;
}

export interface MarketShop {
    id: number;
    name: string;
    area: string | null;
    phone: string | null;
    notes: string | null;
    is_active: boolean;
    /** For the store in the dropdown; null on "All stores". */
    mode: "check" | "avoid" | "none" | null;
    /** The stores that check it. */
    checked_by: string[];
}

/** Landed-cost estimates (App\Services\Procurement\SupplierQuoteService). */
export type RouteFigure = "overseas_storage_per_cbm" | "sea_freight_per_cbm" | "insurance_pct" | "port_clearing_per_cbm" | "land_transport_per_cbm" | "to_store_per_cbm";
export type TariffRate = "duty_pct" | "excise_pct" | "vat_pct" | "surtax_pct" | "withholding_pct" | "other_pct";

export interface FreightRoute extends Record<RouteFigure, number> {
    id: number;
    name: string;
    currency: string;
    origin?: string | null;
    transit_days?: number | null;
    notes?: string | null;
    is_active?: boolean;
}

export interface Estimate {
    quantity: number;
    cartons: number;
    cbm: number;
    lines: Array<{ key: string; label: string; amount: number; cost: boolean }>;
    goods: number;
    customs_value: number;
    cost_total: number;
    recoverable_total: number;
    cash_total: number;
    cost_per_piece: number | null;
    complete: boolean;
    warnings: string[];
    exchange_rate: number;
    route: { id: number; name: string; currency: string; rate: number | null } | null;
    tariff: ({ hs_code: string; description: string | null } & Record<TariffRate, number>) | null;
    calculated_at: string;
}

export interface Margin {
    amount: number;
    pct: number;
}

export interface SupplierQuote {
    id: number;
    supplier: { id: number; name: string };
    currency: string;
    exchange_rate: number;
    unit_price: number;
    moq: number;
    pieces_per_carton: number;
    cbm_per_carton: number | null;
    kg_per_carton: number | null;
    lead_days: number | null;
    valid_until: string | null;
    hs_code: string | null;
    freight_route_id: number | null;
    quantity: number;
    overrides: Partial<Record<RouteFigure, number>>;
    notes: string | null;
    created_by: string | null;
    estimate: Estimate | null;
    margin: Margin | null;
    margin_vs_market: Margin | null;
}

export interface QuoteBoardProps {
    idea: ProductIdea;
    board: { quotes: SupplierQuote[]; target: number | null; market: PriceSummary; best: number | null };
    canQuote: boolean;
    ideasRoute: string;
    suppliers?: Array<{ id: number; name: string; currency: string }>;
    routes?: FreightRoute[];
    currencies?: string[];
    rates?: Record<string, number | null>;
}

export interface TariffRow extends Record<TariffRate, number> {
    id: number;
    hs_code: string;
    description: string | null;
    effective_from: string | null;
    notes: string | null;
}

/** Consignments (App\Services\Procurement\ConsignmentPresenter). */
export type CostState = "pending" | "confirmed" | "rejected";

export interface ConsignmentSummary {
    id: number;
    reference: string;
    stage: string;
    stage_label: string;
    route: string | null;
    container_number: string | null;
    eta: string | null;
    lines: number;
    units: number;
    cbm: number;
    goods_value_etb: number;
    costs_confirmed_etb: number;
    costs_pending: number;
}

export interface ConsignmentLineRow {
    id: number;
    variant: { id: number; sku: string; name: string; detail: string | null; unit: string } | null;
    purchase: { id: number; reference: string; supplier: string | null } | null;
    quantity: number;
    cbm: number | null;
    weight_kg: number | null;
    goods_value_etb: number;
    costs_etb: number;
    recoverable_etb: number;
    landed_total_etb: number;
    landed_unit_etb: number | null;
    received_quantity: number | null;
    damaged_quantity: number | null;
    receipt_note: string | null;
    /** Written when the costs are finalised: per unit that arrived whole. */
    final_unit_etb: number | null;
}

export interface ConsignmentCostRow {
    id: number;
    stage: string;
    stage_label: string;
    kind: string;
    label: string;
    description: string | null;
    currency: string;
    exchange_rate: number;
    amount: number;
    amount_etb: number;
    allocation: "cbm" | "value" | "weight";
    recoverable: boolean;
    reference: string | null;
    paid_on: string | null;
    state: CostState;
    reject_reason: string | null;
    recorded_by: string | null;
    confirmed_by: string | null;
    can_confirm: boolean;
    can_delete: boolean;
}

export interface ConsignmentDetail extends ConsignmentSummary {
    freight_route_id: number | null;
    bill_of_lading: string | null;
    notes: string | null;
    timeline: Array<{ stage: string; label: string; date: string | null; state: "done" | "current" | "ahead" }>;
    next_stages: Array<{ stage: string; label: string }>;
    lines_detail: ConsignmentLineRow[];
    allocation_warnings: string[];
    costs_detail: ConsignmentCostRow[];
    comparison: Array<{ kind: string; label: string; estimated: number; actual: number; pending: number }>;
    can_manage: boolean;
    can_record_costs: boolean;
    stock_location: string | null;
    received: { at: string; location: string | null; by: string | null; open_discrepancies: number } | null;
    costs_finalised_at: string | null;
    finalise_blocker: string | null;
    can_finalise: boolean;
}

export interface PendingImportCost {
    id: number;
    consignment: { id: number; reference: string };
    label: string;
    stage_label: string;
    description: string | null;
    currency: string;
    amount: number;
    amount_etb: number;
    recoverable: boolean;
    reference: string | null;
    paid_on: string | null;
    recorded_by: string | null;
    state: CostState;
    can_confirm: boolean;
}
