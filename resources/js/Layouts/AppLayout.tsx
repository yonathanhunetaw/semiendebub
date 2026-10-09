import React from "react";
import AdminLayout from "./AdminLayout";

/**
 * The admin shell with a breadcrumb trail and flash toasts. Older admin pages
 * import this as their layout; it is the same shell as AdminLayout.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminLayout breadcrumbs flashToast>
            {children}
        </AdminLayout>
    );
}
