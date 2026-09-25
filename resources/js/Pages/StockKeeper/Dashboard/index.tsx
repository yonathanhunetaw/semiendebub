import { Head, Link } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import {
    Box,
    Button,
    Grid,
    LinearProgress,
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
    PageHeader,
    SkCard,
    StatCard,
    StockStatusChip,
    formatMoment,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperDashboardProps } from "@/types/stockkeeper";

/**
 * Warehouse desk overview.
 *
 * Reads entirely from the live stock ledger — no placeholder figures.
 */
export default function Dashboard({
    metrics,
    alerts,
    recent_movements: recentMovements,
    locations,
    assigned_location: assignedLocation,
    transfer_summary: transferSummary,
}: StockKeeperDashboardProps): React.ReactElement {
    const warehouseShare =
        metrics.units_on_hand > 0
            ? Math.round((metrics.warehouse_units / metrics.units_on_hand) * 100)
            : 0;

    return (
        <>
            <Head title="StockKeeper Dashboard" />

            <PageHeader
                title="Warehouse Desk"
                subtitle={
                    assignedLocation
                        ? `Posted at ${assignedLocation.name}`
                        : "Live position across every stocked location"
                }
                action={
                    <Stack direction="row" spacing={1}>
                        <Button
                            component={Link}
                            href={route("stock_keeper.alerts.index")}
                            variant="outlined"
                            startIcon={<NotificationsActiveRoundedIcon />}
                        >
                            Alerts
                        </Button>
                        <Button
                            component={Link}
                            href={route("stock_keeper.inventory.index")}
                            variant="contained"
                            startIcon={<Inventory2RoundedIcon />}
                        >
                            Inventory
                        </Button>
                    </Stack>
                }
            />

            {/* ── KPIs ── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Units on hand"
                        value={metrics.units_on_hand}
                        hint={`${metrics.stock_rows.toLocaleString()} ledger rows`}
                        icon={<Inventory2RoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Tracked SKUs"
                        value={metrics.tracked_skus}
                        hint={`${metrics.warehouses} warehouse${metrics.warehouses === 1 ? "" : "s"}`}
                        icon={<WarehouseRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Low stock"
                        value={metrics.low_stock}
                        hint="At or below minimum"
                        tone={metrics.low_stock > 0 ? "warning" : "success"}
                        icon={<NotificationsActiveRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Out of stock"
                        value={metrics.out_of_stock}
                        hint="Zero units remaining"
                        tone={metrics.out_of_stock > 0 ? "danger" : "success"}
                        icon={<LocalShippingRoundedIcon fontSize="small" />}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={2.5}>
                {/* ── Most urgent alerts ── */}
                <Grid size={{ xs: 12, lg: 8 }}>
                    <SkCard sx={{ p: 0, overflow: "hidden" }}>
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ p: 2.5, pb: 1.5 }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Needs replenishment
                            </Typography>
                            <Button
                                component={Link}
                                href={route("stock_keeper.alerts.index")}
                                size="small"
                            >
                                View all
                            </Button>
                        </Stack>

                        {alerts.length === 0 ? (
                            <EmptyState
                                title="Nothing below threshold"
                                hint="Every tracked row is above its minimum."
                            />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Product</TableCell>
                                        <TableCell>Location</TableCell>
                                        <TableCell align="right">On hand</TableCell>
                                        <TableCell align="right">Min</TableCell>
                                        <TableCell align="right">Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {alerts.map((row) => (
                                        <TableRow key={row.id} hover>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ fontWeight: 600 }}
                                                    noWrap
                                                >
                                                    {row.product_name}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    {row.variant_label}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{row.location_name}</TableCell>
                                            <TableCell align="right">
                                                {row.quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell align="right">
                                                {row.min_stock_level.toLocaleString()}
                                            </TableCell>
                                            <TableCell align="right">
                                                <StockStatusChip status={row.status} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </SkCard>
                </Grid>

                {/* ── Distribution + transfers ── */}
                <Grid size={{ xs: 12, lg: 4 }}>
                    <Stack spacing={2.5}>
                        <SkCard>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                                Where stock sits
                            </Typography>

                            <Box sx={{ mb: 1 }}>
                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    sx={{ mb: 0.5 }}
                                >
                                    <Typography variant="caption" color="text.secondary">
                                        Warehouses
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                        {metrics.warehouse_units.toLocaleString()} ({warehouseShare}%)
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={warehouseShare}
                                    sx={{ height: 8, borderRadius: 4 }}
                                />
                            </Box>

                            <Box>
                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    sx={{ mb: 0.5 }}
                                >
                                    <Typography variant="caption" color="text.secondary">
                                        Stores
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                        {metrics.store_units.toLocaleString()} ({100 - warehouseShare}%)
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    color="secondary"
                                    value={100 - warehouseShare}
                                    sx={{ height: 8, borderRadius: 4 }}
                                />
                            </Box>

                            <Stack spacing={0.75} sx={{ mt: 2.5 }}>
                                {locations.map((location) => (
                                    <Stack
                                        key={`${location.kind}-${location.id}`}
                                        direction="row"
                                        justifyContent="space-between"
                                    >
                                        <Typography variant="body2" noWrap>
                                            {location.name}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 700 }}
                                        >
                                            {location.units.toLocaleString()}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        </SkCard>

                        <SkCard>
                            <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                sx={{ mb: 1.5 }}
                            >
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    Transfers
                                </Typography>
                                <Button
                                    component={Link}
                                    href={route("stock_keeper.transfers.index")}
                                    size="small"
                                >
                                    Manage
                                </Button>
                            </Stack>

                            <Grid container spacing={1.5}>
                                <Grid size={4}>
                                    <StatCard label="Queued" value={transferSummary.pending} />
                                </Grid>
                                <Grid size={4}>
                                    <StatCard
                                        label="Transit"
                                        value={transferSummary.in_transit}
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <StatCard
                                        label="Done"
                                        value={transferSummary.completed}
                                    />
                                </Grid>
                            </Grid>
                        </SkCard>
                    </Stack>
                </Grid>

                {/* ── Recently touched ── */}
                <Grid size={12}>
                    <SkCard sx={{ p: 0, overflow: "hidden" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, p: 2.5, pb: 1.5 }}>
                            Recently updated rows
                        </Typography>

                        {recentMovements.length === 0 ? (
                            <EmptyState title="No ledger activity yet" />
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Product</TableCell>
                                        <TableCell>SKU</TableCell>
                                        <TableCell>Location</TableCell>
                                        <TableCell align="right">On hand</TableCell>
                                        <TableCell align="right">Updated</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentMovements.map((row) => (
                                        <TableRow key={row.id} hover>
                                            <TableCell>{row.product_name}</TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ fontFamily: "monospace" }}
                                                >
                                                    {row.sku ?? "—"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{row.location_name}</TableCell>
                                            <TableCell align="right">
                                                {row.quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatMoment(row.updated_at)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </SkCard>
                </Grid>
            </Grid>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
