import SellerLayout from "@/Layouts/SellerLayout";
import { birr } from "@/Data/sellerOrderFlow";
import type { PickPackQueueOrder } from "@/types/sourcing";
import { Head, Link } from "@inertiajs/react";
import React from "react";

/**
 * Paid orders waiting to be sourced.
 *
 * The entry point to Pick & Pack, and unlike the pipeline preview at /orders
 * this list is real: every row is a `sales` row at fulfillment_stage
 * `pick_pack`, scoped to the seller's own store.
 */

interface Props {
    orders?: PickPackQueueOrder[];
}

export default function PickPackQueue({ orders = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="Orders to pick" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">
                        Orders to pick
                    </h1>
                    <p className="text-[11px] text-outline">
                        Paid orders waiting for each line to be sourced from a real location.
                    </p>
                </header>

                <div className="space-y-3 px-3.5 pt-3">
                    {orders.map((order) => (
                        <Link
                            key={order.id}
                            href={route("seller.orders.pickpack", order.reference)}
                            className="block rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm active:scale-[0.99]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-on-surface">
                                        {order.customer}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-outline">
                                        {order.reference}
                                    </p>
                                </div>
                                <span className="shrink-0 text-[13px] font-extrabold text-on-surface">
                                    {birr(order.total_amount)}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center gap-2 border-t border-outline-variant/60 pt-2.5">
                                <span className="material-symbols-outlined text-[15px] text-outline">
                                    where_to_vote
                                </span>
                                <span className="text-[11px] font-semibold text-on-surface-variant">
                                    {order.sourced_count}/{order.line_count} lines sourced
                                </span>

                                {order.delay_agreed ? (
                                    <span className="ml-auto rounded-[999px] border border-warning/30 bg-warning-container/60 px-2 py-0.5 text-[9px] font-bold uppercase text-on-warning-container">
                                        Delay agreed
                                    </span>
                                ) : null}
                            </div>
                        </Link>
                    ))}

                    {orders.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-primary-container">
                                <span className="material-symbols-outlined text-[40px] text-primary">
                                    inventory
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-on-surface">Nothing to pick</p>
                            <p className="mt-1 text-[12px] text-on-surface-variant">
                                Paid orders appear here until every line has been sourced.
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
}

PickPackQueue.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
