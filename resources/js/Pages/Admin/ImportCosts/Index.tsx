import React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import ImportCostInbox, { type ImportCostInboxProps } from "@/Components/Procurement/ImportCostInbox";

/** Admin → Import costs (global admins): the second person on what procurement paid on the way in. */
export default function AdminImportCosts(props: ImportCostInboxProps) {
    return <ImportCostInbox {...props} />;
}

AdminImportCosts.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
