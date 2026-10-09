import PaymentSplitEditor, { legsBalanced, legsToParts } from "@/Components/Seller/PaymentSplitEditor";
import { SellerCard } from "@/Components/Seller/sellerUi";
import { birr, type PaymentLeg } from "@/Data/sellerOrderFlow";
import type { CreditInvoice, CreditSummary, OrderPayment, PaymentAccountOption } from "@/types/payments";
import { router } from "@inertiajs/react";
import { Typography } from "@mui/material";
import React, { useState } from "react";

/**
 * A customer's credit on their page: the limit an admin set, what they owe
 * and when, and taking a repayment.
 *
 * The seller cannot change the limit or the days. A repayment is split like
 * any payment: cash is taken on the spot, an account part waits for the
 * customer to pay and for the account's owner to confirm it, and only then
 * does what the customer owes go down.
 */

interface Props {
    customerId: number;
    customerName: string;
    credit: CreditSummary;
    invoices: CreditInvoice[];
    repayments: OrderPayment[];
    accounts: PaymentAccountOption[];
}

const REPAYMENT_CHIP: Record<string, { label: string; className: string }> = {
    pending: { label: "Waiting for customer", className: "border-outline/40 bg-surface-container text-on-surface-variant" },
    claimed: { label: "Owner checking", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    confirmed: { label: "Received", className: "border-success/30 bg-success-container/60 text-on-success-container" },
};

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : "—");

export default function CustomerCreditCard({
    customerId,
    customerName,
    credit,
    invoices,
    repayments,
    accounts,
}: Props): React.ReactElement {
    const [taking, setTaking] = useState(false);
    const [amount, setAmount] = useState<number>(0);
    const [legs, setLegs] = useState<PaymentLeg[]>([]);
    const [busy, setBusy] = useState(false);

    // What can still be collected: owed, less repayments already on their way.
    const onTheWay = repayments
        .filter((part) => part.status === "pending" || part.status === "claimed")
        .reduce((sum, part) => sum + part.amount, 0);
    const collectable = Math.max(0, Math.round((credit.outstanding - onTheWay) * 100) / 100);
    const owing = invoices.filter((invoice) => invoice.owed > 0);

    const start = (): void => {
        setAmount(collectable);
        setLegs([]);
        setTaking(true);
    };

    const submit = (): void => {
        setBusy(true);
        router.post(
            route("seller.customers.repay", customerId),
            { parts: legsToParts(legs) },
            {
                preserveScroll: true,
                onSuccess: () => setTaking(false),
                onFinish: () => setBusy(false),
            },
        );
    };

    const act = (part: OrderPayment, action: "claim" | "void"): void => {
        setBusy(true);
        router.post(
            route(action === "claim" ? "seller.customers.repayments.claim" : "seller.customers.repayments.void", [customerId, part.id]),
            {},
            { preserveScroll: true, onFinish: () => setBusy(false) },
        );
    };

    return (
        <SellerCard>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Credit</Typography>

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[10px] bg-surface-container-low p-2">
                    <p className="text-[10px] text-on-surface-variant">Owes</p>
                    <p className="text-sm font-bold text-on-surface">{birr(credit.outstanding)}</p>
                </div>
                <div className="rounded-[10px] bg-surface-container-low p-2">
                    <p className="text-[10px] text-on-surface-variant">Available</p>
                    <p className="text-sm font-bold text-on-surface">{birr(credit.available)}</p>
                </div>
                <div className="rounded-[10px] bg-surface-container-low p-2">
                    <p className="text-[10px] text-on-surface-variant">Limit</p>
                    <p className="text-sm font-bold text-on-surface">{credit.enabled ? birr(credit.limit) : "None"}</p>
                </div>
            </div>
            <p className="mt-1.5 text-[11px] text-outline">
                {credit.enabled ? `Pays within ${credit.days} days of each order. ` : ""}Only an admin changes the limit.
            </p>

            {credit.overdue > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-[10px] border border-error/30 bg-error-container/60 px-2.5 py-2 text-[11px] text-on-error-container">
                    <span className="material-symbols-outlined text-[15px]">warning</span>
                    {birr(credit.overdue)} overdue since {date(credit.oldest_due)}.
                    {credit.override ? " An admin lets them keep buying on credit." : " No new credit until it is paid."}
                </p>
            ) : null}

            {owing.length > 0 ? (
                <div className="mt-3 divide-y divide-outline-variant/60">
                    {owing.map((invoice) => (
                        <div key={invoice.sale_id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                            <span className="font-mono text-on-surface-variant">{invoice.reference}</span>
                            <span className={invoice.overdue ? "font-semibold text-error" : "text-outline"}>
                                due {date(invoice.due_date)}
                            </span>
                            <span className="font-bold text-on-surface">{birr(invoice.owed)}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {repayments.length > 0 ? (
                <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Repayments</p>
                    {repayments.map((part) => {
                        const chip = REPAYMENT_CHIP[part.status] ?? REPAYMENT_CHIP.pending;

                        return (
                            <div key={part.id} className="rounded-[10px] border border-outline-variant p-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-on-surface">
                                            {part.account ? `${part.account.provider_name} · ${part.account.account_number}` : "Cash"}
                                        </p>
                                        <p className="text-[10px] text-outline">{date(part.created_at)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-xs font-bold text-on-surface">{birr(part.amount)}</p>
                                        <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${chip.className}`}>
                                            {chip.label}
                                        </span>
                                    </div>
                                </div>
                                {part.not_received_at ? (
                                    <p className="mt-1.5 text-[11px] text-on-warning-container">
                                        Not received yet: {part.account?.owner ?? "the owner"} found no deposit.
                                    </p>
                                ) : null}
                                {part.status === "pending" && part.account ? (
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => act(part, "void")}
                                            disabled={busy}
                                            className="rounded-[999px] border border-outline/50 px-3 py-1.5 text-[11px] font-semibold text-on-surface disabled:opacity-40"
                                        >
                                            Remove
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => act(part, "claim")}
                                            disabled={busy}
                                            className="flex-1 rounded-[999px] bg-primary py-1.5 text-[11px] font-bold text-on-primary disabled:opacity-40"
                                        >
                                            Customer says paid
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {taking ? (
                <div className="mt-3 space-y-3 border-t border-outline-variant/60 pt-3">
                    <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                            Amount they are paying (up to {birr(collectable)})
                        </span>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={amount}
                            onChange={(event) => {
                                setAmount(Number(event.target.value) || 0);
                                setLegs([]);
                            }}
                            className="w-full rounded-[8px] border-outline-variant px-2 py-1.5 text-sm focus:border-primary focus:ring-0"
                        />
                    </label>
                    <PaymentSplitEditor
                        accounts={accounts}
                        total={amount}
                        legs={legs}
                        onChange={setLegs}
                        order={{ reference: "Credit repayment", customer: customerName }}
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setTaking(false)}
                            className="rounded-[999px] border border-outline/50 px-4 py-2 text-xs font-semibold text-on-surface"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={
                                busy ||
                                amount <= 0 ||
                                Math.round(amount * 100) > Math.round(collectable * 100) ||
                                !legsBalanced(legs, amount)
                            }
                            className="rounded-[999px] bg-primary px-5 py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                        >
                            Record repayment
                        </button>
                    </div>
                </div>
            ) : collectable > 0 ? (
                <button
                    type="button"
                    onClick={start}
                    className="mt-3 w-full rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary active:scale-[0.98]"
                >
                    Take a repayment
                </button>
            ) : null}
        </SellerCard>
    );
}
