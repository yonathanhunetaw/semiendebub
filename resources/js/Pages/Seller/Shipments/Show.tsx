import { Head, Link, useForm } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
    Alert,
    Autocomplete,
    Button,
    Grid,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    LoadBar,
    ManifestTable,
    ShipmentCard,
    ShipmentRouteHeader,
    ShipmentTimeline,
    TransitionBar,
} from "@/Components/Shipment/shipmentUi";
import SellerLayout from "@/Layouts/SellerLayout";
import type { SellerShipmentShowProps } from "@/types/shipment";

/**
 * One shipment from the seller's side: what is coming, where it is, and the
 * button that puts it on their books.
 */
export default function SellerShipmentShow({
    shipment,
    variants,
    flash,
}: SellerShipmentShowProps): React.ReactElement {
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    const manifestOpen = shipment.status === "draft" || shipment.status === "scheduled";

    return (
        <>
            <Head title={`Shipment ${shipment.reference}`} />

            <div className="px-3.5 pt-3 pb-24">
                <Button
                    component={Link}
                    href={route("seller.shipments.index")}
                    startIcon={<ArrowBackRoundedIcon />}
                    sx={{ mb: 2 }}
                >
                    All shipments
                </Button>

                <Grid container spacing={2.5}>
                    <Grid size={{ xs: 12, lg: 8 }}>
                        <ShipmentCard sx={{ mb: 2.5 }}>
                            <ShipmentRouteHeader shipment={shipment} />
                            <LoadBar shipment={shipment} />
                            <TransitionBar
                                shipment={shipment}
                                transitionRoute="seller.shipments.transition"
                            />
                            {shipment.status === "delivered" ? (
                                <Alert severity="info" sx={{ mt: 2 }}>
                                    Confirming receipt adds these units to your store's stock.
                                </Alert>
                            ) : null}
                            {shipment.cancel_reason ? (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {shipment.cancel_reason}
                                </Alert>
                            ) : null}
                        </ShipmentCard>

                        {manifestOpen ? (
                            <ShipmentCard sx={{ mb: 2.5 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                                    Request more SKUs
                                </Typography>
                                <AddLineForm shipmentId={shipment.id} variants={variants} />
                            </ShipmentCard>
                        ) : null}

                        <ShipmentCard sx={{ p: 0, overflow: "hidden" }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                                Manifest
                            </Typography>
                            <ManifestTable
                                shipment={shipment}
                                showPicked={shipment.status !== "draft"}
                                showCoverage={false}
                            />
                        </ShipmentCard>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 4 }}>
                        <ShipmentCard>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                                Timeline
                            </Typography>
                            <ShipmentTimeline shipment={shipment} />

                            {shipment.courier ? (
                                <Stack sx={{ mt: 2.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Courier
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {shipment.courier.name}
                                    </Typography>
                                    {shipment.courier.phone ? (
                                        <Typography
                                            component="a"
                                            href={`tel:${shipment.courier.phone}`}
                                            variant="body2"
                                            sx={{ color: "primary.main", textDecoration: "none" }}
                                        >
                                            {shipment.courier.phone}
                                        </Typography>
                                    ) : null}
                                </Stack>
                            ) : null}
                        </ShipmentCard>
                    </Grid>
                </Grid>
            </div>

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

function AddLineForm({
    shipmentId,
    variants,
}: {
    shipmentId: number;
    variants: SellerShipmentShowProps["variants"];
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm({
        item_variant_id: "" as number | "",
        quantity: 1,
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("seller.shipments.items.store", shipmentId), {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    };

    return (
        <form onSubmit={submit}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Autocomplete
                        options={variants}
                        getOptionLabel={(o) => o.label}
                        onChange={(_e, value) => setData("item_variant_id", value ? value.id : "")}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                size="small"
                                label="SKU"
                                error={Boolean(errors.item_variant_id)}
                                helperText={errors.item_variant_id}
                            />
                        )}
                    />
                </Grid>
                <Grid size={{ xs: 8, md: 3 }}>
                    <TextField
                        fullWidth size="small" type="number" label="Quantity"
                        value={data.quantity}
                        onChange={(e) => setData("quantity", Number(e.target.value))}
                        error={Boolean(errors.quantity)}
                        helperText={errors.quantity}
                    />
                </Grid>
                <Grid size={{ xs: 4, md: 2 }}>
                    <Button type="submit" variant="contained" fullWidth disabled={processing}>
                        Add
                    </Button>
                </Grid>
            </Grid>
        </form>
    );
}

SellerShipmentShow.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
