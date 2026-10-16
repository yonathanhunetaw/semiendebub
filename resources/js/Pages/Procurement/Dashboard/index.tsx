import React from "react";
import { Head, Link } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkCard, SkCardHeader, SkHeader, SkStats, fmt } from "@/Components/StockKeeper/skKit";
import { InstallmentPill, PurchaseStatusPill, day, dueText, money } from "@/Components/Procurement/procurementUi";
import type { OpenInstallment, PayablesTotals, PurchaseSummary } from "@/types/procurement";

interface Props {
    stats: { drafts: number; awaiting_approval: number; open: number; open_value_etb: number; suppliers: number };
    forMe?: PurchaseSummary[];
    myDrafts?: PurchaseSummary[];
    recent?: PurchaseSummary[];
    money: PayablesTotals;
    dueSoon?: OpenInstallment[];
    adminLimit: number;
}

function OrderRow({ order }: { order: PurchaseSummary }) {
    return (
        <Link
            href={route("procurement.purchase_orders.show", order.id)}
            className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-3 last:border-0 hover:bg-surface-container-low"
        >
            <span className="min-w-0">
                <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-on-surface">{order.reference_number}</span>
                    <PurchaseStatusPill status={order.status} size="xs" />
                </span>
                <span className="block truncate text-[13px] text-on-surface-variant">
                    {order.supplier ?? "—"}
                    {order.raised_by ? ` · by ${order.raised_by}` : ""}
                </span>
            </span>
            <span className="shrink-0 text-right">
                <span className="block text-[14px] font-bold tabular-nums">{money(order.subtotal_foreign, order.currency)}</span>
                {order.currency !== "ETB" ? <span className="block text-[12px] text-on-surface-variant tabular-nums">{money(order.total_amount)}</span> : null}
            </span>
        </Link>
    );
}

/** The procurement home: what waits on whom, and the open order book. */
export default function ProcurementDashboard({ stats, forMe = [], myDrafts = [], recent = [], money: owed, dueSoon = [], adminLimit }: Props) {
    return (
        <>
            <Head title="Procurement" />

            <SkHeader
                title="Procurement"
                subtitle={`Raise an order, have a second person approve it (a global admin from ${money(adminLimit)}), then place it with the supplier.`}
                actions={
                    <Link href={route("procurement.purchase_orders.create")} className="inline-flex items-center gap-1.5 rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary shadow-sm lg:hidden">
                        <span className="material-symbols-outlined text-[19px]">add</span>
                        New order
                    </Link>
                }
            />

            <SkStats
                items={[
                    { label: "Drafts", value: fmt(stats.drafts), icon: "edit_note" },
                    { label: "Awaiting approval", value: fmt(stats.awaiting_approval), icon: "how_to_reg", tone: stats.awaiting_approval > 0 ? "warning" : undefined },
                    { label: "Open orders", value: fmt(stats.open), icon: "receipt_long", hint: money(stats.open_value_etb) },
                    { label: "Active suppliers", value: fmt(stats.suppliers), icon: "storefront" },
                ]}
            />

            <SkStats
                cols={3}
                items={[
                    { label: "Owed to suppliers", value: money(owed.owed_etb), icon: "account_balance" },
                    { label: "Overdue", value: money(owed.overdue_etb), icon: "running_with_errors", tone: owed.overdue_etb > 0 ? "error" : undefined },
                    { label: "Due this week", value: money(owed.due_soon_etb), icon: "event", tone: owed.due_soon_etb > 0 ? "warning" : undefined },
                ]}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {dueSoon.length > 0 ? (
                    <SkCard className="xl:col-span-2">
                        <SkCardHeader
                            icon="payments"
                            title="Payments due"
                            right={
                                <Link href={route("procurement.payables.index")} className="text-[13px] font-bold text-primary hover:underline">
                                    All payables
                                </Link>
                            }
                        />
                        {dueSoon.map((i) => (
                            <Link
                                key={i.id}
                                href={i.purchase_id ? route("procurement.purchase_orders.show", i.purchase_id) : route("procurement.payables.index")}
                                className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-3 last:border-0 hover:bg-surface-container-low"
                            >
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="font-mono text-[13px] font-bold">{i.reference}</span>
                                        <InstallmentPill state={i.state} />
                                    </span>
                                    <span className="block truncate text-[13px] text-on-surface-variant">
                                        {i.supplier} · {i.label} · {dueText(i.due_rule, i.due_days, i.due_on)}
                                    </span>
                                </span>
                                <span className="shrink-0 text-[14px] font-bold tabular-nums">{money(i.remaining, i.currency)}</span>
                            </Link>
                        ))}
                    </SkCard>
                ) : null}

                <SkCard>
                    <SkCardHeader icon="how_to_reg" title="Waiting for your approval" right={<span className="text-[13px] font-bold text-on-surface-variant">{forMe.length}</span>} />
                    {forMe.length === 0 ? (
                        <EmptyState className="px-4 py-6" icon="task_alt" title="Nothing to approve" description="Orders someone else submitted, within your limit, show up here." />
                    ) : (
                        forMe.map((o) => <OrderRow key={o.id} order={o} />)
                    )}
                </SkCard>

                <SkCard>
                    <SkCardHeader icon="edit_note" title="Your drafts" />
                    {myDrafts.length === 0 ? (
                        <EmptyState className="px-4 py-6" icon="draft" title="No drafts" description="Orders you started and have not submitted yet." />
                    ) : (
                        myDrafts.map((o) => <OrderRow key={o.id} order={o} />)
                    )}
                </SkCard>

                <SkCard className="xl:col-span-2">
                    <SkCardHeader
                        icon="history"
                        title="Latest orders"
                        right={
                            <Link href={route("procurement.purchase_orders.index")} className="text-[13px] font-bold text-primary hover:underline">
                                All orders
                            </Link>
                        }
                    />
                    {recent.length === 0 ? (
                        <EmptyState className="px-4 py-6" icon="receipt_long" title="No purchase orders yet" description="Add a supplier, then raise your first order." />
                    ) : (
                        recent.map((o) => <OrderRow key={o.id} order={o} />)
                    )}
                    {recent.length > 0 ? (
                        <p className="px-4 py-2 text-[12px] text-on-surface-variant">Dates show when each order was raised; open one for every step. Latest: {day(recent[0].created_at)}.</p>
                    ) : null}
                </SkCard>
            </div>
        </>
    );
}

ProcurementDashboard.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
