import AdminLayout from "@/Layouts/AdminLayout";
import { OpsCard, href, type Row } from "@/Components/Shared/OpsHub";
import Scene from "@/Components/Visual/scenes";
import { Head, Link } from "@inertiajs/react";
import React from "react";

interface Props {
    store: { id: number; name: string };
    stats?: {
        /** Items this store carries. */
        items?: number;
        /** Shipments into or out of this store not yet received. */
        shipments?: number;
        /** Transfers to or from this store still under way. */
        transfers?: number;
    };
    counts?: {
        /** Refills the planner proposes, waiting for a ruling. */
        refills?: number;
        /** Stocktakes submitted, waiting for someone else to approve. */
        counts?: number;
    };
}

interface Figure {
    label: string;
    value: number;
    icon: string;
    route: string;
    routeParams?: Record<string, string | number>;
    /** Lights the figure up when it is above zero: something waits for you. */
    alert?: boolean;
}

/** One figure in the banner: a number that opens the screen behind it. */
function BannerFigure({ figure }: { figure: Figure }): React.ReactElement {
    const target = href(figure.route, figure.routeParams);
    const lit = figure.alert && figure.value > 0;

    return (
        <Link
            href={target ?? "#"}
            className={`flex min-w-0 items-center gap-2.5 rounded-[12px] px-3 py-2.5 transition-colors ${
                lit ? "bg-warning-container text-on-warning-container" : "bg-on-primary/10 text-on-primary hover:bg-on-primary/20"
            }`}
        >
            <span className="material-symbols-outlined text-[22px] opacity-90">{figure.icon}</span>
            <span className="min-w-0">
                <span className="block font-mono text-[18px] font-bold leading-tight">{figure.value.toLocaleString()}</span>
                <span className="block truncate text-[11px] font-medium opacity-80">{figure.label}</span>
            </span>
        </Link>
    );
}

/**
 * The Store page: a banner with the store's name and its live figures, then
 * one card per group (Stock, Movement, Approvals, Setup), each tile an icon,
 * a name and a line saying what is behind it, like the seller's More page.
 * Setup holds what used to sit under Settings > Store setup.
 */
export default function Hub({ store, stats, counts }: Props): React.ReactElement {
    const refills = counts?.refills ?? 0;
    const takes = counts?.counts ?? 0;
    const params = { store: store.id };

    const figures: Figure[] = [
        { label: "Items carried", value: stats?.items ?? 0, icon: "inventory_2", route: "store.show", routeParams: params },
        { label: "Shipments moving", value: stats?.shipments ?? 0, icon: "local_shipping", route: "admin.inventory.shipments.index" },
        { label: "Transfers under way", value: stats?.transfers ?? 0, icon: "swap_horiz", route: "admin.inventory.transfers" },
        { label: "Waiting for you", value: refills + takes, icon: "pending_actions", route: "admin.inventory.replenishment.index", alert: true },
    ];

    const stock: Row[] = [
        { label: "Items", caption: "Every item here, its stock and prices", icon: "inventory_2", route: "store.show", routeParams: params, tone: "primary" },
        { label: "Replenish", caption: "What to move in from the hubs", icon: "sync_alt", route: "store.replenish", routeParams: params, tone: "info" },
        { label: "Price deviations", caption: "Prices that differ from the standard", icon: "price_change", route: "store.deviations", routeParams: params, tone: "warning" },
        { label: "Capacity", caption: "Min and max levels for every variant", icon: "tune", route: "admin.inventory.capacity.index", tone: "success" },
    ];

    const movement: Row[] = [
        { label: "Transfers", caption: "One item between two places", icon: "swap_horiz", route: "admin.inventory.transfers", tone: "primary" },
        { label: "Shipments", caption: "Hub runs: pick, send, receive", icon: "local_shipping", route: "admin.inventory.shipments.index", tone: "info" },
    ];

    const approvals: Row[] = [
        { label: "Refills", caption: "Proposed moves waiting for a ruling", icon: "rule", route: "admin.inventory.replenishment.index", tone: refills > 0 ? "warning" : "success", count: refills },
        { label: "Stock counts", caption: "Submitted counts to approve", icon: "fact_check", route: "admin.inventory.counts.index", tone: takes > 0 ? "warning" : "success", count: takes },
    ];

    const setup: Row[] = [
        { label: "Locations", caption: "Shelf, floor and Remote Hub, and who manages each", icon: "account_tree", route: "admin.inventory.stock-locations.index", tone: "primary" },
        { label: "Payment accounts", caption: "Where customers pay in, and who confirms each", icon: "account_balance", route: "admin.payment-accounts.index", tone: "info" },
        { label: "Seller balances", caption: "What each seller holds and has handed over", icon: "account_balance_wallet", route: "admin.balances.index", tone: "success" },
        { label: "Customer prices & discounts", caption: "Per-customer prices and when discounts end", icon: "sell", route: "admin.customers.discounts", tone: "warning" },
    ];

    return (
        <>
            <Head title={store.name} />

            <div className="mx-auto w-full max-w-[1100px] pb-12">
                <section className="mb-3 overflow-hidden rounded-[16px] bg-gradient-to-br from-primary to-primary/80 p-4 text-on-primary shadow-sm sm:p-5">
                    <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-surface-container-lowest shadow-sm sm:h-20 sm:w-20">
                            <Scene kind="store" size={56} title={store.name} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">Your store</p>
                            <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{store.name}</h1>
                            <p className="mt-0.5 truncate text-[12px] opacity-85">Stock, movement, approvals and setup, all in one place</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {figures.map((figure) => (
                            <BannerFigure key={figure.label} figure={figure} />
                        ))}
                    </div>
                </section>

                <div className="flex flex-col gap-3">
                    <OpsCard title="Stock" note="What is here" rows={stock} wide />
                    <OpsCard title="Movement" note="What is on the way" rows={movement} wide />
                    <OpsCard title="Approvals" note="What waits for a ruling" rows={approvals} wide />
                    <OpsCard title="Setup" note="How this store runs" rows={setup} wide />
                </div>
            </div>
        </>
    );
}

Hub.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
