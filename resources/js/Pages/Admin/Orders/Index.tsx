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
import { dayDateTime } from "@/utils/dates";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, PageBand, Pill, adminTableSx, densePanelSx } from "@/Components/Admin/adminUi";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import AgeBadge from "@/Components/Shared/time/AgeBadge";
import DayTag from "@/Components/Shared/time/DayTag";
import { DayHeadingRow, startsDay } from "@/Components/Shared/time/DayHeading";
import TimeFilterChips from "@/Components/Shared/time/TimeFilterChips";
import type { DayTagView, TimeFilterView } from "@/types/time";

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
    /** Still on its way: listed whatever its day. */
    open: boolean;
    day: DayTagView | null;
}

interface Props {
    orders?: OrderRow[];
    counts?: Partial<Record<Stage, number>>;
    filters: { stage: string; store: number | null; search: string; when: string };
    time: TimeFilterView;
    stores?: Array<{ id: number; name: string }>;
    /** A global admin may look at every store at once. */
    can_pick_all?: boolean;
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
export default function OrdersIndex({ orders = [], counts = {}, filters, time, stores = [], can_pick_all = false, pagination }: Props): React.ReactElement {
    const [search, setSearch] = useState(filters.search ?? "");

    /*
     * The store is the admin app's active store (session-backed, shared with
     * the sidebar dropdown), so it is only sent when this picker changes it,
     * and "All stores" is sent as `all` rather than dropped.
     */
    const go = (patch: Record<string, string | number | null>): void => {
        const { store: _store, ...rest } = { ...filters, ...patch } as Record<string, string | number | null>;
        const query: Record<string, string | number> = Object.fromEntries(
            Object.entries(rest).filter(([, value]) => value !== null && value !== "" && value !== "all"),
        ) as Record<string, string | number>;
        if ("store" in patch) {
            query.store = patch.store ?? "all";
        }
        router.get(route("admin.orders.index"), query, { preserveState: true, preserveScroll: true, replace: true });
    };

    const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

    return (
        <>
            <Head title="Orders" />
            <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
                <PageBand
                    icon={<ReceiptLongOutlined />}
                    title="Orders"
                    subtitle="Every store's orders. Open one to see its chain of custody."
                    actions={
                        <Button component={Link} href={route("admin.carts.index")} size="small" variant="contained" disableElevation sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                            Open carts
                        </Button>
                    }
                />

                <FigureRow>
                    <FigureTile label="To pay" value={counts.to_pay ?? 0} tone={(counts.to_pay ?? 0) > 0 ? "warning" : "default"} />
                    <FigureTile label="Pick & Pack" value={(counts.paid ?? 0) + (counts.packing ?? 0)} tone="info" />
                    <FigureTile label="With Delivery" value={counts.to_deliver ?? 0} tone="primary" />
                    <FigureTile label="Delivered" value={counts.delivered ?? 0} tone="success" />
                </FigureRow>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
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
                    {(can_pick_all || stores.length > 1) && <TextField
                        select
                        size="small"
                        label="Store"
                        value={filters.store ?? ""}
                        onChange={(event) => go({ store: event.target.value === "" ? null : Number(event.target.value), page: null })}
                        sx={{ minWidth: 180 }}
                    >
                        {can_pick_all && <MenuItem value="">All stores</MenuItem>}
                        {stores.map((store) => (
                            <MenuItem key={store.id} value={store.id}>
                                {store.name}
                            </MenuItem>
                        ))}
                    </TextField>}
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

                <Box>
                    <TimeFilterChips filter={time} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Orders still on their way are always listed; the day narrows the finished ones.
                    </Typography>
                </Box>

                <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflowX: "auto" }}>
                    <Table size="small" sx={adminTableSx}>
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
                            {orders.map((order, i) => {
                                const stage = STAGES.find((s) => s.value === (order.stage === "packing" ? "paid" : order.stage));
                                return (
                                    <React.Fragment key={order.id}>
                                    {startsDay(orders, i) ? <DayHeadingRow tag={order.day} colSpan={7} /> : null}
                                    <TableRow
                                        hover
                                        sx={{ cursor: "pointer" }}
                                        onClick={() => router.visit(route("admin.orders.custody", { reference: order.reference }))}
                                    >
                                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{order.reference}</TableCell>
                                        <TableCell>{order.store ?? "—"}</TableCell>
                                        <TableCell>{order.customer}</TableCell>
                                        <TableCell>
                                            <Pill tone={stage?.color ?? "default"} label={stage?.label ?? order.stage} />
                                        </TableCell>
                                        <TableCell>
                                            {order.delivery_status ? `${order.delivery_status.replace("_", " ")}${order.courier ? ` · ${order.courier}` : ""}` : "—"}
                                        </TableCell>
                                        <TableCell align="right">{birr(order.total)}</TableCell>
                                        <TableCell>
                                            {dayDateTime(order.placed_at)}
                                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                                                <DayTag tag={order.day} />
                                                {order.open ? <AgeBadge since={order.placed_at} warnHours={24} lateHours={72} /> : null}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                    </React.Fragment>
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
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
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

            </Box>
        </>
    );
}

OrdersIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
