import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

type Stage = "to_pay" | "paid" | "packing" | "to_deliver" | "delivered" | "canceled";

interface OrderRow {
    id: number;
    reference: string;
    store: string | null;
    customer: string;
    stage: Stage;
    payment_status: string;
    total: number;
    delivery_status: string | null;
    courier: string | null;
    placed_at: string | null;
}

interface Props {
    orders?: OrderRow[];
    counts?: Partial<Record<Stage, number>>;
    filters: { stage: string; store: number | null; search: string };
    stores?: Array<{ id: number; name: string }>;
    pagination: { current_page: number; last_page: number; total: number };
}

const STAGES: Array<{ value: string; label: string; color: "default" | "warning" | "info" | "primary" | "success" | "error" }> = [
    { value: "all", label: "All", color: "default" },
    { value: "to_pay", label: "To pay", color: "warning" },
    { value: "paid", label: "Pick & Pack", color: "info" },
    { value: "to_deliver", label: "With Delivery", color: "primary" },
    { value: "delivered", label: "Delivered", color: "success" },
    { value: "canceled", label: "Cancelled", color: "error" },
];

const birr = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

/**
 * Every order across every store. Stages match the seller's board; opening an
 * order shows who has held its goods, where and when.
 */
export default function OrdersIndex({ orders = [], counts = {}, filters, stores = [], pagination }: Props): React.ReactElement {
    const [search, setSearch] = useState(filters.search ?? "");

    const go = (patch: Record<string, string | number | null>): void => {
        const next = { ...filters, ...patch } as Record<string, string | number | null>;
        const query = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== "" && value !== "all"));
        router.get(route("admin.orders.index"), query, { preserveState: true, preserveScroll: true, replace: true });
    };

    const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

    return (
        <>
            <Head title="Orders" />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Orders
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Every store&apos;s orders. Open one to see its chain of custody.
                </Typography>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ md: "center" }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {STAGES.map((stage) => {
                            const count = stage.value === "all" ? total : (counts[stage.value as Stage] ?? 0) + (stage.value === "paid" ? counts.packing ?? 0 : 0);
                            return (
                                <Chip
                                    key={stage.value}
                                    label={`${stage.label} (${count})`}
                                    color={filters.stage === stage.value ? stage.color : "default"}
                                    variant={filters.stage === stage.value ? "filled" : "outlined"}
                                    onClick={() => go({ stage: stage.value, page: null })}
                                    sx={{ fontWeight: 700 }}
                                />
                            );
                        })}
                    </Stack>
                    <Box sx={{ flex: 1 }} />
                    <TextField
                        select
                        size="small"
                        label="Store"
                        value={filters.store ?? ""}
                        onChange={(event) => go({ store: event.target.value === "" ? null : Number(event.target.value), page: null })}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="">All stores</MenuItem>
                        {stores.map((store) => (
                            <MenuItem key={store.id} value={store.id}>
                                {store.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        size="small"
                        label="Reference"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") go({ search, page: null });
                        }}
                    />
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Reference</TableCell>
                                <TableCell>Store</TableCell>
                                <TableCell>Customer</TableCell>
                                <TableCell>Stage</TableCell>
                                <TableCell>Delivery</TableCell>
                                <TableCell align="right">Total</TableCell>
                                <TableCell>Placed</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {orders.map((order) => {
                                const stage = STAGES.find((s) => s.value === (order.stage === "packing" ? "paid" : order.stage));
                                return (
                                    <TableRow
                                        key={order.id}
                                        hover
                                        sx={{ cursor: "pointer" }}
                                        onClick={() => router.visit(route("admin.orders.custody", { reference: order.reference }))}
                                    >
                                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{order.reference}</TableCell>
                                        <TableCell>{order.store ?? "—"}</TableCell>
                                        <TableCell>{order.customer}</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={stage?.label ?? order.stage} color={stage?.color ?? "default"} />
                                        </TableCell>
                                        <TableCell>
                                            {order.delivery_status ? `${order.delivery_status.replace("_", " ")}${order.courier ? ` · ${order.courier}` : ""}` : "—"}
                                        </TableCell>
                                        <TableCell align="right">{birr(order.total)}</TableCell>
                                        <TableCell>{order.placed_at ? new Date(order.placed_at).toLocaleString() : "—"}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {orders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                                        No orders match.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </Paper>

                {pagination.last_page > 1 ? (
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 2 }}>
                        <Button disabled={pagination.current_page <= 1} onClick={() => go({ page: pagination.current_page - 1 })}>
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page} · {pagination.total} orders
                        </Typography>
                        <Button disabled={pagination.current_page >= pagination.last_page} onClick={() => go({ page: pagination.current_page + 1 })}>
                            Next
                        </Button>
                    </Stack>
                ) : null}

                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                    <Button component={Link} href={route("admin.carts.index")}>
                        Open carts
                    </Button>
                </Stack>
            </Box>
        </>
    );
}

OrdersIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
