import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Container,
    Grid,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

import {
    EmptyRuns,
    RunCard,
    StatTile,
} from "@/Components/Delivery/deliveryUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { DeliveryDashboardProps, DeliveryRun } from "@/types/delivery";

/**
 * Courier home screen — today's workload and the next runs waiting.
 */
export default function Dashboard({
    metrics,
    up_next: upNext,
    available_runs: availableRuns,
    courier,
}: DeliveryDashboardProps): React.ReactElement {
    const claim = (run: DeliveryRun): void => {
        router.post(route("delivery.delivery.claim", run.id), {}, { preserveScroll: true });
    };

    return (
        <>
            <Head title="Delivery Dashboard" />

            <Container sx={{ pt: 3, pb: 10 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        Hi {courier.name || "there"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {metrics.open > 0
                            ? `${metrics.open} run${metrics.open === 1 ? "" : "s"} still open today.`
                            : "Nothing open right now."}
                    </Typography>
                </Box>

                {/* ── Today at a glance ── */}
                <Grid container spacing={1.5} sx={{ mb: 3 }}>
                    <Grid size={3}>
                        <StatTile
                            label="Assigned"
                            value={metrics.assigned}
                            tone={metrics.assigned > 0 ? "warning" : "default"}
                        />
                    </Grid>
                    <Grid size={3}>
                        <StatTile label="In transit" value={metrics.in_transit} />
                    </Grid>
                    <Grid size={3}>
                        <StatTile
                            label="Done today"
                            value={metrics.delivered_today}
                            tone="success"
                        />
                    </Grid>
                    <Grid size={3}>
                        <StatTile
                            label="Failed"
                            value={metrics.failed}
                            tone={metrics.failed > 0 ? "danger" : "default"}
                        />
                    </Grid>
                </Grid>

                {/* ── Up next ── */}
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1.5 }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Up next
                    </Typography>
                    <Button
                        component={Link}
                        href={route("delivery.delivery.index")}
                        size="small"
                    >
                        All runs
                    </Button>
                </Stack>

                <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {upNext.length === 0 ? (
                        <EmptyRuns
                            title="No runs assigned"
                            hint="Claim one from the pool below to get going."
                        />
                    ) : (
                        upNext.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    <Button
                                        component={Link}
                                        href={route("delivery.delivery.index")}
                                        variant="outlined"
                                        size="small"
                                        fullWidth
                                    >
                                        Open run
                                    </Button>
                                }
                            />
                        ))
                    )}
                </Stack>

                {/* ── Unclaimed pool ── */}
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
                    Available to claim
                    {metrics.unassigned > 0 ? ` (${metrics.unassigned})` : ""}
                </Typography>

                <Stack spacing={1.5}>
                    {availableRuns.length === 0 ? (
                        <EmptyRuns
                            title="Nothing in the pool"
                            hint="New deliveries will appear here as orders are dispatched."
                        />
                    ) : (
                        availableRuns.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    <Button
                                        variant="contained"
                                        size="small"
                                        fullWidth
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
