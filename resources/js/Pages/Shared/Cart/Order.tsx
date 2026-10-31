import React from "react";
import { Head } from "@inertiajs/react";
import SharedCartLayout from "@/Layouts/SharedCartLayout";
import OrderView from "@/Components/Shared/OrderView";
import type { SharedOrder } from "@/types/sharedCart";

interface Props {
    token: string;
    order: SharedOrder;
}

/** The order a shared cart became: pay it, then follow it. */
export default function SharedCartOrder({ token, order }: Props) {
    return (
        <>
            <Head title={order.reference} />
            <OrderView order={order} claimUrl={(paymentId) => route("shared.cart.payments.claim", [token, paymentId])} />
        </>
    );
}

SharedCartOrder.layout = (page: React.ReactElement<Props>) => <SharedCartLayout store={page.props.order?.store}>{page}</SharedCartLayout>;
