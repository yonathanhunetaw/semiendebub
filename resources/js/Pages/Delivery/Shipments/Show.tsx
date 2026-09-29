import { Head, Link, router } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Alert, Box, Button, Container, Stack, Typography } from "@mui/material";
import React from "react";

import {
    AgreementPanel,
    LoadBar,
    ManifestTable,
    ShipmentCard,
    ShipmentRouteHeader,
    ShipmentTimeline,
    TransitionBar,
} from "@/Components/Shipment/shipmentUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { Shipment, SharedProps } from "@/types/shipment";

interface Props extends SharedProps {
    shipment: Shipment;
    /** Only the assigned courier may drive the run. */
    is_mine: boolean;
}

/**
 * One freight run, as the courier sees it: the load, the route, and the
 * actions the server says they may take.
 */
export default function DeliveryShipmentShow({
    shipment,
    is_mine: isMine,
    flash,
}: Props): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    return (
        <>
            <Head title={`Run ${shipment.reference}`} />

            <Container sx={{ pt: 3, pb: 10 }}>
                <Button
                    component={Link}
                    href={route("delivery.shipments.index")}
                    startIcon={<ArrowBackRoundedIcon />}
                    sx={{ mb: 2 }}
                >
                    All runs
                </Button>

                {notice ? (
                    <Alert severity={flash?.error ? "error" : "success"} sx={{ mb: 2 }}>
                        {notice}
                    </Alert>
                ) : null}

                <ShipmentCard sx={{ mb: 2.5 }}>
                    <ShipmentRouteHeader shipment={shipment} />
                    <LoadBar shipment={shipment} />

                    {isMine ? (
                        <TransitionBar
                            shipment={shipment}
                            transitionRoute="delivery.shipments.transition"
                        />
                    ) : shipment.courier === null ? (
                        <Button
                            variant="contained"
                            size="small"
                            fullWidth
                            sx={{ mt: 1.5 }}
                            onClick={() =>
                                router.post(
                                    route("delivery.shipments.claim", shipment.id),
                                    {},
                                    { preserveScroll: true },
                                )
                            }
                        >
                            Claim this run
                        </Button>
                    ) : (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Assigned to {shipment.courier.name}.
                        </Alert>
                    )}
                </ShipmentCard>

                {/* The window the driver is being asked to agree to, above the
                    load — a courier decides whether they can make the time
                    before they care what is on the truck. */}
                <Box sx={{ mb: 2.5 }}>
                    <AgreementPanel shipment={shipment} agreeRoute="delivery.shipments.agree" />
                </Box>

                <ShipmentCard sx={{ p: 0, overflow: "hidden", mb: 2.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                        Manifest
                    </Typography>
                    <ManifestTable shipment={shipment} showCoverage={false} />
                </ShipmentCard>

                <ShipmentCard>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                        Timeline
                    </Typography>
                    <ShipmentTimeline shipment={shipment} />
                </ShipmentCard>
            </Container>
        </>
    );
}

DeliveryShipmentShow.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
