import { Head, Link } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import {
    Button,
    Grid,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
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
import type { VendorDashboardProps } from "@/types/vendor";

/**
 * Supplier overview — what they supply, and what has been ordered from them.
 */
export default function Dashboard({
    metrics,
    recent_orders: recentOrders,
    catalogue_preview: cataloguePreview,
    vendor,
}: VendorDashboardProps): React.ReactElement {
    return (
        <>
            <Head title="Vendor Dashboard" />

            <PageHeader
                title={`Welcome, ${vendor.name || "Supplier"}`}
                subtitle="Your catalogue and the orders placed with you."
                action={
                    <Stack direction="row" spacing={1}>
                        <Button
                            component={Link}
                            href={route("vendor.catalogue.index")}
                            variant="outlined"
                            startIcon={<Inventory2RoundedIcon />}
                        >
                            Catalogue
                        </Button>
                        <Button
                            component={Link}
                            href={route("vendor.orders.index")}
                            variant="contained"
                            startIcon={<ReceiptLongRoundedIcon />}
                        >
                            Orders
                        </Button>
                    </Stack>
                }
            />

            {/* ── KPIs ── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="SKUs supplied"
                        value={metrics.catalogue_skus}
                        icon={<Inventory2RoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Units in network"
                        value={metrics.units_in_network}
                        hint="Across every store and warehouse"
                        icon={<WarehouseRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Open orders"
                        value={metrics.orders_pending}
                        tone={metrics.orders_pending > 0 ? "warning" : "default"}
                        hint={formatMoney(metrics.revenue_pending)}
                        icon={<ReceiptLongRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Received value"
                        value={formatMoney(metrics.revenue_received)}
                        tone="success"
                        hint={`${metrics.orders_received} order${metrics.orders_received === 1 ? "" : "s"}`}
                        icon={<PaidRoundedIcon fontSize="small" />}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={2.5}>
                {/* ── Recent orders ── */}
                <Grid size={{ xs: 12, lg: 7 }}>
                    <VendorCard sx={{ p: 0, overflow: "hidden" }}>
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ p: 2.5, pb: 1.5 }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Recent orders
                            </Typography>
                            <Button
                                component={Link}
                                href={route("vendor.orders.index")}
                                size="small"
                            >
                                View all
                            </Button>
                        </Stack>

                        {recentOrders.length === 0 ? (
                            <EmptyState
                                icon={<ReceiptLongRoundedIcon fontSize="large" />}
                                title="No orders yet"
                                hint="Purchase orders raised with you will appear here."
                            />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Reference</TableCell>
                                        <TableCell>Destination</TableCell>
                                        <TableCell align="right">Value</TableCell>
                                        <TableCell align="right">Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentOrders.map((order) => (
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
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    display="block"
                                                >
                                                    {formatMoment(order.purchased_at ?? order.created_at)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {order.warehouse ?? order.store ?? "—"}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatMoney(order.total_amount)}
                                            </TableCell>
                                            <TableCell align="right">
                                                <OrderStatusChip status={order.status} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </VendorCard>
                </Grid>

                {/* ── Catalogue preview ── */}
                <Grid size={{ xs: 12, lg: 5 }}>
                    <VendorCard sx={{ p: 0, overflow: "hidden" }}>
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ p: 2.5, pb: 1.5 }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Your catalogue
                            </Typography>
                            <Button
                                component={Link}
                                href={route("vendor.catalogue.index")}
                                size="small"
                            >
                                View all
                            </Button>
                        </Stack>

                        {cataloguePreview.length === 0 ? (
                            <EmptyState
                                icon={<Inventory2RoundedIcon fontSize="large" />}
                                title="No SKUs assigned"
                                hint="Variants owned by your account will be listed here."
                            />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Product</TableCell>
                                        <TableCell align="right">In network</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {cataloguePreview.map((variant) => (
                                        <TableRow key={variant.id} hover>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ fontWeight: 600 }}
                                                    noWrap
                                                >
                                                    {variant.product_name}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    {variant.sku ?? "—"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {variant.units_in_network.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </VendorCard>
                </Grid>
            </Grid>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
