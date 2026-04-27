import AdminLayout from "@/Layouts/AppLayout";
import React from "react";
import {Head, Link} from "@inertiajs/react";

export default function Index() {
    return (
        <AdminLayout>
            <Head title="Seller Orders"/>

            {/* Breadcrumbs */}
            <nav className="text-sm text-gray-600 mb-4">
                <ol className="flex space-x-2">
                    <li>
                        <Link href="/admin/dashboard" className="hover:underline">
                            Home
                        </Link>
                    </li>
                    <li>
                        <span>/</span>
                        <Link href="/seller/dashboard" className="hover:underline">
                            Seller
                        </Link>
                    </li>
                    <li>
                        <span>/</span>
                        <span className="font-semibold text-gray-900">
                            Orders
                        </span>
                    </li>
                </ol>
            </nav>

            {/* Page content */}
            <h1 className="text-xl font-bold mb-4">Orders List</h1>
            {/* ... your table / orders content ... */}
        </AdminLayout>
    );
}
