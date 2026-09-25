import { Head, Link, router } from "@inertiajs/react";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import { Alert, Button, Chip, Snackbar, Stack, Typography } from "@mui/material";
import React from "react";

import {
    LoadBar,
    ShipmentCard,
    ShipmentRouteHeader,
    TransitionBar,
    formatMoment,
} from "@/Components/Shipment/shipmentUi";
import { EmptyState, PageHeader } from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperShipmentIndexProps } from "@/types/shipment";

/**
 * The warehouse floor's shipment queue.
 *
 * Outbound is what has to be picked and dispatched; inbound is what is landing
 * and needs confirming.
 */
export default function StockKeeperShipments({
    shipments,
    filters,
    pagination,
    flash,
}: StockKeeperShipmentIndexProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const setDirection = (direction: string): void => {
        router.get(
            route("stock_keeper.shipments.index"),
            { direction },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    return (
        <>
            <Head title="Shipments" />

            <PageHeader
                title="Shipments"
                subtitle="Pick and dispatch outbound loads; confirm inbound ones on arrival."
            />

            <ShipmentCard sx={{ p: 2, mb: 2.5 }}>
                <Stack direction="row" spacing={1}>
                    {[
                        { value: "outbound", label: "Outbound (pick & dispatch)" },
                        { value: "inbound", label: "Inbound (receive)" },
                    ].map((tab) => (
                        <Chip
                            key={tab.value}
                            label={tab.label}
                            onClick={() => setDirection(tab.value)}
                            color={filters.direction === tab.value ? "primary" : "default"}
                            variant={filters.direction === tab.value ? "filled" : "outlined"}
                            sx={{ fontWeight: 700 }}
                        />
                    ))}
                </Stack>
            </ShipmentCard>

            {shipments.length === 0 ? (
                <ShipmentCard>
                    <EmptyState
                        icon={<LocalShippingRoundedIcon fontSize="large" />}
                        title="Nothing in this queue"
                        hint={
                            filters.direction === "inbound"
                                ? "Loads on their way to you will appear here."
                                : "Scheduled shipments awaiting a pick will appear here."
                        }
                    />
                </ShipmentCard>
            ) : (
                <Stack spacing={2}>
                    {shipments.map((shipment) => (
                        <ShipmentCard key={shipment.id}>
                            <ShipmentRouteHeader shipment={shipment} />
                            <LoadBar shipment={shipment} />

                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                                Scheduled {formatMoment(shipment.scheduled_for)}
                                {shipment.courier ? ` · Courier ${shipment.courier.name}` : ""}
                            </Typography>

                            <Stack direction="row" spacing={1} alignItems="center">
                                <TransitionBar
                                    shipment={shipment}
                                    transitionRoute="stock_keeper.shipments.transition"
                                />
                                <Button
                                    component={Link}
                                    href={route("stock_keeper.shipments.show", shipment.id)}
                                    size="small"
                                    sx={{ mt: 1.5 }}
                                >
                                    Pick list
                                </Button>
                            </Stack>
                        </ShipmentCard>
                    ))}
                </Stack>
            )}

            {pagination.last_page > 1 ? (
                <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ mt: 3 }}>
                    <Button
                        disabled={pagination.current_page <= 1}
                        onClick={() =>
                            router.get(route("stock_keeper.shipments.index"), {
                                ...filters,
                                page: pagination.current_page - 1,
                            })
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
                            router.get(route("stock_keeper.shipments.index"), {
                                ...filters,
                                page: pagination.current_page + 1,
                            })
                        }
                    >
                        Next
                    </Button>
                </Stack>
            ) : null}

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

StockKeeperShipments.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
