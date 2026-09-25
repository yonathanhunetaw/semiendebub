import { Head, Link, useForm } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
    Alert,
    Button,
    Grid,
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    LoadBar,
    ShipmentCard,
    ShipmentRouteHeader,
    ShipmentTimeline,
    TransitionBar,
} from "@/Components/Shipment/shipmentUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperShipmentShowProps } from "@/types/shipment";

/**
 * The pick list.
 *
 * The picker enters what they actually found; a shortfall is recorded rather
 * than hidden, and only the picked quantity is what physically moves.
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

    const pickable = shipment.status === "scheduled" || shipment.status === "picking";

    const { data, setData, post, processing } = useForm<{ picked: Record<number, number> }>({
        picked: shipment.items.reduce<Record<number, number>>((acc, line) => {
            // Default to the full ask, or whatever was already recorded.
            acc[line.variant_id] = line.picked_quantity || line.quantity;
            return acc;
        }, {}),
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("stock_keeper.shipments.pick", shipment.id), { preserveScroll: true });
    };

    return (
        <>
            <Head title={`Pick ${shipment.reference}`} />

            <Button
                component={Link}
                href={route("stock_keeper.shipments.index")}
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ mb: 2 }}
            >
                Back to queue
            </Button>

            <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, lg: 8 }}>
                    <ShipmentCard sx={{ mb: 2.5 }}>
                        <ShipmentRouteHeader shipment={shipment} />
                        <LoadBar shipment={shipment} />
                        <TransitionBar
                            shipment={shipment}
                            transitionRoute="stock_keeper.shipments.transition"
                        />
                    </ShipmentCard>

                    <ShipmentCard sx={{ p: 0, overflow: "hidden" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                            Pick list
                        </Typography>

                        <form onSubmit={submit}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Product</TableCell>
                                        <TableCell>Location</TableCell>
                                        <TableCell align="right">Asked</TableCell>
                                        <TableCell align="right">At origin</TableCell>
                                        <TableCell align="right">Picked</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {shipment.items.map((line) => (
                                        <TableRow key={line.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {line.name}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ fontFamily: "monospace" }}
                                                    color="text.secondary"
                                                >
                                                    {line.sku ?? "—"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{line.location ?? "—"}</TableCell>
                                            <TableCell align="right">{line.quantity}</TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontWeight: 700,
                                                        color:
                                                            line.coverage === "ok"
                                                                ? "success.main"
                                                                : line.coverage === "low"
                                                                  ? "warning.main"
                                                                  : "error.main",
                                                    }}
                                                >
                                                    {line.stock_qty}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ width: 110 }}>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    disabled={!pickable}
                                                    value={data.picked[line.variant_id] ?? 0}
                                                    onChange={(e) =>
                                                        setData("picked", {
                                                            ...data.picked,
                                                            [line.variant_id]: Number(e.target.value),
                                                        })
                                                    }
                                                    slotProps={{
                                                        htmlInput: { min: 0, max: line.quantity },
                                                    }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {pickable ? (
                                <Stack sx={{ p: 2.5 }} direction="row" justifyContent="flex-end">
                                    <Button type="submit" variant="contained" disabled={processing}>
                                        Record pick
                                    </Button>
                                </Stack>
                            ) : null}
                        </form>
                    </ShipmentCard>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
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
