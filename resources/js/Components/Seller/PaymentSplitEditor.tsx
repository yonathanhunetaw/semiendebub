import {
    allocateSplit,
    birr,
    findProvider,
    formatLegsForCopy,
    type PaymentLeg,
    type SplitPreset,
} from "@/Data/sellerOrderFlow";
import type { CreditSummary, PaymentAccountOption, PaymentPartInput } from "@/types/payments";
import React, { useState } from "react";

/**
 * Split an amount across the store's payment accounts and cash.
 *
 * Every tap on an account adds a leg, so the same bank can take two or three
 * parts, and banks, wallets and cash mix freely. The legs must add up to
 * `total` exactly; the server checks the same. Account legs wait for the
 * account's owner to confirm the money arrived; cash is taken on the spot.
 *
 * When the customer has credit (an admin set it), part of the total can go
 * on credit, up to what is left of their limit.
 *
 * Used by the order confirmation (the whole total), To pay (what is left
 * after parts already claimed or confirmed) and credit repayments.
 */

let legSeq = 0;
const nextLegKey = (): string => `leg-${++legSeq}`;

/** Within a cent of the total. */
export const legsBalanced = (legs: PaymentLeg[], total: number): boolean =>
    legs.length > 0 &&
    legs.every((leg) => leg.amount > 0) &&
    Math.abs(Math.round(legs.reduce((sum, leg) => sum + leg.amount, 0) * 100) - Math.round(total * 100)) < 1;

/** What the legs put on credit fits in what the customer has left. */
export const creditWithinLimit = (legs: PaymentLeg[], credit: CreditSummary | null | undefined): boolean => {
    const onCredit = legs.filter((leg) => leg.credit).reduce((sum, leg) => sum + leg.amount, 0);

    return onCredit === 0 || (credit != null && credit.blocked_reason === null && Math.round(onCredit * 100) <= Math.round(credit.available * 100));
};

/** The legs as the server takes them. */
export const legsToParts = (legs: PaymentLeg[]): PaymentPartInput[] =>
    legs.map((leg) => ({
        payment_account_id: leg.credit ? null : leg.accountId,
        method: leg.credit ? "credit" : null,
        amount: Math.round(leg.amount * 100) / 100,
        transaction_reference: leg.reference.trim() || null,
    }));

interface Props {
    accounts: PaymentAccountOption[];
    /** What the legs must add up to. */
    total: number;
    legs: PaymentLeg[];
    onChange: (legs: PaymentLeg[]) => void;
    /** For the block the seller pastes to the customer. */
    order: { reference: string; customer: string };
    /** The customer's credit; omit where credit does not apply (repayments). */
    credit?: CreditSummary | null;
}

function AccountChip({ provider, type }: { provider: string | null; type: "bank" | "wallet" | "cash" }): React.ReactElement {
    if (provider === null) {
        return (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] bg-success-container text-on-success-container">
                <span className="material-symbols-outlined text-[18px]">payments</span>
            </span>
        );
    }

    const style = findProvider(provider);

    return (
        <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] text-xs font-bold ${
                style?.tone ?? "bg-surface-container-high text-on-surface"
            }`}
        >
            {style?.initials ?? (type === "wallet" ? "W" : "B")}
        </span>
    );
}

export default function PaymentSplitEditor({ accounts, total, legs, onChange, order, credit = null }: Props): React.ReactElement {
    const [copied, setCopied] = useState(false);

    const allocated = legs.reduce((sum, leg) => sum + leg.amount, 0);
    const remaining = Math.round((total - allocated) * 100) / 100;
    const balanced = legsBalanced(legs, total);

    const change = (next: PaymentLeg[]): void => {
        onChange(next);
        setCopied(false);
    };

    const add = (accountId: number | null, onCredit = false): void =>
        change(allocateSplit([...legs, { key: nextLegKey(), accountId, credit: onCredit, amount: 0, reference: "" }], total, "equal"));

    const creditOk = creditWithinLimit(legs, credit);
    const creditUsed = legs.filter((leg) => leg.credit).length;

    const update = (key: string, patch: Partial<PaymentLeg>): void =>
        change(legs.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg)));

    const remove = (key: string): void =>
        change(allocateSplit(legs.filter((leg) => leg.key !== key), total, "equal"));

    const preset = (id: SplitPreset): void => change(allocateSplit(legs, total, id));

    const copy = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(formatLegsForCopy(legs, accounts, order));
            setCopied(true);
        } catch {
            // Clipboard is blocked in some embedded webviews; the block stays
            // on screen and selectable, so the seller can copy it by hand.
            setCopied(false);
        }
    };

    const groups: Array<{ title: string; rows: PaymentAccountOption[] }> = [
        { title: "Banks", rows: accounts.filter((account) => account.type === "bank") },
        { title: "Mobile wallets", rows: accounts.filter((account) => account.type === "wallet") },
    ].filter((group) => group.rows.length > 0);

    const uses = (accountId: number | null): number => legs.filter((leg) => !leg.credit && leg.accountId === accountId).length;
    const hasAccountLeg = legs.some((leg) => !leg.credit && leg.accountId !== null);

    return (
        <div className="space-y-3">
            {accounts.length === 0 ? (
                <p className="rounded-[10px] border border-warning/30 bg-warning-container/60 px-3 py-2 text-[11px] text-on-warning-container">
                    This store has no payment accounts yet. Ask an admin to add them under Payment accounts. Cash
                    still works.
                </p>
            ) : null}

            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {groups.map((group) => (
                    <div key={group.title} className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">{group.title}</p>
                        {group.rows.map((account) => (
                            <AccountRow
                                key={account.id}
                                chip={<AccountChip provider={account.provider} type={account.type} />}
                                title={account.provider_name}
                                detail={`${account.account_number} · ${account.account_name}`}
                                note={account.owner ? `Confirmed by ${account.owner}` : null}
                                count={uses(account.id)}
                                onAdd={() => add(account.id)}
                            />
                        ))}
                    </div>
                ))}

                {credit?.enabled ? (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Customer credit</p>
                        {credit.blocked_reason ? (
                            <div className="flex items-start gap-2 rounded-[10px] border border-warning/30 bg-warning-container/60 p-2.5 text-[11px] text-on-warning-container">
                                <span className="material-symbols-outlined text-[16px]">block</span>
                                <span>
                                    {credit.blocked_reason}
                                    {credit.overdue > 0 ? ` ${birr(credit.overdue)} is overdue.` : ""}
                                </span>
                            </div>
                        ) : (
                            <AccountRow
                                chip={
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] bg-info-container text-on-info-container">
                                        <span className="material-symbols-outlined text-[18px]">credit_card</span>
                                    </span>
                                }
                                title="Add to credit"
                                detail={`${birr(credit.available)} available · due in ${credit.days} days`}
                                note={credit.outstanding > 0 ? `Already owes ${birr(credit.outstanding)}` : null}
                                count={creditUsed}
                                onAdd={() => (creditUsed === 0 ? add(null, true) : undefined)}
                            />
                        )}
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">In hand</p>
                    <AccountRow
                        chip={<AccountChip provider={null} type="cash" />}
                        title="Cash"
                        detail="Taken by you now"
                        note={null}
                        count={uses(null)}
                        onAdd={() => add(null)}
                    />
                </div>
            </div>

            <div className="space-y-2.5 rounded-[10px] border border-dashed border-outline/50 p-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-on-surface">
                        {legs.length === 0 ? "No parts yet" : `${legs.length} part${legs.length === 1 ? "" : "s"}`}
                    </span>
                    <span
                        className={`font-mono text-[11px] font-bold ${balanced ? "text-success" : "text-error"}`}
                    >
                        {balanced
                            ? "Balanced"
                            : remaining >= 0
                              ? `${birr(remaining)} left`
                              : `${birr(-remaining)} over`}
                    </span>
                </div>

                {!creditOk ? (
                    <p className="text-[11px] font-semibold text-error">
                        Only {birr(credit?.available ?? 0)} of credit is available.
                    </p>
                ) : null}

                {legs.length === 0 ? (
                    <p className="py-2 text-center text-[11px] text-outline">
                        Tap an account or Cash to add a part. Tap the same one again to add another.
                    </p>
                ) : (
                    <div className="flex items-center gap-1.5">
                        {([
                            { id: "equal", label: "Split equally" },
                            { id: "half", label: "Half" },
                            { id: "clear", label: "Clear" },
                        ] as Array<{ id: SplitPreset; label: string }>).map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => preset(entry.id)}
                                disabled={entry.id === "half" && legs.length < 2}
                                className="rounded-[999px] border border-outline/50 bg-surface-container-lowest px-2.5 py-1 text-[10px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95 disabled:opacity-35"
                            >
                                {entry.label}
                            </button>
                        ))}
                    </div>
                )}

                {legs.map((leg) => {
                    const account = leg.credit ? null : (accounts.find((entry) => entry.id === leg.accountId) ?? null);

                    return (
                        <div
                            key={leg.key}
                            className="space-y-2 rounded-[8px] border border-outline-variant bg-surface-container-lowest p-2.5"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-[11px] font-bold text-on-surface">
                                    {leg.credit
                                        ? "On credit"
                                        : account
                                          ? `${account.provider_name} · ${account.account_number}`
                                          : "Cash"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => remove(leg.key)}
                                    aria-label="Remove part"
                                    className="text-outline hover:text-error"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            </div>

                            <div className={`grid gap-2 ${account ? "grid-cols-2" : "grid-cols-1"}`}>
                                <label className="block">
                                    <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                                        Amount (ETB)
                                    </span>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={leg.amount}
                                        onChange={(event) => update(leg.key, { amount: Number(event.target.value) || 0 })}
                                        className="w-full rounded-[6px] border-outline-variant px-2 py-1 text-[11px] focus:border-primary focus:ring-0"
                                    />
                                </label>
                                {account ? (
                                    <label className="block">
                                        <span className="mb-0.5 block text-[10px] font-medium text-on-surface-variant">
                                            Reference (optional)
                                        </span>
                                        <input
                                            type="text"
                                            value={leg.reference}
                                            onChange={(event) => update(leg.key, { reference: event.target.value })}
                                            placeholder="Transaction no."
                                            className="w-full rounded-[6px] border-outline-variant px-2 py-1 font-mono text-[11px] focus:border-primary focus:ring-0"
                                        />
                                    </label>
                                ) : null}
                            </div>
                        </div>
                    );
                })}

                {hasAccountLeg ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                Send to customer
                            </span>
                            <button
                                type="button"
                                onClick={copy}
                                className="flex items-center gap-1 rounded-[999px] border border-outline/50 px-2.5 py-1 text-[10px] font-bold text-on-surface active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[13px]">
                                    {copied ? "check" : "content_copy"}
                                </span>
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                        <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap rounded-[8px] bg-inverse-surface p-2.5 font-mono text-[10px] leading-relaxed text-inverse-on-surface">
                            {formatLegsForCopy(legs, accounts, order)}
                        </pre>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AccountRow({
    chip,
    title,
    detail,
    note,
    count,
    onAdd,
}: {
    chip: React.ReactNode;
    title: string;
    detail: string;
    note: string | null;
    count: number;
    onAdd: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onAdd}
            className={`flex w-full items-center justify-between rounded-[10px] border p-2.5 text-left transition-colors ${
                count > 0 ? "border-primary bg-primary-container/25" : "border-outline-variant hover:bg-surface-container-low/60"
            }`}
        >
            <span className="flex min-w-0 items-center gap-2.5">
                {chip}
                <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-on-surface">{title}</span>
                    <span className="block truncate font-mono text-[10px] text-on-surface-variant">{detail}</span>
                    {note ? <span className="block truncate text-[10px] text-outline">{note}</span> : null}
                </span>
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
                {count > 0 ? (
                    <span className="rounded-[999px] bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-primary">
                        ×{count}
                    </span>
                ) : null}
                <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
            </span>
        </button>
    );
}
