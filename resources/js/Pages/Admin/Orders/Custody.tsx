import AdminLayout from "@/Layouts/AppLayout";
import Custody from "@/Pages/Seller/Orders/Custody";
import React from "react";

type CustodyProps = React.ComponentProps<typeof Custody>;

/** The seller's custody log, opened from Admin → Orders. */
export default function AdminOrderCustody(props: CustodyProps): React.ReactElement {
    return <Custody {...props} backRoute="admin.orders.index" />;
}

AdminOrderCustody.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
