import { Head, Link, router } from "@inertiajs/react";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Button,
    Chip,
    Grid,
    InputAdornment,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    EmptyState,
    OrderStatusChip,
    PageHeader,
    StatCard,
    VendorCard,
    formatMoment,
    formatMoney,
} from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorOrdersProps } from "@/types/vendor";

const SEARCH_DEBOUNCE_MS = 350;

const STATUS_TABS: Array<{ value: string; label: string }> = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "received", label: "Received" },
    { value: "canceled", label: "Canceled" },
];

/**
 * Orders the business has placed with this vendor.
 *
 * Read-only: only Procurement may change an order's state.
 */
export default function Orders({
    orders,
    counts,
    metrics,
    filters,
    pagination,
}: VendorOrdersProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    const applyFilters = React.useCallback(
        (next: { status?: string; search?: string }): void => {
            const query: Record<string, string> = {};
            const nextStatus = next.status ?? filters.status;
            const nextSearch = next.search ?? filters.search;

            if (nextStatus && nextStatus !== "all") {
                query.status = nextStatus;
            }
            if (nextSearch) {
                query.search = nextSearch;
            }

            router.get(route("vendor.orders.index"), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        },
        [filters.status, filters.search],
    );

    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => applyFilters({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    return (
        <>
            <Head title="Purchase Orders" />

            <PageHeader
                title="Purchase Orders"
                subtitle="Orders raised with you by the business."
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="All orders" value={counts.all} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Pending"
                        value={counts.pending}
                        tone={counts.pending > 0 ? "warning" : "default"}
                        hint={formatMoney(metrics.revenue_pending)}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Received"
                        value={counts.received}
                        tone="success"
                        hint={formatMoney(metrics.revenue_received)}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="Canceled" value={counts.canceled} />
                </Grid>
            </Grid>

            <VendorCard sx={{ p: 0, overflow: "hidden" }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ xs: "stretch", md: "center" }}
                    justifyContent="space-between"
                    sx={{ p: 2.5 }}
                >
                    <TextField
                        size="small"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search reference or notes…"
                        sx={{ maxWidth: { md: 360 }, width: "100%" }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {STATUS_TABS.map((tab) => {
                            const active = filters.status === tab.value;
                            return (
                                <Chip
                                    key={tab.value}
                                    label={tab.label}
                                    onClick={() => applyFilters({ status: tab.value })}
                                    color={active ? "primary" : "default"}
                                    variant={active ? "filled" : "outlined"}
                                    sx={{ fontWeight: 700 }}
                                />
                            );
                        })}
                    </Stack>
                </Stack>

                {orders.length === 0 ? (
                    <EmptyState
                        icon={<ReceiptLongRoundedIcon fontSize="large" />}
                        title="No orders in this view"
                        hint="Purchase orders raised with you will appear here."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Reference</TableCell>
                                <TableCell>Destination</TableCell>
                                <TableCell>Raised by</TableCell>
                                <TableCell align="right">Value</TableCell>
                                <TableCell align="right">Ordered</TableCell>
                                <TableCell align="right">Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {orders.map((order) => (
                                <TableRow
                                    key={order.id}
                                    hover
                                    component={Link}
                                    href={route("vendor.orders.show", order.id)}
                                    sx={{ textDecoration: "none", cursor: "pointer" }}
                                >
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            sx={{ fontFamily: "monospace", fontWeight: 700 }}
                                        >
                                            {order.reference_number}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {order.warehouse ?? order.store ?? "—"}
                                    </TableCell>
                                    <TableCell>{order.raised_by ?? "—"}</TableCell>
                                    <TableCell align="right">
                                        {formatMoney(order.total_amount)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatMoment(order.purchased_at ?? order.created_at)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <OrderStatusChip status={order.status} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {pagination.last_page > 1 ? (
                    <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="center"
                        sx={{ p: 2 }}
                    >
                        <Button
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(
                                    route("vendor.orders.index"),
                                    { ...filters, page: pagination.current_page - 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page}
                        </Typography>
                        <Button
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(
                                    route("vendor.orders.index"),
                                    { ...filters, page: pagination.current_page + 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </VendorCard>
        </>
    );
}

Orders.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
