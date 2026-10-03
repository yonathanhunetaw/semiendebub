import SellerLayout from "@/Layouts/SellerLayout";
import { BRAND, INK, birr } from "@/Data/sellerOrderFlow";
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

            <div className="min-h-screen bg-[#F8F9FB] pb-36">
                <header className="sticky top-0 z-40 border-b border-gray-100 bg-white px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight" style={{ color: INK }}>
                        Orders to pick
                    </h1>
                    <p className="text-[11px] text-gray-400">
                        Paid orders waiting for each line to be sourced from a real location.
                    </p>
                </header>

                <div className="space-y-3 px-3.5 pt-3">
                    {orders.map((order) => (
                        <Link
                            key={order.id}
                            href={route("seller.orders.pickpack", order.reference)}
                            className="block rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm active:scale-[0.99]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-bold text-gray-900">
                                        {order.customer}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400">
                                        {order.reference}
                                    </p>
                                </div>
                                <span className="shrink-0 text-[13px] font-extrabold text-gray-900">
                                    {birr(order.total_amount)}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                                <span className="material-symbols-outlined text-[15px] text-slate-400">
                                    where_to_vote
                                </span>
                                <span className="text-[11px] font-semibold text-gray-600">
                                    {order.sourced_count}/{order.line_count} lines sourced
                                </span>

                                {order.delay_agreed ? (
                                    <span className="ml-auto rounded-[999px] border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">
                                        Delay agreed
                                    </span>
                                ) : null}
                            </div>
                        </Link>
                    ))}

                    {orders.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-[#FDF0ED]">
                                <span className="material-symbols-outlined text-[40px]" style={{ color: BRAND }}>
                                    inventory
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-gray-900">Nothing to pick</p>
                            <p className="mt-1 text-[12px] text-slate-500">
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
