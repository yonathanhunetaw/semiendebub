import SellerLayout from "@/Layouts/SellerLayout";
import { birr } from "@/Data/sellerOrderFlow";
import type {
    BalanceBucket,
    BalanceEntryRow,
    OverdueCash,
    PaymentAccountOption,
    RemittanceRow,
} from "@/types/payments";
import { Head, router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * The seller's balance.
 *
 * Money this seller holds for the company: deposits they confirmed into
 * their accounts and cash they took, per account and cash. They hand it over
 * to a settlement account the admin assigned them; it leaves the balance once
 * that account's owner confirms it arrived.
 */

interface Props {
    held?: number;
    buckets?: BalanceBucket[];
    overdue_cash?: OverdueCash;
    /** Settlement accounts this seller hands money over to. */
    settlement_accounts?: PaymentAccountOption[];
    remittances?: RemittanceRow[];
    entries?: BalanceEntryRow[];
}

const HANDOVER_CHIP: Record<RemittanceRow["status"], { label: string; className: string }> = {
    claimed: { label: "Owner checking", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    confirmed: { label: "Received", className: "border-success/30 bg-success-container/60 text-on-success-container" },
    rejected: { label: "Not received", className: "border-error/30 bg-error-container/60 text-on-error-container" },
};

const bucketLabel = (bucket: BalanceBucket): string =>
    bucket.account ? `${bucket.account.provider_name} · ${bucket.account.account_number}` : "Cash";

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : "");

export default function BalanceIndex({
    held = 0,
    buckets = [],
    overdue_cash,
    settlement_accounts = [],
    remittances = [],
    entries = [],
}: Props): React.ReactElement {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <>
            <Head title="Balance" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">Balance</h1>
                    <p className="text-[11px] text-outline">Money you hold for the store, until you hand it over.</p>
                </header>

                <div className="space-y-3 px-3.5 pt-3">
                    {/* ── Total ── */}
                    <section className="rounded-[16px] border border-success/30 bg-gradient-to-br from-success-container/60 to-surface-container-lowest p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">You hold</p>
                        <p className="mt-1 text-[26px] font-extrabold tracking-tight text-on-surface">{birr(held)}</p>
                        {overdue_cash && overdue_cash.amount > 0 ? (
                            <p className="mt-2 flex items-start gap-1.5 rounded-[10px] border border-warning/30 bg-warning-container/70 px-2.5 py-2 text-[11px] text-on-warning-container">
                                <span className="material-symbols-outlined text-[15px]">warning</span>
                                {birr(overdue_cash.amount)} in cash has been held more than {overdue_cash.days} days. Hand
                                it over.
                            </p>
                        ) : null}
                    </section>

                    {settlement_accounts.length === 0 && buckets.length > 0 ? (
                        <p className="rounded-[10px] border border-warning/30 bg-warning-container/60 px-3 py-2 text-[11px] text-on-warning-container">
                            You have no settlement account to hand money over to. Ask an admin to assign you one.
                        </p>
                    ) : null}

                    {/* ── Buckets ── */}
                    {buckets.map((bucket) => {
                        const key = bucket.account ? `a${bucket.account.id}` : "cash";

                        return (
                            <section
                                key={key}
                                className="rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-bold text-on-surface">{bucketLabel(bucket)}</p>
                                        {bucket.account ? (
                                            <p className="truncate text-[11px] text-on-surface-variant">{bucket.account.account_name}</p>
                                        ) : (
                                            <p className="text-[11px] text-on-surface-variant">Taken by you</p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-[15px] font-extrabold text-on-surface">{birr(bucket.held)}</span>
                                </div>

                                {bucket.handing_over > 0 ? (
                                    <p className="mt-1.5 text-[11px] text-on-surface-variant">
                                        {birr(bucket.handing_over)} being handed over · {birr(bucket.available)} left
                                    </p>
                                ) : null}

                                {open === key ? (
                                    <HandoverForm
                                        bucket={bucket}
                                        accounts={settlement_accounts}
                                        onDone={() => setOpen(null)}
                                    />
                                ) : bucket.available > 0 && settlement_accounts.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setOpen(key)}
                                        className="mt-3 w-full rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary active:scale-[0.98]"
                                    >
                                        Hand over
                                    </button>
                                ) : null}
                            </section>
                        );
                    })}

                    {buckets.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-12 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-success-container">
                                <span className="material-symbols-outlined text-[40px] text-on-success-container">
                                    account_balance_wallet
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-on-surface">Nothing held</p>
                            <p className="mt-1 text-[12px] text-on-surface-variant">
                                Deposits you confirm and cash you take show up here.
                            </p>
                        </div>
                    ) : null}

                    {/* ── Handovers ── */}
                    {remittances.length > 0 ? (
                        <section className="rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm">
                            <h2 className="mb-2 text-sm font-bold text-on-surface">Handovers</h2>
                            <div className="divide-y divide-outline-variant/60">
                                {remittances.map((row) => {
                                    const chip = HANDOVER_CHIP[row.status];

                                    return (
                                        <div key={row.id} className="flex items-start justify-between gap-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-semibold text-on-surface">
                                                    {row.from} → {row.to ? `${row.to.provider_name} · ${row.to.account_number}` : "settlement"}
                                                </p>
                                                <p className="text-[10px] text-outline">
                                                    {when(row.at)}
                                                    {row.reference ? ` · Ref. ${row.reference}` : ""}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-xs font-bold text-on-surface">{birr(row.amount)}</p>
                                                <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${chip.className}`}>
                                                    {chip.label}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ) : null}

                    {/* ── Ledger ── */}
                    {entries.length > 0 ? (
                        <section className="rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm">
                            <h2 className="mb-2 text-sm font-bold text-on-surface">History</h2>
                            <div className="divide-y divide-outline-variant/60">
                                {entries.map((entry) => (
                                    <div key={entry.id} className="flex items-start justify-between gap-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs text-on-surface">{entry.what}</p>
                                            <p className="text-[10px] text-outline">
                                                {entry.bucket} · {when(entry.at)}
                                            </p>
                                        </div>
                                        <span
                                            className={`shrink-0 font-mono text-xs font-bold ${
                                                entry.amount < 0 ? "text-on-surface-variant" : "text-success"
                                            }`}
                                        >
                                            {entry.amount < 0 ? `−${birr(-entry.amount)}` : `+${birr(entry.amount)}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </>
    );
}

function HandoverForm({
    bucket,
    accounts,
    onDone,
}: {
    bucket: BalanceBucket;
    accounts: PaymentAccountOption[];
    onDone: () => void;
}): React.ReactElement {
    const [to, setTo] = useState<number>(accounts[0]?.id ?? 0);
    const [amount, setAmount] = useState<number>(bucket.available);
    const [reference, setReference] = useState("");
    const [busy, setBusy] = useState(false);

    const valid = to > 0 && amount > 0 && Math.round(amount * 100) <= Math.round(bucket.available * 100);

    const submit = (): void => {
        setBusy(true);
        router.post(
            route("seller.balance.remit"),
            {
                from_payment_account_id: bucket.account?.id ?? null,
                to_payment_account_id: to,
                amount,
                reference: reference.trim() || null,
            },
            { preserveScroll: true, onSuccess: onDone, onFinish: () => setBusy(false) },
        );
    };

    return (
        <div className="mt-3 space-y-2 border-t border-outline-variant/60 pt-3">
            <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">To</span>
                <select
                    value={to}
                    onChange={(event) => setTo(Number(event.target.value))}
                    className="w-full rounded-[8px] border-outline-variant py-1.5 text-xs focus:border-primary focus:ring-0"
                >
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.provider_name} · {account.account_number}
                            {account.owner ? ` (${account.owner})` : ""}
                        </option>
                    ))}
                </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                        Amount (max {birr(bucket.available)})
                    </span>
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(Number(event.target.value) || 0)}
                        className="w-full rounded-[8px] border-outline-variant px-2 py-1.5 text-xs focus:border-primary focus:ring-0"
                    />
                </label>
                <label className="block">
                    <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">Reference (optional)</span>
                    <input
                        type="text"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Transfer no."
                        className="w-full rounded-[8px] border-outline-variant px-2 py-1.5 font-mono text-xs focus:border-primary focus:ring-0"
                    />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onDone}
                    className="rounded-[999px] border border-outline/50 px-4 py-2 text-xs font-semibold text-on-surface"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy || !valid}
                    className="rounded-[999px] bg-primary px-5 py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                >
                    Send handover
                </button>
            </div>
        </div>
    );
}

BalanceIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
