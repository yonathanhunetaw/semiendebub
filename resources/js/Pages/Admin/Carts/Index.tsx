import AdminLayout from "@/Layouts/AdminLayout";

import { Head, router, usePage, Link } from "@inertiajs/react";

import { Typography, Paper } from "@mui/material";

import { ReactNode } from "react";

// 1. Define the Cart structure

interface CartItem {
    id: number;

    status: string;

    session_id?: string;

    user_id?: number;

    updated_at: string;

    variants_count?: number;

    customer?: { name: string };

    store?: { store_name: string };
}

// 2. Define the Pagination structure

interface CartsData {
    data: CartItem[];

    total: number;

    from: number;

    to: number;

    links: any[];
}

// 3. Apply types to the component

export default function Index({ carts }: { carts: CartsData }) {
    const { flash = {} } = usePage().props as any;

    const cartList = carts.data || [];

    // Fix 'any' type for id

    const handleDelete = (id: number) => {
        if (
            confirm(
                "Are you sure you want to delete this cart? This cannot be undone.",
            )
        ) {
            router.delete(route("admin.carts.destroy", id));
        }
    };

    return (
        <>
            {/* ... keep the rest of the JSX the same ... */}

            <div className="flex flex-col gap-2 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <Typography
                    variant="h5"
                    sx={{ color: "#ffffff", fontWeight: 700 }}
                >
                    Global Cart Management
                </Typography>

                <span className="font-mono text-sm text-gray-400">
                    Total active: {carts.total}
                </span>
            </div>

            {/* Flash Messages */}
            {flash?.message && (
                <div className="p-4 mb-6 text-green-400 border rounded-lg bg-green-500/10 border-green-500/20">
                    {flash.message}
                </div>
            )}

            {/* Table Container - YouTube Dark Aesthetic */}
            <Paper
                elevation={0}
                sx={{
                    backgroundColor: "#272727",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    overflow: "hidden",
                }}
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs tracking-wider text-gray-400 uppercase border-b border-white/10 bg-white/5">
                                <th className="p-4 font-semibold">Status</th>
                                <th className="p-4 font-semibold">
                                    Customer / Session
                                </th>
                                <th className="hidden p-4 font-semibold sm:table-cell">
                                    Store Location
                                </th>
                                <th className="hidden p-4 font-semibold md:table-cell">
                                    Items
                                </th>
                                <th className="p-4 font-semibold text-right">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {cartList.map((cart) => (
                                <tr
                                    key={cart.id}
                                    className="transition-colors hover:bg-white/5"
                                >
                                    {/* Status Column */}
                                    <td className="p-4">
                                        <div className="flex items-center text-sm font-medium text-blue-400">
                                            <span className="relative flex w-2 h-2 mr-2">
                                                <span className="absolute inline-flex w-full h-full bg-blue-400 rounded-full opacity-75 animate-pulse"></span>
                                                <span className="relative inline-flex w-2 h-2 bg-blue-500 rounded-full"></span>
                                            </span>
                                            <span className="capitalize">
                                                {cart.status || "Pending"}
                                            </span>
                                        </div>
                                    </td>

                                    {/* User / ID Column */}
                                    <td className="p-4">
                                        <div className="text-sm font-bold text-gray-200 sm:text-base">
                                            {cart.customer?.name ||
                                                (cart.user_id
                                                    ? "Auth User"
                                                    : "Guest Visitor")}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-[10px] sm:text-xs text-gray-500 font-mono">
                                                ID:{" "}
                                                {String(cart.id).substring(
                                                    0,
                                                    8,
                                                )}
                                            </span>
                                            {cart.session_id && (
                                                <span className="text-[10px] uppercase px-1.5 py-0.5 bg-white/10 border border-white/10 rounded text-gray-400 font-mono">
                                                    SES:{" "}
                                                    {cart.session_id.substring(
                                                        0,
                                                        5,
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Store Name - Vital for Admin View */}
                                    <td className="hidden p-4 sm:table-cell">
                                        <div className="inline-block px-2 py-1 font-mono text-xs text-purple-400 border rounded bg-purple-400/10 border-purple-500/20">
                                            {cart.store?.store_name ||
                                                "Main Warehouse"}
                                        </div>
                                    </td>

                                    {/* Items Count */}
                                    <td className="hidden p-4 md:table-cell">
                                        <div className="text-sm text-gray-300">
                                            {cart.variants_count || 0} items
                                        </div>
                                        <div className="text-[10px] text-gray-500 uppercase">
                                            Updated:{" "}
                                            {new Date(
                                                cart.updated_at,
                                            ).toLocaleDateString()}
                                        </div>
                                    </td>

                                    {/* Action Buttons */}
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2 sm:gap-3">
                                            <Link
                                                href={route(
                                                    "admin.carts.show",
                                                    cart.id,
                                                )}
                                                className="bg-white/5 hover:bg-white/10 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-bold transition-all border border-white/10"
                                            >
                                                Manage
                                            </Link>
                                            <button
                                                onClick={() =>
                                                    handleDelete(cart.id)
                                                }
                                                className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-bold transition-all border border-red-500/20"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Simple Pagination Footer Info */}
                {carts.links && (
                    <div className="p-4 border-t border-white/10 bg-white/5">
                        <div className="text-xs text-gray-500">
                            Showing {carts.from} to {carts.to} of {carts.total}{" "}
                            carts
                        </div>
                    </div>
                )}
            </Paper>
        </>
    );
}

// 4. Fix 'any' type for page
Index.layout = (page: ReactNode) => (
    <AdminLayout>
        <Head title="Admin | Cart Management" />
        {page}
    </AdminLayout>
);
