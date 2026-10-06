import { Head, Link } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import {
    Alert,
    Box,
    Chip,
    Container,
    IconButton,
    Paper,
    Snackbar,
    Stack,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import React from "react";

import HandoffPanel from "@/Components/Shipment/HandoffPanel";
import { AgreementPanel, ManifestTable, ShipmentStatusChip, ShipmentTimeline } from "@/Components/Shipment/shipmentUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { Shipment, SharedProps } from "@/types/shipment";

interface Props extends SharedProps {
    shipment: Shipment;
    /** True when this driver is carrying the run. */
    is_mine: boolean;
}

const AGREEING = ["draft", "pending_agreement"];

/**
 * One freight run, as the driver sees it.
 *
 * Before scheduling: the windows to agree to. After: the hand-off — watch the
 * origin prepare, start the trip, check and sign for the load, arrive.
 */
export default function DeliveryShipmentShow({ shipment, is_mine: isMine, flash }: Props): React.ReactElement {
    const theme = useTheme();
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const agreeing = AGREEING.includes(shipment.status);

    return (
        <>
            <Head title={`Run ${shipment.reference}`} />

            {/* Hero: the route, big enough to read at arm's length */}
            <Box
                sx={{
                    px: 2,
                    pt: 2,
                    pb: 3,
                    color: "primary.contrastText",
                    background: `linear-gradient(160deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                    borderBottomLeftRadius: 28,
                    borderBottomRightRadius: 28,
                }}
            >
                <Container maxWidth="sm" disableGutters>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                        <IconButton
                            component={Link}
                            href={route("delivery.shipments.index")}
                            sx={{ color: "inherit", bgcolor: alpha("#fff", 0.14) }}
                            aria-label="All runs"
                        >
                            <ArrowBackRoundedIcon />
                        </IconButton>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="overline" sx={{ opacity: 0.8, fontWeight: 800, lineHeight: 1 }}>
                                Freight run
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
                                {shipment.reference}
                            </Typography>
                        </Box>
                        <ShipmentStatusChip status={shipment.status} />
                    </Stack>

                    <Paper elevation={0} sx={{ p: 2, borderRadius: 4, bgcolor: alpha("#fff", 0.12), color: "inherit" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <WarehouseRoundedIcon />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="caption" sx={{ opacity: 0.75 }}>Pick up</Typography>
                                <Typography sx={{ fontWeight: 800 }} noWrap>{shipment.origin.name}</Typography>
                            </Box>
                        </Stack>
                        <ArrowDownwardRoundedIcon sx={{ opacity: 0.6, my: 0.5, ml: 0.25 }} fontSize="small" />
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <StorefrontRoundedIcon />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="caption" sx={{ opacity: 0.75 }}>Drop off</Typography>
                                <Typography sx={{ fontWeight: 800 }} noWrap>{shipment.destination.name}</Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                        <Chip
                            icon={<DirectionsCarRoundedIcon />}
                            label={shipment.vehicle_name ? `${shipment.vehicle_name} · ${shipment.vehicle_plate ?? ""}` : "Car not set"}
                            sx={{ bgcolor: alpha("#fff", 0.16), color: "inherit", fontWeight: 700, "& .MuiChip-icon": { color: "inherit" } }}
                        />
                        <Chip
                            icon={<Inventory2RoundedIcon />}
                            label={`${shipment.sku_count} lines · ${shipment.total_units} units`}
                            sx={{ bgcolor: alpha("#fff", 0.16), color: "inherit", fontWeight: 700, "& .MuiChip-icon": { color: "inherit" } }}
                        />
                    </Stack>
                </Container>
            </Box>

            <Container maxWidth="sm" sx={{ pt: 2.5, pb: 12 }}>
                <Stack spacing={2.5}>
                    {!agreeing && !isMine && shipment.courier ? (
                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                            {shipment.courier.name} is carrying this run.
                        </Alert>
                    ) : null}

                    {agreeing ? (
                        <AgreementPanel shipment={shipment} agreeRoute="delivery.shipments.agree" />
                    ) : shipment.handoff ? (
                        <HandoffPanel
                            shipmentId={shipment.id}
                            reference={shipment.reference}
                            handoff={shipment.handoff}
                            lines={shipment.items}
                            stepRoute="delivery.shipments.step"
                            originName={shipment.origin.name}
                            destinationName={shipment.destination.name}
                        />
                    ) : null}

                    <Paper elevation={0} sx={{ borderRadius: 4, border: 1, borderColor: "divider", overflow: "hidden", backgroundImage: "none" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                            Manifest
                        </Typography>
                        <ManifestTable shipment={shipment} showCoverage={false} />
                    </Paper>

                    <Paper elevation={0} sx={{ borderRadius: 4, border: 1, borderColor: "divider", p: 2.5, backgroundImage: "none" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                            Timeline
                        </Typography>
                        <ShipmentTimeline shipment={shipment} />
                    </Paper>
                </Stack>
            </Container>

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "top", horizontal: "center" }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

DeliveryShipmentShow.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
