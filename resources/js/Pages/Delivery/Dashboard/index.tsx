import { Head, Link, router, usePoll } from "@inertiajs/react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import VpnKeyRoundedIcon from "@mui/icons-material/VpnKeyRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import {
    Avatar,
    Box,
    Button,
    Container,
    Chip,
    Grid,
    LinearProgress,
    Paper,
    Stack,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import React from "react";

import { DeliveryHero, EmptyRuns, RunCard, SectionTitle, StatTile } from "@/Components/Delivery/deliveryUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { BeingPackedRun, DeliveryDashboardProps, DeliveryRun } from "@/types/delivery";

/** "Good morning" etc., from the device clock. */
function greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** One order being picked for the courier: who, where to, how far along. */
function PackingCard({ run }: { run: BeingPackedRun }): React.ReactElement {
    const progress = run.lines > 0 ? Math.round((run.in_hand / run.lines) * 100) : 0;

    return (
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: "divider", backgroundImage: "none" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, fontFamily: "monospace" }} noWrap>
                    {run.reference ?? run.tracking_number}
                </Typography>
                <Stack direction="row" spacing={0.5}>
                    {run.mine ? <Chip size="small" color="primary" label="Yours" sx={{ fontWeight: 700 }} /> : null}
                    <Chip
                        size="small"
                        color={run.packed ? "success" : "info"}
                        variant="outlined"
                        label={run.packed ? "Packed" : "Picking"}
                        sx={{ fontWeight: 700 }}
                    />
                </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                {run.store ?? "Store"} ·{" "}
                {run.method === "vehicle" ? `vehicle collects${run.plate ? ` (${run.plate})` : ""}` : run.address ? `to ${run.address}` : "address to follow"}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={run.packed ? 100 : progress} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {run.in_hand}/{run.lines} in hand
                </Typography>
            </Stack>
            {!run.paid ? (
                <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5 }}>
                    Waiting for payment before it can be handed over.
                </Typography>
            ) : null}
        </Paper>
    );
}

/**
 * Courier home screen — today's workload, shortcuts to each board, the next
 * runs waiting, and orders being picked and packed for them (refreshed every
 * 20 seconds, so progress at the store shows up without a reload).
 */
export default function Dashboard({
    metrics,
    up_next: upNext,
    available_runs: availableRuns,
    being_packed: beingPacked = [],
    courier,
}: DeliveryDashboardProps): React.ReactElement {
    const theme = useTheme();

    usePoll(20_000, { only: ["being_packed", "up_next", "available_runs", "metrics"] });

    const claim = (run: DeliveryRun): void => {
        router.post(route("delivery.delivery.claim", run.id), {}, { preserveScroll: true });
    };

    const shortcuts = [
        { label: "Deliveries", hint: "Customer drop-offs", icon: <LocalShippingRoundedIcon />, href: route("delivery.delivery.index"), color: theme.palette.primary.main },
        { label: "Freight", hint: "Hub → store runs", icon: <WarehouseRoundedIcon />, href: route("delivery.shipments.index"), color: theme.palette.info.main },
        { label: "Transfers", hint: "Site to site", icon: <SwapHorizRoundedIcon />, href: route("delivery.transfers.index"), color: theme.palette.success.main },
        { label: "Calendar", hint: "Your runs by day", icon: <CalendarMonthRoundedIcon />, href: route("delivery.calendar"), color: theme.palette.warning.main },
        { label: "Keys", hint: "Car keys you hold", icon: <VpnKeyRoundedIcon />, href: route("delivery.work"), color: theme.palette.secondary.main },
    ];

    return (
        <>
            <Head title="Delivery Dashboard" />

            <DeliveryHero
                eyebrow={greeting()}
                title={courier.name || "Driver"}
                subtitle={
                    metrics.open > 0
                        ? `${metrics.open} run${metrics.open === 1 ? "" : "s"} still open today.`
                        : "Nothing open right now."
                }
                action={
                    <Avatar sx={{ width: 48, height: 48, bgcolor: alpha("#fff", 0.2), color: "inherit", fontWeight: 800 }}>
                        {(courier.name || "D").charAt(0).toUpperCase()}
                    </Avatar>
                }
            >
                <Grid container spacing={1}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatTile onHero label="Assigned" value={metrics.assigned} icon={<PendingActionsRoundedIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatTile onHero label="In transit" value={metrics.in_transit} icon={<LocalShippingRoundedIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatTile onHero label="Done today" value={metrics.delivered_today} icon={<CheckCircleRoundedIcon />} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatTile onHero label="Failed" value={metrics.failed} icon={<ErrorRoundedIcon />} />
                    </Grid>
                </Grid>
            </DeliveryHero>

            <Container maxWidth="sm" sx={{ pt: 2.5, pb: 4 }}>
                {/* ── Boards ── */}
                <Stack spacing={1} sx={{ mb: 3 }}>
                    {shortcuts.map((s) => (
                        <Paper
                            key={s.label}
                            component={Link}
                            href={s.href}
                            elevation={0}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                p: 1.5,
                                borderRadius: 3.5,
                                border: 1,
                                borderColor: "divider",
                                textDecoration: "none",
                                color: "text.primary",
                                backgroundImage: "none",
                                transition: "transform 0.12s, box-shadow 0.12s",
                                "&:active": { transform: "scale(0.99)" },
                                "&:hover": { boxShadow: `0 4px 16px ${alpha(s.color, 0.15)}` },
                            }}
                        >
                            <Avatar sx={{ bgcolor: alpha(s.color, 0.14), color: s.color, width: 44, height: 44, borderRadius: 3 }}>
                                {s.icon}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 800 }}>{s.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {s.hint}
                                </Typography>
                            </Box>
                            <ChevronRightRoundedIcon color="action" />
                        </Paper>
                    ))}
                </Stack>

                {/* ── Being picked at the store ── */}
                {beingPacked.length > 0 ? (
                    <>
                        <SectionTitle title="Being packed" count={beingPacked.length} />
                        <Stack spacing={1} sx={{ mb: 3 }}>
                            {beingPacked.map((run) => (
                                <PackingCard key={run.id} run={run} />
                            ))}
                        </Stack>
                    </>
                ) : null}

                {/* ── Up next ── */}
                <SectionTitle
                    title="Up next"
                    count={upNext.length}
                    action={
                        <Button component={Link} href={route("delivery.delivery.index")} size="small" sx={{ fontWeight: 700 }}>
                            All runs
                        </Button>
                    }
                />

                <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {upNext.length === 0 ? (
                        <EmptyRuns title="No runs assigned" hint="Claim one from the pool below to get going." />
                    ) : (
                        upNext.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    <Button
                                        component={Link}
                                        href={route("delivery.delivery.index")}
                                        variant="contained"
                                        fullWidth
                                        sx={{ borderRadius: 2.5, fontWeight: 800 }}
                                    >
                                        Open run
                                    </Button>
                                }
                            />
                        ))
                    )}
                </Stack>

                {/* ── Unclaimed pool ── */}
                <SectionTitle title="Available to claim" count={metrics.unassigned} />

                <Stack spacing={1.5}>
                    {availableRuns.length === 0 ? (
                        <EmptyRuns title="Nothing in the pool" hint="New deliveries appear here as orders are dispatched." />
                    ) : (
                        availableRuns.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        sx={{ borderRadius: 2.5, fontWeight: 800 }}
                                        onClick={() => claim(run)}
                                    >
                                        Claim this run
                                    </Button>
                                }
                            />
                        ))
                    )}
                </Stack>
            </Container>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
