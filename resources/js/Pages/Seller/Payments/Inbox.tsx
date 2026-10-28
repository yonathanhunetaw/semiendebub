import SellerLayout from "@/Layouts/SellerLayout";
import { birr } from "@/Data/sellerOrderFlow";
import type { InboxPayment, RemittanceRow, WaitingPayment } from "@/types/payments";
import { Head, router } from "@inertiajs/react";
import React, { useState } from "react";
import { dayDateTime } from "@/utils/dates";
import AgeBadge from "@/Components/Shared/time/AgeBadge";

/**
 * Payments to confirm.
 *
 * Parts a customer says they paid into one of this seller's accounts, oldest
 * first. The owner checks the account (the bank SMS or the wallet app) and
 * confirms what arrived, or answers "not received yet", which sends the part
 * back to the seller who took the order. Once every part of an order is
 * confirmed it moves to Pick & pack.
 *
 * Deposits expected in the owner's accounts show here as soon as the seller
 * saves the split, before anyone taps "Customer says paid": the owner may
 * confirm one the moment it arrives.
 *
 * Handovers are sellers sending their takings to a settlement account this
 * seller owns: confirming takes the amount off the sender's balance.
 *
 * Every confirmation asks "are you sure?" first: it cannot be undone.
 *
 * Deposits into the owner's own accounts that the owner recorded or marked
 * paid themselves are listed last, read-only: two people handle every money
 * part, so the store's admin or manager confirms those.
 */

interface Props {
    payments?: InboxPayment[];
    expected?: InboxPayment[];
    handovers?: RemittanceRow[];
    waiting_on_others?: WaitingPayment[];
}

/** What the "are you sure?" sheet is about to confirm. */
type PendingConfirm =
    | { kind: "payment"; payment: InboxPayment }
    | { kind: "handover"; handover: RemittanceRow };

const accountName = (payment: Pick<InboxPayment, "account">): string =>
    payment.account ? `${payment.account.provider_name} · ${payment.account.account_number}` : "Cash in hand";

export default function Inbox({ payments = [], expected = [], handovers = [], waiting_on_others: waiting = [] }: Props): React.ReactElement {
    const [busy, setBusy] = useState<number | null>(null);
    const [busyHandover, setBusyHandover] = useState<number | null>(null);
    const [asking, setAsking] = useState<PendingConfirm | null>(null);

    const settle = (handover: RemittanceRow, action: "confirm" | "reject"): void => {
        setBusyHandover(handover.id);
        router.post(
            route(action === "confirm" ? "seller.handovers.confirm" : "seller.handovers.reject", handover.id),
            {},
            { preserveScroll: true, onFinish: () => setBusyHandover(null) },
        );
    };

    const act = (payment: InboxPayment, action: "confirm" | "reject"): void => {
        setBusy(payment.id);
        router.post(
            route(action === "confirm" ? "seller.payments.confirm" : "seller.payments.reject", payment.id),
            {},
            { preserveScroll: true, onFinish: () => setBusy(null) },
        );
    };

    return (
        <>
            <Head title="Payments to confirm" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">Payments to confirm</h1>
                    <p className="text-[11px] text-outline">
                        Check each account, then confirm what arrived.
                    </p>
                </header>

                <div className="space-y-3 px-3.5 pt-3">
                    {handovers.length > 0 ? (
                        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                            Handovers from sellers
                        </p>
                    ) : null}
                    {handovers.map((handover) => (
                        <div
                            key={`h${handover.id}`}
                            className="rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-on-surface">
                                        {handover.to ? `${handover.to.provider_name} · ${handover.to.account_number}` : "Settlement"}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                        From {handover.by ?? "a seller"} · {handover.from}
                                    </p>
                                </div>
                                <span className="shrink-0 text-[15px] font-extrabold text-on-surface">{birr(handover.amount)}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-outline">
                                {handover.reference ? `Reference ${handover.reference} · ` : ""}
                                {dayDateTime(handover.at, "")}
                            </p>
                            <p className="mt-1">
                                <AgeBadge since={handover.at} warnHours={12} lateHours={48} prefix="waiting " />
                            </p>
                            <div className="mt-3 flex gap-2 border-t border-outline-variant/60 pt-3">
                                <button
                                    type="button"
                                    onClick={() => settle(handover, "reject")}
                                    disabled={busyHandover !== null}
                                    className="flex-1 rounded-[999px] border border-outline/50 py-2 text-xs font-semibold text-on-surface disabled:opacity-40"
                                >
                                    Not received
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAsking({ kind: "handover", handover })}
                                    disabled={busyHandover !== null}
                                    className="flex-1 rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                                >
                                    {busyHandover === handover.id ? "Saving…" : "Confirm received"}
                                </button>
                            </div>
                        </div>
                    ))}

                    {handovers.length > 0 && payments.length > 0 ? (
                        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                            Customer deposits
                        </p>
                    ) : null}
                    {payments.map((payment) => (
                        <div
                            key={payment.id}
                            className="rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-on-surface">{accountName(payment)}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                        {payment.customer} · <span className="font-mono">{payment.order}</span>
                                    </p>
                                </div>
                                <span className="shrink-0 text-[15px] font-extrabold text-on-surface">
                                    {birr(payment.amount)}
                                </span>
                            </div>

                            <div className="mt-2 space-y-0.5 text-[11px] text-outline">
                                {payment.reference ? (
                                    <p>
                                        Reference <span className="font-mono text-on-surface-variant">{payment.reference}</span>
                                    </p>
                                ) : null}
                                <p>
                                    {payment.account ? "Marked paid by" : "Cash taken by"} {payment.claimed_by ?? "a seller"}
                                    {payment.claimed_at ? ` · ${dayDateTime(payment.claimed_at)}` : ""}
                                </p>
                                <p>
                                    <AgeBadge since={payment.claimed_at ?? payment.created_at} warnHours={12} lateHours={48} prefix="waiting " />
                                </p>
                                <p>
                                    Order total {birr(payment.order_total)}
                                    {payment.store ? ` · ${payment.store}` : ""}
                                </p>
                            </div>

                            <div className="mt-3 flex gap-2 border-t border-outline-variant/60 pt-3">
                                <button
                                    type="button"
                                    onClick={() => act(payment, "reject")}
                                    disabled={busy !== null}
                                    className="flex-1 rounded-[999px] border border-outline/50 py-2 text-xs font-semibold text-on-surface disabled:opacity-40"
                                >
                                    Not received yet
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAsking({ kind: "payment", payment })}
                                    disabled={busy !== null}
                                    className="flex-1 rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                                >
                                    {busy === payment.id ? "Saving…" : "Confirm received"}
                                </button>
                            </div>
                        </div>
                    ))}

                    {expected.length > 0 ? (
                        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                            Expected in your accounts · not marked paid yet
                        </p>
                    ) : null}
                    {expected.map((payment) => (
                        <div
                            key={`e${payment.id}`}
                            className="rounded-[16px] border border-dashed border-info/50 bg-surface-container-lowest p-3.5"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-on-surface">{accountName(payment)}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                        {payment.customer} · <span className="font-mono">{payment.order}</span>
                                    </p>
                                </div>
                                <span className="shrink-0 text-[15px] font-extrabold text-on-surface">{birr(payment.amount)}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-outline">
                                Recorded by {payment.recorded_by ?? "a seller"} · {dayDateTime(payment.created_at)}
                                {payment.store ? ` · ${payment.store}` : ""}
                            </p>
                            <p className="mt-1 text-[11px] text-on-surface-variant">
                                Already in the account? Confirm it now; the seller does not have to mark it first.
                            </p>
                            <button
                                type="button"
                                onClick={() => setAsking({ kind: "payment", payment })}
                                disabled={busy !== null}
                                className="mt-3 w-full rounded-[999px] border-2 border-primary py-2 text-xs font-bold text-primary disabled:opacity-40"
                            >
                                {busy === payment.id ? "Saving…" : "It arrived · confirm"}
                            </button>
                        </div>
                    ))}

                    {waiting.length > 0 ? (
                        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                            Waiting for a second person · {waiting.length}
                        </p>
                    ) : null}
                    {waiting.map((payment) => (
                        <div key={`w${payment.id}`} className="rounded-[16px] border border-outline-variant/60 bg-surface-container-low p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-on-surface">{accountName(payment)}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                        {payment.customer} · <span className="font-mono">{payment.order}</span>
                                    </p>
                                </div>
                                <span className="shrink-0 text-[15px] font-extrabold text-on-surface">{birr(payment.amount)}</span>
                            </div>
                            <div className="mt-2 flex items-start gap-2 rounded-[10px] bg-surface-container-lowest px-2.5 py-2 text-[11px] leading-snug text-on-surface-variant">
                                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-primary">group</span>
                                <span>
                                    {payment.status === "claimed"
                                        ? "You marked this paid, so you can't also confirm it."
                                        : "You recorded this payment. Mark it paid on the order once the customer pays."}{" "}
                                    {payment.confirmers.length > 0 ? (
                                        <>
                                            <b className="text-on-surface">{payment.confirmers.slice(0, 3).join(", ")}</b>
                                            {payment.confirmers.length > 3 ? ` +${payment.confirmers.length - 3}` : ""} or an admin confirms it.
                                        </>
                                    ) : (
                                        "An admin confirms it."
                                    )}
                                </span>
                            </div>
                            <p className="mt-2 text-[11px] text-outline">
                                {payment.status === "claimed" && payment.claimed_at ? `Marked paid ${dayDateTime(payment.claimed_at)}` : `Recorded ${dayDateTime(payment.created_at)}`}
                                {payment.store ? ` · ${payment.store}` : ""}
                            </p>
                        </div>
                    ))}

                    {payments.length === 0 && handovers.length === 0 && expected.length === 0 && waiting.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-primary-container">
                                <span className="material-symbols-outlined text-[40px] text-primary">
                                    account_balance_wallet
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-on-surface">Nothing to confirm</p>
                            <p className="mt-1 text-[12px] text-on-surface-variant">
                                When a customer says they paid into one of your accounts, or a seller hands
                                money over to you, it shows up here.
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* ── Are you sure? ── */}
            {asking ? (
                <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
                    <button
                        type="button"
                        aria-label="Cancel"
                        onClick={() => setAsking(null)}
                        className="absolute inset-0 cursor-default bg-black/40"
                    />
                    <div className="relative z-10 w-full max-w-[420px] rounded-t-[20px] bg-surface-container-lowest p-5 shadow-xl sm:rounded-[20px]">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[999px] bg-primary-container text-primary">
                            <span className="material-symbols-outlined text-[26px]">verified</span>
                        </div>
                        <h2 id="confirm-title" className="text-center text-[16px] font-bold text-on-surface">
                            Are you sure?
                        </h2>
                        <p className="mt-1 text-center text-[13px] text-on-surface-variant">
                            {asking.kind === "payment" ? (
                                <>
                                    You received <strong className="text-on-surface">{birr(asking.payment.amount)}</strong> in{" "}
                                    {accountName(asking.payment)} for {asking.payment.order || "this repayment"}.
                                </>
                            ) : (
                                <>
                                    You received the <strong className="text-on-surface">{birr(asking.handover.amount)}</strong> handover from{" "}
                                    {asking.handover.by ?? "a seller"}.
                                </>
                            )}
                        </p>
                        <p className="mt-1 text-center text-[11px] text-outline">This cannot be undone.</p>
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setAsking(null)}
                                className="flex-1 rounded-[999px] border border-outline/50 py-2.5 text-xs font-semibold text-on-surface"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                autoFocus
                                onClick={() => {
                                    const current = asking;
                                    setAsking(null);
                                    if (current.kind === "payment") act(current.payment, "confirm");
                                    else settle(current.handover, "confirm");
                                }}
                                className="flex-1 rounded-[999px] bg-primary py-2.5 text-xs font-bold text-on-primary"
                            >
                                Yes, confirm
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

Inbox.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
