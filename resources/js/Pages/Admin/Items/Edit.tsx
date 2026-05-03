import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import ItemForm from "./ItemForm";

export default function Edit(props: any) {
    return (
        <>
            <Head title="Edit Item" />
            <ItemForm mode="edit" {...props} />
        </>
    );
}

Edit.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
