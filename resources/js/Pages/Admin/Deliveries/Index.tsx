import AdminLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
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

interface DeliveryRow {
    id: number;
    tracking_number: string | null;
    status: string;
    order: string | null;
    store: string | null;
    recipient: string | null;
    address: string | null;
    courier: string | null;
    ready: boolean;
    failure_reason: string | null;
    updated_at: string | null;
}

interface Props {
    deliveries?: DeliveryRow[];
    filters: { status: string };
    counts?: { open: number; unassigned: number; failed: number; delivered: number };
    couriers?: Array<{ id: number; name: string }>;
    pagination: { current_page: number; last_page: number; total: number };
}

const TABS = [
    { value: "open", label: "Open" },
    { value: "unassigned", label: "Needs a courier" },
    { value: "failed", label: "Failed attempts" },
    { value: "delivered", label: "Delivered" },
    { value: "all", label: "All" },
];

const STATUS_COLOR: Record<string, "default" | "warning" | "info" | "primary" | "success" | "error"> = {
    pending: "warning",
    dispatched: "info",
    in_transit: "primary",
    delivered: "success",
    failed: "error",
    returned: "default",
};

/** Every customer delivery run, and a way to put a courier on one. */
export default function DeliveriesIndex({
    deliveries = [],
    filters,
    counts = { open: 0, unassigned: 0, failed: 0, delivered: 0 },
    couriers = [],
    pagination,
}: Props): React.ReactElement {
    const go = (patch: Record<string, string | number | null>): void =>
        router.get(route("admin.deliveries.index"), { ...filters, ...patch }, { preserveState: true, preserveScroll: true, replace: true });

    return (
        <>
            <Head title="Deliveries" />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Deliveries
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Customer orders with Delivery. A run can be given a courier once its order is picked.
                </Typography>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    {TABS.map((tab) => {
                        const count = tab.value in counts ? counts[tab.value as keyof typeof counts] : null;
                        return (
                            <Chip
                                key={tab.value}
                                label={count === null ? tab.label : `${tab.label} (${count})`}
                                color={filters.status === tab.value ? "primary" : "default"}
                                variant={filters.status === tab.value ? "filled" : "outlined"}
                                onClick={() => go({ status: tab.value, page: null })}
                                sx={{ fontWeight: 700 }}
                            />
                        );
                    })}
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Tracking</TableCell>
                                <TableCell>Order</TableCell>
                                <TableCell>To</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Courier</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {deliveries.map((d) => (
                                <TableRow key={d.id} hover>
                                    <TableCell sx={{ fontFamily: "monospace" }}>{d.tracking_number ?? "—"}</TableCell>
                                    <TableCell>
                                        {d.order ? (
                                            <Button size="small" onClick={() => router.visit(route("admin.orders.custody", { reference: d.order as string }))}>
                                                {d.order}
                                            </Button>
                                        ) : (
                                            "—"
                                        )}
                                        <Typography variant="caption" color="text.secondary" component="div">
                                            {d.store ?? ""}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{d.recipient ?? "—"}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {d.address ?? "No address"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip size="small" label={d.status.replace("_", " ")} color={STATUS_COLOR[d.status] ?? "default"} />
                                        {d.failure_reason ? (
                                            <Typography variant="caption" color="error" component="div">
                                                {d.failure_reason}
                                            </Typography>
                                        ) : null}
                                        {!d.ready ? (
                                            <Typography variant="caption" color="text.secondary" component="div">
                                                Waiting for Pick &amp; Pack
                                            </Typography>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        {d.courier ?? (d.ready && d.status === "pending" ? <AssignCourier delivery={d} couriers={couriers} /> : "—")}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {deliveries.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                                        Nothing here.
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
                            Page {pagination.current_page} of {pagination.last_page}
                        </Typography>
                        <Button disabled={pagination.current_page >= pagination.last_page} onClick={() => go({ page: pagination.current_page + 1 })}>
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </Box>
        </>
    );
}

function AssignCourier({ delivery, couriers }: { delivery: DeliveryRow; couriers: Array<{ id: number; name: string }> }): React.ReactElement {
    const [courierId, setCourierId] = useState<number | "">("");

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <TextField select size="small" label="Courier" value={courierId} onChange={(e) => setCourierId(Number(e.target.value))} sx={{ minWidth: 160 }}>
                {couriers.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                        {c.name}
                    </MenuItem>
                ))}
            </TextField>
            <Button
                size="small"
                variant="contained"
                disabled={courierId === ""}
                onClick={() => router.patch(route("admin.deliveries.assign", delivery.id), { courier_id: courierId }, { preserveScroll: true })}
            >
                Assign
            </Button>
        </Stack>
    );
}

DeliveriesIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
