import React from "react";
import FinanceLayout from "@/Layouts/FinanceLayout";
import FlashToast from "@/Components/Shared/FlashToast";
import ImportCostInbox, { type ImportCostInboxProps } from "@/Components/Procurement/ImportCostInbox";

/** Finance → Import costs: the second person on what procurement paid on the way in. */
export default function FinanceImportCosts(props: ImportCostInboxProps) {
    return (
        <>
            <ImportCostInbox {...props} />
            <FlashToast bottomClass="bottom-6" />
        </>
    );
}

FinanceImportCosts.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
