import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkChips, SkHeader, SkStats, inputClass } from "@/Components/StockKeeper/skKit";
import { InstallmentPill, dueText, money } from "@/Components/Procurement/procurementUi";
import type { OpenInstallment, PayablesTotals } from "@/types/procurement";

type Bucket = "all" | "overdue" | "soon" | "later" | "waiting";

interface Props {
    installments?: OpenInstallment[];
    totals: PayablesTotals;
    bySupplier?: Array<{ supplier_id: number | null; supplier: string | null; owed_etb: number; overdue_etb: number }>;
    filters: { supplier: number | null };
    suppliers?: Array<{ id: number; name: string }>;
    dueSoonDays: number;
}

/** Everything still owed to suppliers, soonest first. ETB figures use each order's rate. */
export default function PayablesIndex({ installments = [], totals, bySupplier = [], filters, suppliers = [], dueSoonDays }: Props) {
    const [bucket, setBucket] = React.useState<Bucket>("all");
    const soon = new Date(Date.now() + dueSoonDays * 86_400_000).toISOString().slice(0, 10);

    const bucketOf = (i: OpenInstallment): Exclude<Bucket, "all"> => {
        if (i.state === "overdue") return "overdue";
        if (i.state === "waiting" || !i.due_on) return "waiting";
        return i.due_on <= soon ? "soon" : "later";
    };
    const count = (b: Bucket) => (b === "all" ? installments.length : installments.filter((i) => bucketOf(i) === b).length);
    const shown = bucket === "all" ? installments : installments.filter((i) => bucketOf(i) === bucket);

    return (
        <>
            <Head title="Payables" />

            <SkHeader
                title="Payables"
                subtitle="What we still owe suppliers, installment by installment. A payment counts once finance or a global admin confirms it."
                actions={
                    <select
                        aria-label="Supplier"
                        className={`${inputClass} sm:w-[240px]`}
                        value={filters.supplier ?? ""}
                        onChange={(e) => router.get(route("procurement.payables.index"), e.target.value ? { supplier: e.target.value } : {}, { preserveState: true, replace: true })}
                    >
                        <option value="">Every supplier</option>
                        {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                }
            />

            <SkStats
                items={[
                    { label: "Owed", value: money(totals.owed_etb), icon: "account_balance" },
                    { label: "Overdue", value: money(totals.overdue_etb), icon: "running_with_errors", tone: totals.overdue_etb > 0 ? "error" : undefined },
                    { label: `Due in ${dueSoonDays} days`, value: money(totals.due_soon_etb), icon: "event", tone: totals.due_soon_etb > 0 ? "warning" : undefined },
                    { label: "To confirm", value: totals.waiting_count, icon: "pending_actions", hint: "payments recorded, not confirmed" },
                ]}
            />

            <div className="mb-3">
                <SkChips<Bucket>
                    value={bucket}
                    onChange={setBucket}
                    options={[
                        { value: "all", label: "All", count: count("all") },
                        { value: "overdue", label: "Overdue", count: count("overdue") },
                        { value: "soon", label: `Next ${dueSoonDays} days`, count: count("soon") },
                        { value: "later", label: "Later", count: count("later") },
                        { value: "waiting", label: "No date yet", count: count("waiting") },
                    ]}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    {shown.length === 0 ? (
                        <EmptyState framed icon="task_alt" title="Nothing owed here" description="Approved orders put their payment schedule here." />
                    ) : (
                        <ul className="overflow-hidden rounded-[18px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                            {shown.map((i) => (
                                <li key={i.id} className="border-b border-outline-variant/60 last:border-0">
                                    <Link href={i.purchase_id ? route("procurement.purchase_orders.show", i.purchase_id) : "#"} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container-low">
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-2">
                                                <span className="font-mono text-[13px] font-bold">{i.reference}</span>
                                                <InstallmentPill state={i.state} />
                                            </span>
                                            <span className="block truncate text-[13px] text-on-surface-variant">
                                                {i.supplier ?? "—"} · {i.label} · due {dueText(i.due_rule, i.due_days, i.due_on)}
                                            </span>
                                        </span>
                                        <span className="text-right tabular-nums">
                                            <span className="block text-[14px] font-bold">{money(i.remaining, i.currency)}</span>
                                            {i.currency !== "ETB" ? <span className="block text-[12px] text-on-surface-variant">≈ {money(i.remaining_etb_estimate)}</span> : null}
                                            {i.waiting > 0 ? <span className="block text-[12px] text-warning">{money(i.waiting, i.currency)} to confirm</span> : null}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                    <h2 className="border-b border-outline-variant/70 px-4 py-3 text-[15px] font-extrabold">By supplier</h2>
                    {bySupplier.length === 0 ? (
                        <p className="px-4 py-3 text-[13px] text-on-surface-variant">Nothing owed.</p>
                    ) : (
                        <ul className="divide-y divide-outline-variant/60">
                            {bySupplier.map((s) => (
                                <li key={s.supplier_id ?? 0} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]">
                                    <span className="truncate font-bold">{s.supplier ?? "—"}</span>
                                    <span className="text-right tabular-nums">
                                        {money(s.owed_etb)}
                                        {s.overdue_etb > 0 ? <span className="block text-[12px] text-error">{money(s.overdue_etb)} overdue</span> : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}

PayablesIndex.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
