import AdminLayout from "@/Layouts/AdminLayout";
import { OpsCard, type Row } from "@/Components/Shared/OpsHub";
import { Head } from "@inertiajs/react";
import React from "react";

interface Props {
    store: { id: number; name: string };
    counts?: {
        /** Refills the planner proposes, waiting for a ruling. */
        refills?: number;
        /** Stocktakes submitted, waiting for someone else to approve. */
        counts?: number;
    };
}

/**
 * The Store page: one card per group (Stock, Movement, Approvals), each tile
 * an icon, a name and a line saying what is behind it, like the seller's More
 * page. Locations (who runs each place) are in Settings, not here.
 */
export default function Hub({ store, counts }: Props): React.ReactElement {
    const refills = counts?.refills ?? 0;
    const takes = counts?.counts ?? 0;
    const params = { store: store.id };

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

    return (
        <>
            <Head title={`${store.name}`} />

            <div className="mx-auto w-full max-w-[1100px] pb-12">
                <section className="flex items-center gap-3 pb-3 pt-1">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-primary-container bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-2xl">storefront</span>
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">{store.name}</h1>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">Stock, movement and approvals for this store</p>
                    </div>
                </section>

                <div className="flex flex-col gap-3">
                    <OpsCard title="Stock" note="What is here" rows={stock} wide />
                    <OpsCard title="Movement" note="What is on the way" rows={movement} wide />
                    <OpsCard title="Approvals" note="What waits for a ruling" rows={approvals} wide />
                </div>
            </div>
        </>
    );
}

Hub.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
