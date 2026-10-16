import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkChips, SkHeader, SkPager, SkSearch } from "@/Components/StockKeeper/skKit";
import { termsLabel } from "@/Components/Procurement/procurementUi";
import type { Pagination, Supplier } from "@/types/procurement";

type Show = "active" | "inactive" | "all";

interface Props {
    suppliers?: Supplier[];
    filters: { search: string; show: Show };
    pagination: Pagination;
}

const SEARCH_DEBOUNCE_MS = 350;

/** The shops procurement buys from. */
export default function SuppliersIndex({ suppliers = [], filters, pagination }: Props) {
    const [search, setSearch] = React.useState(filters.search);

    const go = React.useCallback(
        (next: Partial<{ search: string; show: Show; page: number }>) => {
            const q = { search: filters.search, show: filters.show, ...next };
            router.get(
                route("procurement.suppliers.index"),
                { ...(q.search ? { search: q.search } : {}), ...(q.show !== "active" ? { show: q.show } : {}), ...(next.page ? { page: next.page } : {}) },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        },
        [filters.search, filters.show],
    );

    React.useEffect(() => {
        if (search === filters.search) return;
        const t = window.setTimeout(() => go({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [search, filters.search, go]);

    return (
        <>
            <Head title="Suppliers" />

            <SkHeader
                title="Suppliers"
                subtitle="The shops we buy from, usually abroad. A supplier has no login: it is who a purchase order is raised with."
                actions={
                    <Link href={route("procurement.suppliers.create")} className="inline-flex items-center gap-1.5 rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary shadow-sm hover:opacity-95">
                        <span className="material-symbols-outlined text-[19px]">add</span>
                        Add supplier
                    </Link>
                }
            />

            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="sm:max-w-[360px] sm:flex-1">
                    <SkSearch value={search} onChange={setSearch} placeholder="Name, country or city…" />
                </div>
                <SkChips<Show>
                    value={filters.show}
                    onChange={(show) => go({ show })}
                    options={[
                        { value: "active", label: "Active" },
                        { value: "inactive", label: "Inactive" },
                        { value: "all", label: "All" },
                    ]}
                />
            </div>

            {suppliers.length === 0 ? (
                <EmptyState
                    framed
                    icon="storefront"
                    title="No suppliers here"
                    description={filters.search ? "Nothing matches that search." : "Add the first shop you buy from."}
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {suppliers.map((s) => (
                        <Link
                            key={s.id}
                            href={route("procurement.suppliers.edit", s.id)}
                            className="group rounded-[18px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition hover:border-primary"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-[16px] font-extrabold text-on-surface group-hover:text-primary">{s.name}</p>
                                    <p className="truncate text-[13px] text-on-surface-variant">{[s.city, s.country].filter(Boolean).join(", ") || "Country not set"}</p>
                                </div>
                                <span className="shrink-0 rounded-[8px] bg-surface-container px-2 py-0.5 font-mono text-[12px] font-bold text-on-surface-variant">{s.currency}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-on-surface-variant">
                                <span className="inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px]">payments</span>
                                    {termsLabel(s.default_payment_terms, s.default_payment_days)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                                    {s.orders_count ?? 0} orders{s.open_orders_count ? ` · ${s.open_orders_count} open` : ""}
                                </span>
                                {!s.is_active ? <StatusPill status="inactive" size="xs" /> : null}
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="suppliers" onPage={(page) => go({ page })} />
        </>
    );
}

SuppliersIndex.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
