import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkChips, SkHeader, SkPager, SkSearch, inputClass } from "@/Components/StockKeeper/skKit";
import { PurchaseStatusPill, day, money } from "@/Components/Procurement/procurementUi";
import type { Pagination, PurchaseStatus, PurchaseSummary } from "@/types/procurement";

type Filter = "all" | "open" | PurchaseStatus;

interface Props {
    orders?: PurchaseSummary[];
    counts: Record<Filter, number>;
    filters: { status: Filter; search: string; supplier: number | null };
    suppliers?: Array<{ id: number; name: string }>;
    pagination: Pagination;
}

const SEARCH_DEBOUNCE_MS = 350;

const FILTERS: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "submitted", label: "Awaiting approval" },
    { value: "open", label: "Open" },
    { value: "received", label: "Received" },
    { value: "closed", label: "Closed" },
    { value: "cancelled", label: "Cancelled" },
];

/** Every purchase order, by status. */
export default function PurchaseOrdersIndex({ orders = [], counts, filters, suppliers = [], pagination }: Props) {
    const [search, setSearch] = React.useState(filters.search);

    const go = React.useCallback(
        (next: Partial<{ status: Filter; search: string; supplier: number | null; page: number }>) => {
            const q = { status: filters.status, search: filters.search, supplier: filters.supplier, ...next };
            router.get(
                route("procurement.purchase_orders.index"),
                {
                    ...(q.status !== "all" ? { status: q.status } : {}),
                    ...(q.search ? { search: q.search } : {}),
                    ...(q.supplier ? { supplier: q.supplier } : {}),
                    ...(next.page ? { page: next.page } : {}),
                },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        },
        [filters.status, filters.search, filters.supplier],
    );

    React.useEffect(() => {
        if (search === filters.search) return;
        const t = window.setTimeout(() => go({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [search, filters.search, go]);

    return (
        <>
            <Head title="Purchase orders" />

            <SkHeader
                title="Purchase orders"
                subtitle="Draft → submitted → approved by a second person → ordered with the supplier → received → closed."
                actions={
                    <Link href={route("procurement.purchase_orders.create")} className="inline-flex items-center gap-1.5 rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary shadow-sm hover:opacity-95">
                        <span className="material-symbols-outlined text-[19px]">add</span>
                        New order
                    </Link>
                }
            />

            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="md:max-w-[360px] md:flex-1">
                    <SkSearch value={search} onChange={setSearch} placeholder="Reference, supplier or notes…" />
                </div>
                <select
                    aria-label="Supplier"
                    className={`${inputClass} md:max-w-[260px]`}
                    value={filters.supplier ?? ""}
                    onChange={(e) => go({ supplier: e.target.value ? Number(e.target.value) : null })}
                >
                    <option value="">Every supplier</option>
                    {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mb-3">
                <SkChips<Filter> value={filters.status} onChange={(status) => go({ status })} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] ?? 0 }))} />
            </div>

            {orders.length === 0 ? (
                <EmptyState framed icon="receipt_long" title="No orders here" description="Change the filter, or raise a new order." />
            ) : (
                <div className="overflow-hidden rounded-[18px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                    <table className="w-full text-left text-[14px]">
                        <thead className="hidden bg-surface-container-low text-[12px] font-bold uppercase tracking-wide text-on-surface-variant md:table-header-group">
                            <tr>
                                <th className="px-4 py-2.5">Order</th>
                                <th className="px-4 py-2.5">Supplier</th>
                                <th className="px-4 py-2.5 text-right">Value</th>
                                <th className="px-4 py-2.5 text-right">Expected</th>
                                <th className="px-4 py-2.5 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr
                                    key={o.id}
                                    onClick={() => router.visit(route("procurement.purchase_orders.show", o.id))}
                                    className="grid cursor-pointer grid-cols-2 gap-x-3 border-b border-outline-variant/60 px-4 py-3 last:border-0 hover:bg-surface-container-low md:table-row md:p-0"
                                >
                                    <td className="md:px-4 md:py-3">
                                        <Link href={route("procurement.purchase_orders.show", o.id)} className="font-mono text-[13px] font-bold text-on-surface hover:text-primary">
                                            {o.reference_number}
                                        </Link>
                                        <span className="block text-[12px] text-on-surface-variant">
                                            {o.lines_count ?? 0} lines · {day(o.created_at)}
                                        </span>
                                    </td>
                                    <td className="text-right md:px-4 md:py-3 md:text-left">
                                        <span className="block truncate font-bold">{o.supplier ?? "—"}</span>
                                        <span className="block truncate text-[12px] text-on-surface-variant">{o.raised_by ? `by ${o.raised_by}` : ""}</span>
                                    </td>
                                    <td className="mt-1 md:mt-0 md:px-4 md:py-3 md:text-right">
                                        <span className="block font-bold tabular-nums">{money(o.subtotal_foreign, o.currency)}</span>
                                        {o.currency !== "ETB" ? <span className="block text-[12px] text-on-surface-variant tabular-nums">{money(o.total_amount)}</span> : null}
                                    </td>
                                    <td className="mt-1 hidden text-right text-[13px] text-on-surface-variant md:table-cell md:px-4 md:py-3">{day(o.expected_at)}</td>
                                    <td className="mt-1 text-right md:mt-0 md:px-4 md:py-3">
                                        <PurchaseStatusPill status={o.status} />
                                        {o.status === "submitted" && o.needs_admin ? <span className="mt-0.5 block text-[11px] text-on-surface-variant">needs a global admin</span> : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="orders" onPage={(page) => go({ page })} />
        </>
    );
}

PurchaseOrdersIndex.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
