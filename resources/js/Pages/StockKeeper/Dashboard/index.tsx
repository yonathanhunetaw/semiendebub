import { Head, Link, usePage } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import type { StockKeeperDashboardProps, StockRow, StockRowStatus } from "@/types/stockkeeper";

/**
 * The stock keeper's home: who and where, today's jobs (each opening the page
 * where it is done), the stock at a glance, and what needs attention.
 */

const ROW_STATUS: Record<StockRowStatus, { label: string; tone: Tone }> = {
    healthy: { label: "Healthy", tone: "success" },
    low_stock: { label: "Low stock", tone: "warning" },
    critical: { label: "Critical", tone: "error" },
    out_of_stock: { label: "Out of stock", tone: "error" },
};

const KIND_ICON: Record<string, string> = {
    main_hub: "warehouse",
    remote_hub: "warehouse",
    store: "storefront",
    backroom: "storefront",
    shelf: "shelves",
    warehouse: "warehouse",
};

const fmt = (n: number) => n.toLocaleString();

function greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** "11 Cartons" — the row's own packaging, which is how it is counted. */
function amount(row: StockRow): string {
    const unit = row.unit ?? "units";
    return `${fmt(row.quantity)} ${row.quantity === 1 ? unit : `${unit}s`}`;
}

export default function Dashboard({ metrics, alerts = [], recent_movements = [], locations = [], todo }: StockKeeperDashboardProps) {
    const { props } = usePage<{ auth?: { user?: { first_name?: string } | null } }>();
    const name = props.auth?.user?.first_name;
    const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

    const jobs: Array<{ key: string; label: string; icon: string; count: number; href: string; tone: "primary" | "warning" | "error" }> = todo
        ? [
              { key: "pick", label: "Shipments to pick", icon: "inventory", count: todo.shipments_to_pick, href: route("stock_keeper.shipments.index", { direction: "outbound" }), tone: "primary" },
              { key: "receive", label: "Shipments to receive", icon: "move_to_inbox", count: todo.shipments_to_receive, href: route("stock_keeper.shipments.index", { direction: "inbound" }), tone: "primary" },
              { key: "orders", label: "Orders to pick", icon: "package_2", count: todo.orders_to_pick, href: route("stock_keeper.orders.index"), tone: "primary" },
              { key: "shelve", label: "To shelve", icon: "shelves", count: todo.to_shelve, href: route("stock_keeper.shelving.index"), tone: "primary" },
              { key: "accept", label: "Remote Hub to accept", icon: "approval", count: todo.to_accept, href: route("stock_keeper.shelving.index"), tone: "primary" },
              { key: "transfers", label: "Transfers queued", icon: "swap_horiz", count: todo.transfers_pending, href: route("stock_keeper.transfers.index", { status: "pending" }), tone: "primary" },
              { key: "low", label: "Items low", icon: "trending_down", count: todo.levels_low, href: route("stock_keeper.levels.index"), tone: "warning" },
              { key: "crit", label: "Crit low or empty", icon: "error", count: todo.levels_critical, href: route("stock_keeper.levels.index"), tone: "error" },
          ]
        : [];
    const waiting = jobs.reduce((sum, job) => sum + job.count, 0);

    const toneClass = { primary: "bg-primary text-on-primary", warning: "bg-warning text-on-warning", error: "bg-error text-on-error" } as const;

    return (
        <>
            <Head title="Home" />

            {/* Greeting */}
            <section className="relative mb-4 overflow-hidden rounded-[24px] bg-primary px-5 py-5 text-on-primary shadow-sm sm:px-7 sm:py-6 lg:mb-6">
                <span className="material-symbols-outlined pointer-events-none absolute -right-4 -top-6 text-[140px] opacity-10 sm:text-[180px]">warehouse</span>
                <p className="text-[13px] font-medium opacity-80">{today}</p>
                <h1 className="mt-0.5 text-[24px] font-extrabold tracking-tight sm:text-[30px]">
                    {greeting()}
                    {name ? `, ${name}` : ""}
                </h1>
                <p className="mt-1 max-w-[560px] text-[14px] opacity-90">
                    {waiting > 0 ? `${fmt(waiting)} job${waiting === 1 ? "" : "s"} waiting across your docks.` : "Nothing waiting. Your docks are clear."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    {[
                        { label: "Receive stock", icon: "add_box", href: route("stock_keeper.inventory.index") },
                        { label: "Raise transfer", icon: "swap_horiz", href: route("stock_keeper.transfers.index") },
                        { label: "Stock levels", icon: "speed", href: route("stock_keeper.levels.index") },
                    ].map((action) => (
                        <Link
                            key={action.label}
                            href={action.href}
                            className="flex items-center gap-1.5 rounded-[999px] bg-on-primary/15 px-3.5 py-2 text-[13px] font-bold text-on-primary backdrop-blur hover:bg-on-primary/25"
                        >
                            <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                            {action.label}
                        </Link>
                    ))}
                </div>
            </section>

            {/* Today's jobs */}
            {jobs.length > 0 && (
                <section className="mb-4 lg:mb-6">
                    <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-on-surface-variant">Today</h2>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                        {jobs.map((job) => {
                            const live = job.count > 0;
                            return (
                                <Link
                                    key={job.key}
                                    href={job.href}
                                    className={`group flex flex-col justify-between rounded-[18px] border p-3 transition-colors sm:p-4 ${
                                        live ? "border-outline-variant bg-surface-container-lowest shadow-sm hover:border-primary" : "border-outline-variant/60 bg-surface-container-low/60"
                                    }`}
                                >
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-[11px] ${live ? toneClass[job.tone] : "bg-surface-container text-on-surface-variant/70"}`}>
                                        <span className="material-symbols-outlined text-[20px]">{job.icon}</span>
                                    </span>
                                    <span className="mt-3">
                                        <span className={`block text-[26px] font-extrabold leading-none tabular-nums ${live ? "text-on-surface" : "text-on-surface-variant/70"}`}>{fmt(job.count)}</span>
                                        <span className="mt-1 block text-[13px] font-bold leading-tight text-on-surface-variant">{job.label}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Stock at a glance */}
            <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mb-6 lg:grid-cols-4">
                {[
                    { label: "Items on hand", value: metrics.items, hint: `${fmt(metrics.variants)} SKUs`, icon: "category" },
                    { label: "Pieces on hand", value: metrics.pieces_on_hand, hint: "All packaging, in pieces", icon: "deployed_code" },
                    { label: "Items low", value: metrics.low_stock_items, hint: `${fmt(metrics.low_stock)} SKU rows`, icon: "trending_down" },
                    { label: "Items out", value: metrics.out_of_stock_items, hint: `${fmt(metrics.out_of_stock)} SKU rows`, icon: "remove_shopping_cart" },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-[18px] border border-outline-variant bg-surface-container-lowest p-3 shadow-sm sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-bold text-on-surface-variant">{stat.label}</span>
                            <span className="material-symbols-outlined text-[20px] text-primary">{stat.icon}</span>
                        </div>
                        <p className="mt-1 text-[24px] font-extrabold tabular-nums text-on-surface sm:text-[28px]">{fmt(stat.value)}</p>
                        <p className="text-[12px] text-on-surface-variant">{stat.hint}</p>
                    </div>
                ))}
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
                <StockList title="Needs attention" icon="notification_important" rows={alerts} href={route("stock_keeper.alerts.index")} empty="Nothing is low. Everything is above its minimum." />
                <StockList title="Recently changed" icon="history" rows={recent_movements} href={route("stock_keeper.inventory.index")} empty="No stock has changed yet." />
            </div>

            {locations.length > 0 && (
                <section className="mt-4 lg:mt-6">
                    <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-on-surface-variant">Your places</h2>
                    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                        {locations.map((location) => (
                            <Link
                                key={`${location.kind}-${location.id}`}
                                href={route("stock_keeper.inventory.index", { location_type: location.type, location_id: location.id })}
                                className="flex shrink-0 items-center gap-2 rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] font-bold text-on-surface hover:border-primary"
                            >
                                <span className="material-symbols-outlined text-[18px] text-primary">{KIND_ICON[location.kind] ?? "location_on"}</span>
                                {location.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </>
    );
}

function StockList({ title, icon, rows, href, empty }: { title: string; icon: string; rows: StockRow[]; href: string; empty: string }) {
    return (
        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
            <header className="flex items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
                <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-on-surface">
                    <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
                    {title}
                </h2>
                <Link href={href} className="flex items-center text-[13px] font-bold text-primary hover:underline">
                    View all
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </Link>
            </header>
            {rows.length === 0 ? (
                <EmptyState icon="check_circle" title={empty} />
            ) : (
                <ul className="divide-y divide-outline-variant/60">
                    {rows.map((row) => {
                        const status = ROW_STATUS[row.status];
                        return (
                            <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-bold text-on-surface">{row.product_name}</p>
                                    <p className="truncate text-[12px] text-on-surface-variant">
                                        {row.location_name}
                                        {row.sku ? <span className="font-mono"> · {row.sku}</span> : null}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="text-[15px] font-extrabold tabular-nums text-on-surface">{amount(row)}</span>
                                    {row.status !== "healthy" && <StatusPill tone={status.tone} label={status.label} size="sm" />}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

Dashboard.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
