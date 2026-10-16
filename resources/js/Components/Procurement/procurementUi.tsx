import React from "react";
import { StatusPill, type Tone } from "@/Components/Shared/ui";
import type { DueRule, InstallmentState, PaymentTerms, PurchaseStatus, SupplierPaymentStatus } from "@/types/procurement";

/**
 * Small pieces the procurement pages share. Layout pieces (header, cards,
 * stats, chips, sheet) come from the stock keeper kit, Components/StockKeeper/skKit.
 */

/** "USD 1,250.00" */
export function money(amount: number | null | undefined, currency = "ETB"): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
    return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export function day(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function PurchaseStatusPill({ status, size = "sm" }: { status: PurchaseStatus; size?: "md" | "sm" | "xs" }) {
    return <StatusPill status={status} size={size} />;
}

export const TERMS_SHORT: Record<PaymentTerms, string> = {
    immediate: "Immediate",
    installments: "Installments",
    fixed_date: "Fixed date",
};

export function termsLabel(terms: PaymentTerms, days: number | null): string {
    return terms === "fixed_date" && days !== null ? `${days} days after order` : TERMS_SHORT[terms];
}

const RULE_TEXT: Record<DueRule, (days: number | null) => string> = {
    on_order: () => "on order",
    after_order: (d) => `${d ?? 0} days after order`,
    after_shipping: (d) => (d ? `${d} days after shipping` : "on shipping"),
    after_arrival: (d) => (d ? `${d} days after arrival` : "on arrival"),
    on_date: () => "on a date",
};

/** "12 Oct 2026", or the rule while its event is still ahead ("30 days after shipping"). */
export function dueText(rule: DueRule, days: number | null, dueOn: string | null): string {
    if (dueOn) return day(dueOn);
    return RULE_TEXT[rule]?.(days) ?? rule;
}

const INSTALLMENT_TONE: Record<InstallmentState, { label: string; tone: Tone }> = {
    paid: { label: "Paid", tone: "success" },
    overdue: { label: "Overdue", tone: "error" },
    due: { label: "Due", tone: "warning" },
    waiting: { label: "No date yet", tone: "neutral" },
    cancelled: { label: "Cancelled", tone: "neutral" },
};

export function InstallmentPill({ state }: { state: InstallmentState }) {
    const meta = INSTALLMENT_TONE[state];
    return <StatusPill label={meta.label} tone={meta.tone} size="sm" />;
}

export function PaymentPill({ status }: { status: SupplierPaymentStatus }) {
    return status === "claimed" ? <StatusPill label="To confirm" tone="warning" size="sm" /> : <StatusPill status={status === "confirmed" ? "accepted" : "rejected"} label={status === "confirmed" ? "Confirmed" : "Rejected"} size="sm" />;
}

export const METHOD_LABEL: Record<string, string> = {
    bank_transfer: "Bank transfer",
    swift: "SWIFT / TT",
    wallet: "Wallet",
    cash: "Cash",
    other: "Other",
};
