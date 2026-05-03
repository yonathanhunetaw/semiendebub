import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import ItemForm from "./ItemForm";

export default function Create(props: any) {
    return (
        <>
            <Head title="Create Item" />
            <ItemForm mode="create" {...props} />
        </>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
