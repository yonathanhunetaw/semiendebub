import { Head, router } from "@inertiajs/react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Chip,
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
    PageHeader,
    SkCard,
    StatCard,
    formatMoment,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { Pagination, SharedProps } from "@/types/stockkeeper";

interface PickLine {
    variant_id: number;
    product_name: string;
    sku: string | null;
    required: number;
    on_hand: number;
    /** Units the ledger cannot cover; 0 means the line is pickable. */
    short_by: number;
}

interface PickJob {
    id: number;
    reference: string;
    status: string;
    priority: number;
    customer: string | null;
    seller: string | null;
    line_count: number;
    unit_count: number;
    shortfall_lines: number;
    lines: PickLine[];
    created_at: string | null;
}

interface OrdersProps extends SharedProps {
    orders: PickJob[];
    filters: { status: string };
    counts: { all: number; open: number; pending: number };
    pagination: Pagination;
}

const STATUS_TABS: Array<{ value: string; label: string }> = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "pending", label: "Pending" },
];

/**
 * Outbound pick queue.
 *
 * Built from committed carts — this schema has no `orders` table — with each
 * line checked against the ledger so shortfalls surface before picking starts.
 */
export default function Orders({
    orders,
    filters,
    counts,
    pagination,
}: OrdersProps): React.ReactElement {
    const pickable = orders.filter((job) => job.shortfall_lines === 0).length;

    return (
        <>
            <Head title="Pick Queue" />

            <PageHeader
                title="Pick Queue"
                subtitle="Committed carts awaiting fulfilment, checked against stock on hand."
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="Jobs in view" value={orders.length} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Fully pickable"
                        value={pickable}
                        tone={pickable > 0 ? "success" : "default"}
                        icon={<CheckCircleRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="With shortfalls"
                        value={orders.length - pickable}
                        tone={orders.length - pickable > 0 ? "danger" : "default"}
                        icon={<ErrorRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="All carts" value={counts.all} />
                </Grid>
            </Grid>

            <SkCard sx={{ p: 2.5, mb: 2.5 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {STATUS_TABS.map((tab) => {
                        const active = filters.status === tab.value;
                        return (
                            <Chip
                                key={tab.value}
                                label={tab.label}
                                onClick={() =>
                                    router.get(
                                        route("stock_keeper.orders.index"),
                                        tab.value === "all" ? {} : { status: tab.value },
                                        { preserveState: true, preserveScroll: true, replace: true },
                                    )
                                }
                                color={active ? "primary" : "default"}
                                variant={active ? "filled" : "outlined"}
                                sx={{ fontWeight: 700 }}
                            />
                        );
                    })}
                </Stack>
            </SkCard>

            {orders.length === 0 ? (
                <SkCard>
                    <EmptyState
                        icon={<Inventory2RoundedIcon fontSize="large" />}
                        title="Nothing to pick"
                        hint="Committed carts will appear here as a pick job."
                    />
                </SkCard>
            ) : (
                <Stack spacing={1.5}>
                    {orders.map((job) => (
                        <Accordion
                            key={job.id}
                            disableGutters
                            elevation={0}
                            sx={{
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 3,
                                "&::before": { display: "none" },
                                overflow: "hidden",
                            }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                                <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1.5}
                                    alignItems={{ sm: "center" }}
                                    justifyContent="space-between"
                                    sx={{ width: "100%", pr: 2 }}
                                >
                                    <Stack>
                                        <Typography
                                            variant="subtitle2"
                                            sx={{ fontWeight: 800 }}
                                        >
                                            {job.reference}
                                            {job.customer ? ` · ${job.customer}` : ""}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {job.line_count} line
                                            {job.line_count === 1 ? "" : "s"} ·{" "}
                                            {job.unit_count.toLocaleString()} units ·{" "}
                                            {formatMoment(job.created_at)}
                                        </Typography>
                                    </Stack>

                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Chip
                                            size="small"
                                            label={job.status}
                                            variant="outlined"
                                            sx={{ fontWeight: 700 }}
                                        />
                                        <Chip
                                            size="small"
                                            label={
                                                job.shortfall_lines === 0
                                                    ? "Pickable"
                                                    : `${job.shortfall_lines} short`
                                            }
                                            color={
                                                job.shortfall_lines === 0 ? "success" : "error"
                                            }
                                            sx={{ fontWeight: 700 }}
                                        />
                                    </Stack>
                                </Stack>
                            </AccordionSummary>

                            <AccordionDetails sx={{ p: 0 }}>
                                {job.lines.length === 0 ? (
                                    <EmptyState title="This cart holds no lines" />
                                ) : (
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Product</TableCell>
                                                <TableCell>SKU</TableCell>
                                                <TableCell align="right">Required</TableCell>
                                                <TableCell align="right">On hand</TableCell>
                                                <TableCell align="right">Short by</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {job.lines.map((line) => (
                                                <TableRow key={line.variant_id} hover>
                                                    <TableCell>{line.product_name}</TableCell>
                                                    <TableCell>
                                                        <Typography
                                                            variant="caption"
                                                            sx={{ fontFamily: "monospace" }}
                                                        >
                                                            {line.sku ?? "—"}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {line.required.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {line.on_hand.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography
                                                            variant="body2"
                                                            sx={{
                                                                fontWeight: 700,
                                                                color:
                                                                    line.short_by > 0
                                                                        ? "error.main"
                                                                        : "text.disabled",
                                                            }}
                                                        >
                                                            {line.short_by > 0
                                                                ? line.short_by.toLocaleString()
                                                                : "—"}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Stack>
            )}

            {pagination.last_page > 1 ? (
                <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="center"
                    sx={{ mt: 3 }}
                >
                    <Button
                        disabled={pagination.current_page <= 1}
                        onClick={() =>
                            router.get(
                                route("stock_keeper.orders.index"),
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
                                route("stock_keeper.orders.index"),
                                { ...filters, page: pagination.current_page + 1 },
                                { preserveState: true },
                            )
                        }
                    >
                        Next
                    </Button>
                </Stack>
            ) : null}
        </>
    );
}

Orders.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
