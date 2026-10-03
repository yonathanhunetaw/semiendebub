import { Head, router } from "@inertiajs/react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Chip,
    Grid,
    MenuItem,
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

import {
    EmptyState,
    PageHeader,
    SkCard,
    StatCard,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { Pagination, SharedProps } from "@/types/stockkeeper";

/** One place a line can be picked from (OrderSourcingService::pickPackPlan). */
interface SourceOption {
    location_type: string;
    location_id: number;
    kind: string;
    level_label: string;
    name: string;
    on_hand: number;
    sufficient: boolean;
}

interface PickLine {
    id: number;
    title: string;
    variant_label: string;
    sku: string | null;
    quantity: number;
    picked_quantity: number;
    suggested_source: { location_type: string; location_id: number } | null;
    confirmed_source: { location_type: string; location_id: number } | null;
    options: SourceOption[];
}

interface PickOrder {
    sale: {
        id: number;
        reference: string;
        customer: string | null;
        store_name: string | null;
        stage_label: string;
        delay_agreed: boolean;
    };
    lines: PickLine[];
    delivery: { status: string; courier: string | null; address: string | null } | null;
}

interface OrdersProps extends SharedProps {
    orders?: PickOrder[];
    tab?: "to_pick" | "with_delivery";
    counts?: { to_pick: number; with_delivery: number };
    pagination: Pagination;
}

const key = (source: { location_type: string; location_id: number } | null): string =>
    source ? `${source.location_type}#${source.location_id}` : "";

/**
 * The floor's pick queue — real orders waiting for Pick & Pack.
 *
 * Each line names where it comes from: the store's shelf, its floor or its
 * Remote Hub, with what each holds and the nearest that covers it preselected.
 * Confirming books the goods out and hands them to Delivery.
 */
export default function Orders({
    orders = [],
    tab = "to_pick",
    counts = { to_pick: 0, with_delivery: 0 },
    pagination,
}: OrdersProps): React.ReactElement {
    const pickable = orders.filter((o) => o.lines.every((l) => l.options.some((opt) => opt.sufficient))).length;

    const setTab = (next: string): void =>
        router.get(route("stock_keeper.orders.index"), next === "to_pick" ? {} : { tab: next }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });

    return (
        <>
            <Head title="Pick Queue" />

            <PageHeader title="Pick Queue" subtitle="Paid orders to pick from the shelf, the store floor or the Remote Hub, then hand to Delivery." />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="To pick" value={counts.to_pick} icon={<Inventory2RoundedIcon fontSize="small" />} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Fully pickable"
                        value={tab === "to_pick" ? pickable : "—"}
                        tone={pickable > 0 ? "success" : "default"}
                        icon={<CheckCircleRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Short somewhere"
                        value={tab === "to_pick" ? orders.length - pickable : "—"}
                        tone={orders.length - pickable > 0 && tab === "to_pick" ? "danger" : "default"}
                        icon={<ErrorRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="With Delivery" value={counts.with_delivery} icon={<LocalShippingRoundedIcon fontSize="small" />} />
                </Grid>
            </Grid>

            <SkCard sx={{ p: 2.5, mb: 2.5 }}>
                <Stack direction="row" spacing={1}>
                    {[
                        { value: "to_pick", label: `To pick (${counts.to_pick})` },
                        { value: "with_delivery", label: `With Delivery (${counts.with_delivery})` },
                    ].map((option) => (
                        <Chip
                            key={option.value}
                            label={option.label}
                            onClick={() => setTab(option.value)}
                            color={tab === option.value ? "primary" : "default"}
                            variant={tab === option.value ? "filled" : "outlined"}
                            sx={{ fontWeight: 700 }}
                        />
                    ))}
                </Stack>
            </SkCard>

            {orders.length === 0 ? (
                <SkCard>
                    <EmptyState
                        icon={<Inventory2RoundedIcon fontSize="large" />}
                        title={tab === "to_pick" ? "Nothing to pick" : "Nothing with Delivery"}
                        hint={tab === "to_pick" ? "Paid orders appear here until they are picked." : "Picked orders appear here until delivered."}
                    />
                </SkCard>
            ) : (
                <Stack spacing={1.5}>
                    {orders.map((order) => (
                        <OrderCard key={order.sale.id} order={order} editable={tab === "to_pick"} />
                    ))}
                </Stack>
            )}

            {pagination.last_page > 1 ? (
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 3 }}>
                    <Button
                        disabled={pagination.current_page <= 1}
                        onClick={() => router.get(route("stock_keeper.orders.index"), { tab, page: pagination.current_page - 1 }, { preserveState: true })}
                    >
                        Previous
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                        Page {pagination.current_page} of {pagination.last_page}
                    </Typography>
                    <Button
                        disabled={pagination.current_page >= pagination.last_page}
                        onClick={() => router.get(route("stock_keeper.orders.index"), { tab, page: pagination.current_page + 1 }, { preserveState: true })}
                    >
                        Next
                    </Button>
                </Stack>
            ) : null}
        </>
    );
}

function OrderCard({ order, editable }: { order: PickOrder; editable: boolean }): React.ReactElement {
    const [choices, setChoices] = useState<Record<number, string>>(() =>
        Object.fromEntries(order.lines.map((line) => [line.id, key(line.confirmed_source ?? line.suggested_source)])),
    );
    const [busy, setBusy] = useState(false);

    const short = order.lines.filter((line) => !line.options.some((o) => o.sufficient)).length;
    const ready = order.lines.every((line) => choices[line.id]);

    const confirm = (): void => {
        setBusy(true);
        router.post(
            route("stock_keeper.orders.pick", order.sale.id),
            {
                lines: order.lines.map((line) => {
                    const [type, id] = choices[line.id].split("#");
                    return { sale_item_id: line.id, location_type: type, location_id: Number(id) };
                }),
            },
            { preserveScroll: true, onFinish: () => setBusy(false) },
        );
    };

    return (
        <Accordion
            disableGutters
            elevation={0}
            defaultExpanded={editable}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, "&::before": { display: "none" }, overflow: "hidden" }}
        >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ width: "100%", pr: 2 }}>
                    <Stack>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontFamily: "monospace" }}>
                            {order.sale.reference}
                            {order.sale.customer ? ` · ${order.sale.customer}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {order.sale.store_name ?? ""} · {order.lines.length} line{order.lines.length === 1 ? "" : "s"}
                            {order.delivery?.address ? ` · to ${order.delivery.address}` : ""}
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        {editable ? (
                            <Chip
                                size="small"
                                label={short === 0 ? "Pickable" : `${short} short`}
                                color={short === 0 ? "success" : "error"}
                                sx={{ fontWeight: 700 }}
                            />
                        ) : (
                            <Chip
                                size="small"
                                label={order.delivery?.courier ? `${order.delivery.status} · ${order.delivery.courier}` : "Waiting for a courier"}
                                color="warning"
                                sx={{ fontWeight: 700 }}
                            />
                        )}
                    </Stack>
                </Stack>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Product</TableCell>
                            <TableCell align="right">Qty</TableCell>
                            <TableCell>{editable ? "Pick from" : "Picked from"}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {order.lines.map((line) => (
                            <TableRow key={line.id}>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {line.title}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                        {line.variant_label} · {line.sku ?? "—"}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">{line.quantity.toLocaleString()}</TableCell>
                                <TableCell sx={{ minWidth: 260 }}>
                                    {editable ? (
                                        <TextField
                                            select
                                            size="small"
                                            fullWidth
                                            value={choices[line.id] ?? ""}
                                            onChange={(event) => setChoices((current) => ({ ...current, [line.id]: event.target.value }))}
                                        >
                                            {line.options.map((option) => (
                                                <MenuItem key={key(option)} value={key(option)} disabled={option.on_hand <= 0}>
                                                    {option.level_label} · {option.name} — {option.on_hand.toLocaleString()} on hand
                                                    {option.sufficient ? "" : " (not enough)"}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    ) : (
                                        line.options.find((o) => key(o) === key(line.confirmed_source))?.name ?? "—"
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {editable ? (
                    <Stack direction="row" justifyContent="flex-end" sx={{ p: 1.5 }}>
                        <Button variant="contained" disabled={!ready || busy} onClick={confirm} startIcon={<LocalShippingRoundedIcon />}>
                            Pick &amp; hand to Delivery
                        </Button>
                    </Stack>
                ) : null}
            </AccordionDetails>
        </Accordion>
    );
}

Orders.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
