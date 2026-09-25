import { Head, router } from "@inertiajs/react";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import {
    Alert,
    Button,
    Chip,
    Container,
    Grid,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

import { StatTile } from "@/Components/Delivery/deliveryUi";
import {
    ShipmentCard,
    ShipmentRouteHeader,
    TransitionBar,
    formatMoment,
} from "@/Components/Shipment/shipmentUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { DeliveryFreightIndexProps, Shipment } from "@/types/shipment";

/**
 * Inter-store freight for the courier.
 *
 * Distinct from the last-mile delivery list: these are vehicle loads moving
 * between stores. A run is claimed from the pool, carried, and handed over —
 * the destination confirms receipt separately, which is what actually moves
 * the stock onto their books.
 */
export default function DeliveryFreight({
    runs,
    available_runs: availableRuns,
    completed_runs: completedRuns,
    filters,
    metrics,
    flash,
}: DeliveryFreightIndexProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const setTab = (tab: string): void => {
        router.get(
            route("delivery.shipments.index"),
            { tab },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const claim = (shipment: Shipment): void => {
        router.post(
            route("delivery.shipments.claim", shipment.id),
            {},
            { preserveScroll: true },
        );
    };

    const visible =
        filters.tab === "available"
            ? availableRuns
            : filters.tab === "completed"
              ? completedRuns
              : runs;

    return (
        <>
            <Head title="Freight Runs" />

            <Container sx={{ pt: 3, pb: 10 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
                    Freight Runs
                </Typography>

                <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                    <Grid size={3}>
                        <StatTile
                            label="To collect"
                            value={metrics.assigned}
                            tone={metrics.assigned > 0 ? "warning" : "default"}
                        />
                    </Grid>
                    <Grid size={3}>
                        <StatTile label="On road" value={metrics.in_transit} />
                    </Grid>
                    <Grid size={3}>
                        <StatTile label="In pool" value={metrics.available} />
                    </Grid>
                    <Grid size={3}>
                        <StatTile label="Done" value={metrics.completed} tone="success" />
                    </Grid>
                </Grid>

                <Stack direction="row" spacing={1} sx={{ mb: 2.5, overflowX: "auto", pb: 0.5 }}>
                    {[
                        { value: "mine", label: "My runs" },
                        { value: "available", label: `Available (${metrics.available})` },
                        { value: "completed", label: "Completed" },
                    ].map((tab) => (
                        <Chip
                            key={tab.value}
                            label={tab.label}
                            onClick={() => setTab(tab.value)}
                            color={filters.tab === tab.value ? "primary" : "default"}
                            variant={filters.tab === tab.value ? "filled" : "outlined"}
                            sx={{ fontWeight: 700, flexShrink: 0 }}
                        />
                    ))}
                </Stack>

                {visible.length === 0 ? (
                    <ShipmentCard sx={{ textAlign: "center", py: 5 }}>
                        <LocalShippingRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
                            Nothing here
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {filters.tab === "available"
                                ? "Dispatched loads will appear here to claim."
                                : "Claim a run to get started."}
                        </Typography>
                    </ShipmentCard>
                ) : (
                    <Stack spacing={2}>
                        {visible.map((shipment) => (
                            <ShipmentCard key={shipment.id}>
                                <ShipmentRouteHeader shipment={shipment} />

                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block", mt: 1 }}
                                >
                                    {shipment.vehicle_name ?? "Vehicle unassigned"}
                                    {shipment.vehicle_plate ? ` · ${shipment.vehicle_plate}` : ""}
                                    {shipment.eta ? ` · ETA ${formatMoment(shipment.eta)}` : ""}
                                </Typography>

                                {filters.tab === "available" ? (
                                    <Button
                                        variant="contained"
                                        size="small"
                                        fullWidth
                                        sx={{ mt: 1.5 }}
                                        onClick={() => claim(shipment)}
                                    >
                                        Claim this run
                                    </Button>
                                ) : (
                                    <TransitionBar
                                        shipment={shipment}
                                        transitionRoute="delivery.shipments.transition"
                                    />
                                )}
                            </ShipmentCard>
                        ))}
                    </Stack>
                )}
            </Container>

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                sx={{ bottom: { xs: 72 } }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

DeliveryFreight.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
