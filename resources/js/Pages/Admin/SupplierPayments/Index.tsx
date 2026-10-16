import React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import SupplierPaymentInbox, { type SupplierPaymentInboxProps } from "@/Components/Procurement/SupplierPaymentInbox";

/** Admin → Supplier payments: the second person on what procurement paid. */
export default function AdminSupplierPayments(props: SupplierPaymentInboxProps) {
    return <SupplierPaymentInbox {...props} />;
}

AdminSupplierPayments.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
