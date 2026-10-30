import AdminLayout from "@/Layouts/AdminLayout";
import StoreBanner, { type BannerFigureData } from "@/Components/Admin/StoreBanner";
import { OpsCard, type Row } from "@/Components/Shared/OpsHub";
import { Head } from "@inertiajs/react";
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

/**
 * The Store page: a banner with the store's name and its live figures, then
 * one card per group (Stock, Movement, Approvals, Setup), each tile an icon,
 * a name and a line saying what is behind it, like the seller's More page.
 * Setup holds what used to sit under Settings > Store setup. "All stores"
 * (Admin/Inventory/Index) is laid out the same way.
 */
export default function Hub({ store, stats, counts }: Props): React.ReactElement {
    const refills = counts?.refills ?? 0;
    const takes = counts?.counts ?? 0;
    const params = { store: store.id };

    const figures: BannerFigureData[] = [
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
                <StoreBanner
                    eyebrow="Your store"
                    title={store.name}
                    subtitle="Stock, movement, approvals and setup, all in one place"
                    figures={figures}
                />

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
