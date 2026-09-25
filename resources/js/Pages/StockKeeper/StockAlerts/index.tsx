import { Head, router } from "@inertiajs/react";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Box,
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
    PageHeader,
    SkCard,
    StatCard,
    StockStatusChip,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperAlertsProps } from "@/types/stockkeeper";

const SEARCH_DEBOUNCE_MS = 350;

const SEVERITIES: Array<{ value: string | null; label: string }> = [
    { value: null, label: "All alerts" },
    { value: "low_stock", label: "Low stock" },
    { value: "out_of_stock", label: "Out of stock" },
];

/**
 * Replenishment queue: every ledger row at or below its minimum, deepest
 * breach first.
 */
export default function StockAlerts({
    alerts,
    filters,
    summary,
    pagination,
}: StockKeeperAlertsProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    const applyFilters = React.useCallback(
        (next: { search?: string; severity?: string | null }): void => {
            const query: Record<string, string> = {};
            const nextSearch = next.search ?? filters.search;
            const nextSeverity =
                next.severity !== undefined ? next.severity : filters.severity;

            if (nextSearch) {
                query.search = nextSearch;
            }
            if (nextSeverity) {
                query.severity = nextSeverity;
            }

            router.get(route("stock_keeper.alerts.index"), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        },
        [filters.search, filters.severity],
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
            <Head title="Stock Alerts" />

            <PageHeader
                title="Stock Alerts"
                subtitle="Rows that have fallen to or below the minimum set for them."
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <StatCard
                        label="Breaching threshold"
                        value={summary.low_stock}
                        tone={summary.low_stock > 0 ? "warning" : "success"}
                        icon={<NotificationsActiveRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <StatCard
                        label="Out of stock"
                        value={summary.out_of_stock}
                        tone={summary.out_of_stock > 0 ? "danger" : "success"}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <StatCard label="Tracked SKUs" value={summary.tracked_skus} />
                </Grid>
            </Grid>

            <SkCard sx={{ p: 0, overflow: "hidden" }}>
                {/* ── Filters ── */}
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
                        placeholder="Search product, SKU or barcode…"
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

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        {SEVERITIES.map((option) => {
                            const active = (filters.severity ?? null) === option.value;
                            return (
                                <Chip
                                    key={option.label}
                                    label={option.label}
                                    onClick={() => applyFilters({ severity: option.value })}
                                    color={active ? "primary" : "default"}
                                    variant={active ? "filled" : "outlined"}
                                    sx={{ fontWeight: 700 }}
                                />
                            );
                        })}
                    </Stack>
                </Stack>

                {/* ── Table ── */}
                {alerts.length === 0 ? (
                    <EmptyState
                        icon={<NotificationsActiveRoundedIcon fontSize="large" />}
                        title="No alerts match this view"
                        hint="Every row here is above its minimum, or the filters are too narrow."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Product</TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell align="right">On hand</TableCell>
                                <TableCell align="right">Minimum</TableCell>
                                <TableCell align="right">Shortfall</TableCell>
                                <TableCell align="right">Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {alerts.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {row.product_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {row.variant_label}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            sx={{ fontFamily: "monospace" }}
                                        >
                                            {row.sku ?? "—"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {row.location_name}
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            display="block"
                                        >
                                            {row.location_kind}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        {row.quantity.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {row.min_stock_level.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 700,
                                                color:
                                                    row.headroom < 0
                                                        ? "error.main"
                                                        : "text.secondary",
                                            }}
                                        >
                                            {row.headroom >= 0 ? "—" : row.headroom.toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <StockStatusChip status={row.status} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {/* ── Pagination ── */}
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
                                    route("stock_keeper.alerts.index"),
                                    { ...filters, page: pagination.current_page - 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page} ·{" "}
                            {pagination.total.toLocaleString()} alerts
                        </Typography>
                        <Button
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(
                                    route("stock_keeper.alerts.index"),
                                    { ...filters, page: pagination.current_page + 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : (
                    <Box sx={{ p: 1.5 }} />
                )}
            </SkCard>
        </>
    );
}

StockAlerts.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
