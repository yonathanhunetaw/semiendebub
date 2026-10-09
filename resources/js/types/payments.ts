/**
 * Payments, as App\Services\Finance\PaymentBoard shapes them.
 *
 * An order's total is split into parts. A part paid into an account goes
 * pending → claimed ("customer says paid") → confirmed (the account's owner
 * saw the money). Cash is confirmed on the spot by the seller taking it.
 */

export type PaymentAccountType = "bank" | "wallet";

export type PaymentStatus = "pending" | "claimed" | "confirmed" | "void";

/** A collection account a seller may split an order across. */
export interface PaymentAccountOption {
    id: number;
    type: PaymentAccountType;
    /** Provider id, e.g. "cbe" or "telebirr" (config/payments.php). */
    provider: string;
    provider_name: string;
    account_number: string;
    account_name: string;
    /** The seller who confirms deposits into this account. */
    owner: string | null;
}

/** One part of an order's payment. */
export interface OrderPayment {
    id: number;
    method: "bank" | "wallet" | "cash" | string;
    account: PaymentAccountOption | null;
    amount: number;
    reference: string | null;
    status: PaymentStatus;
    claimed_at: string | null;
    confirmed_at: string | null;
    /** Set while the part is back at pending because the owner found no money. */
    not_received_at: string | null;
    created_at: string | null;
}

/** A claimed part in the account owner's inbox. */
export interface InboxPayment extends OrderPayment {
    order: string;
    order_total: number;
    customer: string;
    store: string | null;
    claimed_by: string | null;
}

/**
 * What the seller sends for one part; no account means cash. A type alias,
 * not an interface, so Inertia accepts it as form data.
 */
export type PaymentPartInput = {
    payment_account_id: number | null;
    /** "credit" puts the part on the customer's credit. */
    method: "credit" | null;
    amount: number;
    transaction_reference: string | null;
};

/* ----------------------------------------------------------
 | Seller balance (App\Services\Finance\BalanceLedger)
 |----------------------------------------------------------*/

/** Money held in one account the seller took deposits in, or cash (account null). */
export interface BalanceBucket {
    account: PaymentAccountOption | null;
    held: number;
    /** In handovers still waiting on their settlement owner. */
    handing_over: number;
    /** What can still be handed over. */
    available: number;
}

/** Cash held longer than payments.cash_flag_days. */
export interface OverdueCash {
    amount: number;
    /** When the oldest of it was taken. */
    since: string | null;
    days: number;
}

/** A handover of held money to a settlement account. */
export interface RemittanceRow {
    id: number;
    amount: number;
    /** "CBE · 1000…" or "Cash". */
    from: string;
    to: PaymentAccountOption | null;
    reference: string | null;
    status: "claimed" | "confirmed" | "rejected";
    /** The seller handing it over. */
    by: string | null;
    at: string | null;
    settled_at: string | null;
}

/** One line on a seller's balance. */
export interface BalanceEntryRow {
    id: number;
    /** Positive when received, negative when handed over. */
    amount: number;
    bucket: string;
    what: string;
    at: string | null;
}

/* ----------------------------------------------------------
 | Customer credit (App\Services\Finance\CustomerCreditService)
 |----------------------------------------------------------*/

/** A customer's credit. Only an admin sets the limit and days. */
export interface CreditSummary {
    customer_id: number;
    /** An admin gave them a limit and days to pay. */
    enabled: boolean;
    limit: number;
    days: number;
    outstanding: number;
    available: number;
    overdue: number;
    oldest_due: string | null;
    /** An admin lets them keep buying on credit while overdue. */
    override: boolean;
    /** Why credit is not offered now, or null when it is. */
    blocked_reason: string | null;
}

/** A credit order and what is still owed on it, oldest repaid first. */
export interface CreditInvoice {
    sale_id: number;
    reference: string;
    charged: number;
    owed: number;
    due_date: string | null;
    overdue: boolean;
}
