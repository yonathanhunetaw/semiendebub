import React from "react";
import { Head, Link } from "@inertiajs/react";
import ShopPageLayout from "@/Layouts/ShopPageLayout";
import { StatusPill } from "@/Components/Shared/ui";
import { SkCard, when } from "@/Components/StockKeeper/skKit";
import { birr } from "@/Components/Shared/OrderView";
import type { ShopperOrderRow } from "@/types/storefront";

interface Props {
    orders?: ShopperOrderRow[];
}

const STAGE: Record<ShopperOrderRow["stage"], { label: string; tone: "warning" | "info" | "success" | "error" | "neutral" }> = {
    to_pay: { label: "Waiting for payment", tone: "warning" },
    paid: { label: "Paid", tone: "info" },
    packing: { label: "Being packed", tone: "info" },
    to_deliver: { label: "On the way", tone: "info" },
    delivered: { label: "Done", tone: "success" },
    canceled: { label: "Cancelled", tone: "error" },
};

/** My orders: every order placed in the online shop, newest first. */
export default function OrdersIndex({ orders = [] }: Props) {
    return (
        <>
            <Head title="My orders" />

            <h1 className="text-[22px] font-extrabold tracking-tight">My orders</h1>
            <p className="mb-4 text-[13px] text-on-surface-variant">Pay, follow and pick up what you ordered online.</p>

            {orders.length === 0 ? (
                <SkCard>
                    <div className="px-4 py-10 text-center">
                        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">receipt_long</span>
                        <p className="mt-2 text-[15px] font-bold">No orders yet</p>
                        <p className="text-[13px] text-on-surface-variant">What you check out in the shop shows up here.</p>
                        <Link href={route("storefront.index")} className="mt-4 inline-block rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary">
                            Go to the shop
                        </Link>
                    </div>
                </SkCard>
            ) : (
                <SkCard>
                    <ul className="divide-y divide-outline-variant/60">
                        {orders.map((o) => {
                            const stage = STAGE[o.stage] ?? { label: o.stage, tone: "neutral" as const };
                            return (
                                <li key={o.reference}>
                                    <Link href={route("storefront.orders.show", o.reference)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[15px] font-bold">{o.store ?? "Order"}</span>
                                            <span className="block truncate text-[12px] text-on-surface-variant">
                                                {o.reference} · {when(o.placed_at)} · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 flex-col items-end gap-1">
                                            <span className="text-[15px] font-extrabold tabular-nums">{birr(o.total)}</span>
                                            <StatusPill label={o.to_pay && o.stage === "to_pay" ? "Send your payment" : stage.label} tone={stage.tone} size="sm" />
                                        </span>
                                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">chevron_right</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </SkCard>
            )}
        </>
    );
}

OrdersIndex.layout = (page: React.ReactElement<Props>) => <ShopPageLayout title="My orders">{page}</ShopPageLayout>;
