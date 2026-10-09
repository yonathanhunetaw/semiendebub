import SellerLayout from "@/Layouts/SellerLayout";
import { birr } from "@/Data/sellerOrderFlow";
import type { InboxPayment, RemittanceRow } from "@/types/payments";
import { Head, router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Payments to confirm.
 *
 * Parts a customer says they paid into one of this seller's accounts, oldest
 * first. The owner checks the account (the bank SMS or the wallet app) and
 * confirms what arrived, or answers "not received yet", which sends the part
 * back to the seller who took the order. Once every part of an order is
 * confirmed it moves to Pick & pack.
 *
 * Handovers are sellers sending their takings to a settlement account this
 * seller owns: confirming takes the amount off the sender's balance.
 */

interface Props {
    payments?: InboxPayment[];
    handovers?: RemittanceRow[];
}

export default function Inbox({ payments = [], handovers = [] }: Props): React.ReactElement {
    const [busy, setBusy] = useState<number | null>(null);
    const [busyHandover, setBusyHandover] = useState<number | null>(null);

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
                                {handover.at ? new Date(handover.at).toLocaleString() : ""}
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
                                    onClick={() => settle(handover, "confirm")}
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
                                    <p className="truncate text-[13px] font-bold text-on-surface">
                                        {payment.account
                                            ? `${payment.account.provider_name} · ${payment.account.account_number}`
                                            : "Cash"}
                                    </p>
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
                                    Marked paid by {payment.claimed_by ?? "a seller"}
                                    {payment.claimed_at ? ` · ${new Date(payment.claimed_at).toLocaleString()}` : ""}
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
                                    onClick={() => act(payment, "confirm")}
                                    disabled={busy !== null}
                                    className="flex-1 rounded-[999px] bg-primary py-2 text-xs font-bold text-on-primary disabled:opacity-40"
                                >
                                    {busy === payment.id ? "Saving…" : "Confirm received"}
                                </button>
                            </div>
                        </div>
                    ))}

                    {payments.length === 0 && handovers.length === 0 ? (
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
        </>
    );
}

Inbox.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
