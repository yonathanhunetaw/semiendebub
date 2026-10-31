import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import ShopPageLayout from "@/Layouts/ShopPageLayout";
import OrderView from "@/Components/Shared/OrderView";
import { SkButton } from "@/Components/StockKeeper/skKit";
import type { SharedOrder } from "@/types/sharedCart";

interface ShopperOrder extends SharedOrder {
    can_cancel: boolean;
    /** Minutes before unpaid items go back on the shelf; null once paid. */
    hold_minutes_left: number | null;
}

interface Props {
    order: ShopperOrder;
}

function leftText(minutes: number): string {
    if (minutes >= 1440) {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} h` : ""}`;
    }
    if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    return `${minutes} min`;
}

/** One online order: send the payment, say it is sent, follow it; cancel while nothing is paid. */
export default function OrdersShow({ order }: Props) {
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    return (
        <>
            <Head title={`Order ${order.reference}`} />
            <p className="mb-3 text-[13px]">
                <Link href={route("storefront.orders.index")} className="inline-flex items-center gap-1 font-bold text-primary">
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    My orders
                </Link>
            </p>

            <OrderView order={order} claimUrl={(paymentId) => route("storefront.orders.claim", [order.reference, paymentId])}>
                {order.hold_minutes_left !== null && order.stage === "to_pay" ? (
                    <p className="mb-4 rounded-[14px] border border-warning/40 bg-warning-container/60 px-4 py-3 text-[14px]">
                        {order.hold_minutes_left > 0
                            ? `We hold your items for ${leftText(order.hold_minutes_left)} more. Send the payment and tell us its reference before then.`
                            : "The time to pay has run out, so the items may be back on the shelf. Contact the store."}
                    </p>
                ) : null}
            </OrderView>

            {order.can_cancel ? (
                <div className="mt-4 text-center">
                    {confirming ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="text-[14px]">Cancel this order? The items go back to the store.</span>
                            <SkButton
                                variant="danger"
                                loading={busy}
                                onClick={() => {
                                    setBusy(true);
                                    router.post(route("storefront.orders.cancel", order.reference), {}, { preserveScroll: true, onFinish: () => setBusy(false) });
                                }}
                            >
                                Yes, cancel it
                            </SkButton>
                            <SkButton variant="ghost" onClick={() => setConfirming(false)}>
                                Keep it
                            </SkButton>
                        </div>
                    ) : (
                        <SkButton variant="ghost" icon="cancel" onClick={() => setConfirming(true)}>
                            Cancel order
                        </SkButton>
                    )}
                </div>
            ) : null}
        </>
    );
}

OrdersShow.layout = (page: React.ReactElement<Props>) => <ShopPageLayout title={page.props.order?.store ?? "Your order"}>{page}</ShopPageLayout>;
