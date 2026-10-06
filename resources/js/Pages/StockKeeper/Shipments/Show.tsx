import { Head, Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Alert, Box, Button, Grid, Snackbar, Typography } from "@mui/material";
import React from "react";

import HandoffPanel from "@/Components/Shipment/HandoffPanel";
import {
    AgreementPanel,
    LoadBar,
    ManifestTable,
    ShipmentCard,
    ShipmentRouteHeader,
    ShipmentTimeline,
} from "@/Components/Shipment/shipmentUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperShipmentShowProps } from "@/types/shipment";

/** Statuses after the four parties agreed, when the hand-off is under way. */
const HANDOFF_STATUSES = ["scheduled", "picking", "ready", "dispatched", "in_transit", "delivered", "received"];

/**
 * One shipment at the keeper's dock.
 *
 * Before scheduling: agree to a window. After: the origin keeper picks and
 * prepares the load in the pickup bay; the destination keeper checks what the
 * driver brought and signs it in. Both are on the hand-off panel, which only
 * offers the steps this keeper can take.
 */
export default function StockKeeperShipmentShow({
    shipment,
    flash,
}: StockKeeperShipmentShowProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const underway = HANDOFF_STATUSES.includes(shipment.status) && shipment.handoff;

    return (
        <>
            <Head title={`Shipment ${shipment.reference}`} />

            <Button
                component={Link}
                href={route("stock_keeper.shipments.index")}
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ mb: 2 }}
            >
                Back to queue
            </Button>

            <ShipmentCard sx={{ mb: 2.5 }}>
                <ShipmentRouteHeader shipment={shipment} />
                <LoadBar shipment={shipment} />
            </ShipmentCard>

            <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, lg: 7 }}>
                    {underway && shipment.handoff ? (
                        <HandoffPanel
                            shipmentId={shipment.id}
                            reference={shipment.reference}
                            handoff={shipment.handoff}
                            lines={shipment.items}
                            stepRoute="stock_keeper.shipments.step"
                            originName={shipment.origin.name}
                            destinationName={shipment.destination.name}
                        />
                    ) : (
                        <AgreementPanel shipment={shipment} agreeRoute="stock_keeper.shipments.agree" />
                    )}
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                    {underway ? (
                        <Box sx={{ mb: 2.5 }}>
                            <AgreementPanel shipment={shipment} agreeRoute="stock_keeper.shipments.agree" />
                        </Box>
                    ) : null}

                    <ShipmentCard sx={{ p: 0, overflow: "hidden", mb: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                            Manifest
                        </Typography>
                        <ManifestTable shipment={shipment} showPicked showCoverage />
                    </ShipmentCard>

                    <ShipmentCard>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                            Timeline
                        </Typography>
                        <ShipmentTimeline shipment={shipment} />
                    </ShipmentCard>
                </Grid>
            </Grid>

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

StockKeeperShipmentShow.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
