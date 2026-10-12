import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { KIND_LABEL, SkButton, SkCard, SkChips, SkHeader, SkPager, SkSearch, SkStats, STOCK_STATUS, fmt, plural } from "@/Components/StockKeeper/skKit";
import type { StockKeeperAlertsProps } from "@/types/stockkeeper";

const SEARCH_DEBOUNCE_MS = 350;

type Severity = "all" | "low_stock" | "out_of_stock";

/**
 * The replenishment queue: every ledger row at or below its minimum, deepest
 * breach first. Each opens its item; a transfer moves stock in.
 */
export default function StockAlerts({ alerts = [], filters, summary, pagination }: StockKeeperAlertsProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const severity = (filters.severity ?? "all") as Severity;

    const applyFilters = React.useCallback(
        (next: { search?: string; severity?: Severity; page?: number }) => {
            const query: Record<string, string | number> = {};
            const s = next.search ?? filters.search;
            const sev = next.severity ?? severity;
            if (s) query.search = s;
            if (sev !== "all") query.severity = sev;
            if (next.page) query.page = next.page;
            router.get(route("stock_keeper.alerts.index"), query, { preserveState: true, preserveScroll: true, replace: true });
        },
        [filters.search, severity],
    );

    React.useEffect(() => setSearch(filters.search), [filters.search]);
    React.useEffect(() => {
        if (search === filters.search) return;
        const timer = window.setTimeout(() => applyFilters({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    return (
        <>
            <Head title="Stock alerts" />

            <SkHeader
                title="Stock alerts"
                subtitle="Stock that has fallen to or below the minimum set for it, deepest shortfall first."
                actions={
                    <Link href={route("stock_keeper.transfers.index")}>
                        <SkButton variant="outline" icon="swap_horiz">Move stock</SkButton>
                    </Link>
                }
            />

            <SkStats
                cols={3}
                items={[
                    { label: "At or below minimum", value: fmt(summary.low_stock), icon: "notification_important", tone: summary.low_stock > 0 ? "warning" : undefined },
                    { label: "Out of stock", value: fmt(summary.out_of_stock), icon: "remove_shopping_cart", tone: summary.out_of_stock > 0 ? "error" : undefined },
                    { label: "Items tracked", value: fmt(summary.items), hint: `${fmt(summary.variants)} SKUs`, icon: "category" },
                ]}
            />

            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
                <div className="md:w-[360px]">
                    <SkSearch value={search} onChange={setSearch} placeholder="Search product, SKU or barcode" />
                </div>
                <SkChips<Severity>
                    value={severity}
                    onChange={(v) => applyFilters({ severity: v, page: 1 })}
                    options={[
                        { value: "all", label: "All alerts" },
                        { value: "low_stock", label: "Low stock", count: summary.low_stock },
                        { value: "out_of_stock", label: "Out of stock", count: summary.out_of_stock },
                    ]}
                />
            </div>

            {alerts.length === 0 ? (
                <EmptyState icon="task_alt" title="No alerts here" description="Everything is above its minimum, or the filters are too narrow." framed />
            ) : (
                <SkCard className="overflow-hidden">
                    <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_100px_110px_130px] gap-3 border-b border-outline-variant/70 bg-surface-container-low px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant lg:grid">
                        <span>Item</span>
                        <span>Where</span>
                        <span className="text-right">On hand</span>
                        <span className="text-right">Minimum</span>
                        <span className="text-right">Short by</span>
                        <span>Status</span>
                    </div>
                    <ul className="grid grid-cols-1 divide-outline-variant/60 md:grid-cols-2 md:gap-px md:bg-outline-variant/50 lg:grid-cols-1 lg:divide-y lg:bg-transparent">
                        {alerts.map((row) => {
                            const status = STOCK_STATUS[row.status];
                            const unit = row.unit ?? "unit";
                            const short = row.headroom < 0 ? -row.headroom : 0;
                            return (
                                <li key={row.id} className="border-b border-outline-variant/60 bg-surface-container-lowest md:border-0 lg:border-0">
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_100px_110px_130px] lg:items-center">
                                        <div className="min-w-0">
                                            {row.item_id ? (
                                                <Link href={route("stock_keeper.items.show", row.item_id)} className="block truncate text-[15px] font-bold text-on-surface hover:underline">
                                                    {row.product_name}
                                                </Link>
                                            ) : (
                                                <p className="truncate text-[15px] font-bold text-on-surface">{row.product_name}</p>
                                            )}
                                            <p className="truncate font-mono text-[11px] text-on-surface-variant">
                                                {row.sku ?? "—"}
                                                {row.variant_label ? ` · ${row.variant_label}` : ""}
                                            </p>
                                        </div>
                                        <div className="text-right lg:hidden">
                                            <StatusPill tone={status.tone} label={status.label} size="sm" />
                                        </div>
                                        <p className="col-span-2 truncate text-[13px] text-on-surface-variant lg:col-span-1">
                                            <b className="text-on-surface">{row.location_name}</b> · {KIND_LABEL[row.location_kind] ?? row.location_kind}
                                        </p>
                                        {/* Figures: one row of three on phones, columns on desktop. */}
                                        <div className="col-span-2 grid grid-cols-3 gap-2 rounded-[12px] bg-surface-container-low px-3 py-2 text-center lg:col-span-3 lg:bg-transparent lg:p-0 lg:text-right">
                                            <div>
                                                <p className="text-[11px] font-bold uppercase text-on-surface-variant lg:hidden">On hand</p>
                                                <p className="text-[16px] font-extrabold tabular-nums text-on-surface">
                                                    {fmt(row.quantity)} <span className="text-[12px] font-bold text-on-surface-variant">{plural(unit, row.quantity)}</span>
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold uppercase text-on-surface-variant lg:hidden">Minimum</p>
                                                <p className="text-[16px] font-bold tabular-nums text-on-surface-variant">{fmt(row.min_stock_level)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold uppercase text-on-surface-variant lg:hidden">Short by</p>
                                                <p className={`text-[16px] font-extrabold tabular-nums ${short > 0 ? "text-error" : "text-on-surface-variant"}`}>{short > 0 ? fmt(short) : "—"}</p>
                                            </div>
                                        </div>
                                        <div className="hidden lg:block">
                                            <StatusPill tone={status.tone} label={status.label} size="sm" />
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </SkCard>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="alerts" onPage={(page) => applyFilters({ page })} />
        </>
    );
}

StockAlerts.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
