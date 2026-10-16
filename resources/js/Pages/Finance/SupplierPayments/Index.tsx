import React from "react";
import FinanceLayout from "@/Layouts/FinanceLayout";
import FlashToast from "@/Components/Shared/FlashToast";
import SupplierPaymentInbox, { type SupplierPaymentInboxProps } from "@/Components/Procurement/SupplierPaymentInbox";

/** Finance → Supplier payments: the second person on what procurement paid. */
export default function FinanceSupplierPayments(props: SupplierPaymentInboxProps) {
    return (
        <>
            <SupplierPaymentInbox {...props} />
            <FlashToast bottomClass="bottom-6" />
        </>
    );
}

FinanceSupplierPayments.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
