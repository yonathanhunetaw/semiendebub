import { Head, Link, router, useForm } from "@inertiajs/react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    MenuItem,
    Grid,
    IconButton,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

import { CancelDialog } from "@/Pages/Admin/Inventory/Shipments/index";
import HandoffPanel from "@/Components/Shipment/HandoffPanel";
import {
    AgreementPanel,
    LoadBar,
    ManifestTable,
    ShipmentCard,
    ShipmentRouteHeader,
    ShipmentTimeline,
    TransitionBar,
} from "@/Components/Shipment/shipmentUi";
import AdminLayout from "@/Layouts/AdminLayout";
import type { AdminShipmentShowProps, Shipment } from "@/types/shipment";

/**
 * Manifest builder and full stage control for one shipment.
 */
export default function AdminShipmentShow({
    shipment,
    variants,
    vehicle_options = [],
    courier_options = [],
    flash,
}: AdminShipmentShowProps): React.ReactElement {
    const [cancelling, setCancelling] = React.useState<Shipment | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    // Matches ShipmentWorkflowService::MANIFEST_OPEN_STATES.
    const manifestOpen = ["draft", "pending_agreement", "scheduled"].includes(shipment.status);

    return (
        <>
            <Head title={`Shipment ${shipment.reference}`} />

            <Button
                component={Link}
                href={route("admin.inventory.shipments.index")}
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
                            transitionRoute="admin.inventory.shipments.transition"
                            onCancelRequested={setCancelling}
                        />
                        {shipment.cancel_reason ? (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {shipment.cancel_reason}
                            </Alert>
                        ) : null}
                    </ShipmentCard>

                    {/* After the four agree: pick → prepare → driver signs →
                        arrives → receiver signs. Admin can take any step. */}
                    {shipment.handoff && !["draft", "pending_agreement", "cancelled"].includes(shipment.status) ? (
                        <Box sx={{ mb: 2.5 }}>
                            <HandoffPanel
                                shipmentId={shipment.id}
                                reference={shipment.reference}
                                handoff={shipment.handoff}
                                lines={shipment.items}
                                stepRoute="admin.inventory.shipments.step"
                                originName={shipment.origin.name}
                                destinationName={shipment.destination.name}
                            />
                        </Box>
                    ) : null}

                    <ShipmentCard sx={{ mb: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
                            Fleet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            The car the run goes in and the drivers it is offered to. Only those drivers see it in
                            Delivery and may agree to a window. Once the driver and both docks agree, the run is
                            scheduled; the origin's handover to the driver dispatches it.
                        </Typography>
                        <FleetForm
                            shipment={shipment}
                            vehicles={vehicle_options}
                            couriers={courier_options}
                            disabled={!manifestOpen}
                        />
                    </ShipmentCard>

                    {manifestOpen ? (
                        <ShipmentCard sx={{ mb: 2.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                                Add to manifest
                            </Typography>
                            <AddLineForm shipment={shipment} variants={variants} />
                        </ShipmentCard>
                    ) : null}

                    <ShipmentCard sx={{ p: 0, overflow: "hidden" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2.5, pb: 1 }}>
                            Manifest
                        </Typography>
                        <ManifestTable shipment={shipment} showPicked showCoverage />

                        {manifestOpen && shipment.items.length > 0 ? (
                            <Stack sx={{ p: 2 }} spacing={1}>
                                {shipment.items.map((line) => (
                                    <Stack
                                        key={line.id}
                                        direction="row"
                                        alignItems="center"
                                        justifyContent="space-between"
                                    >
                                        <Typography variant="caption" color="text.secondary">
                                            {line.name} · {line.quantity}
                                        </Typography>
                                        <Tooltip title="Remove line">
                                            <IconButton
                                                size="small"
                                                onClick={() =>
                                                    router.delete(
                                                        route("admin.inventory.shipments.items.destroy", [
                                                            shipment.id,
                                                            line.variant_id,
                                                        ]),
                                                        { preserveScroll: true },
                                                    )
                                                }
                                            >
                                                <DeleteRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                ))}
                            </Stack>
                        ) : null}
                    </ShipmentCard>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
                    {/* Admin is all four parties, so this is both the oversight
                        view of who is holding the run up and the place to
                        unblock it on their behalf. */}
                    <Box sx={{ mb: 2.5 }}>
                        <AgreementPanel
                            shipment={shipment}
                            agreeRoute="admin.inventory.shipments.agree"
                        />
                    </Box>

                    <ShipmentCard>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                            Timeline
                        </Typography>
                        <ShipmentTimeline shipment={shipment} />
                    </ShipmentCard>
                </Grid>
            </Grid>

            <CancelDialog
                shipment={cancelling}
                onClose={() => setCancelling(null)}
                transitionRoute="admin.inventory.shipments.transition"
            />

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

function FleetForm({
    shipment,
    vehicles,
    couriers,
    disabled,
}: {
    shipment: Shipment;
    vehicles: NonNullable<AdminShipmentShowProps["vehicle_options"]>;
    couriers: NonNullable<AdminShipmentShowProps["courier_options"]>;
    disabled: boolean;
}): React.ReactElement {
    const { data, setData, patch, processing, errors } = useForm({
        vehicle_id: (shipment.fleet?.vehicle_id ?? "") as number | "",
        courier_ids: shipment.fleet?.eligible_courier_ids ?? [],
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        patch(route("admin.inventory.shipments.fleet", shipment.id), { preserveScroll: true });
    };

    return (
        <form onSubmit={submit}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                        select fullWidth size="small" label="Car"
                        value={data.vehicle_id}
                        disabled={disabled}
                        onChange={(e) => setData("vehicle_id", e.target.value === "" ? "" : Number(e.target.value))}
                        error={Boolean(errors.vehicle_id)}
                        helperText={errors.vehicle_id ?? (vehicles.length === 0 ? "Add cars under Inventory → Fleet." : undefined)}
                    >
                        <MenuItem value="">No car yet</MenuItem>
                        {vehicles.map((v) => (
                            <MenuItem key={v.id} value={v.id}>
                                {v.name} · {v.plate} · {v.max_cbm} CBM{v.status !== "active" ? " (retired)" : ""}
                            </MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Autocomplete
                        multiple
                        size="small"
                        disabled={disabled}
                        options={couriers}
                        getOptionLabel={(o) => o.name}
                        value={couriers.filter((c) => data.courier_ids.includes(c.id))}
                        onChange={(_e, value) => setData("courier_ids", value.map((c) => c.id))}
                        renderTags={(value, getTagProps) =>
                            value.map((c, index) => (
                                <Chip size="small" label={c.name} {...getTagProps({ index })} key={c.id} />
                            ))
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Drivers offered"
                                placeholder={data.courier_ids.length === 0 ? "Open to every driver" : undefined}
                                error={Boolean(errors.courier_ids)}
                                helperText={errors.courier_ids}
                            />
                        )}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 2 }}>
                    <Button type="submit" variant="contained" fullWidth disabled={processing || disabled}>
                        Save
                    </Button>
                </Grid>
            </Grid>
        </form>
    );
}

function AddLineForm({
    shipment,
    variants,
}: {
    shipment: Shipment;
    variants: AdminShipmentShowProps["variants"];
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm({
        item_variant_id: "" as number | "",
        quantity: 1,
        cbm: "",
        weight_kg: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("admin.inventory.shipments.items.store", shipment.id), {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    };

    return (
        <form onSubmit={submit}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Autocomplete
                        options={variants}
                        getOptionLabel={(o) => o.label}
                        onChange={(_e, value) => setData("item_variant_id", value ? value.id : "")}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="SKU"
                                size="small"
                                error={Boolean(errors.item_variant_id)}
                                helperText={errors.item_variant_id}
                            />
                        )}
                    />
                </Grid>
                <Grid size={{ xs: 4, md: 2 }}>
                    <TextField
                        fullWidth size="small" type="number" label="Qty"
                        value={data.quantity}
                        onChange={(e) => setData("quantity", Number(e.target.value))}
                        error={Boolean(errors.quantity)}
                        helperText={errors.quantity}
                    />
                </Grid>
                <Grid size={{ xs: 4, md: 2 }}>
                    <TextField
                        fullWidth size="small" type="number" label="CBM"
                        value={data.cbm}
                        onChange={(e) => setData("cbm", e.target.value)}
                    />
                </Grid>
                <Grid size={{ xs: 4, md: 2 }}>
                    <TextField
                        fullWidth size="small" type="number" label="Kg"
                        value={data.weight_kg}
                        onChange={(e) => setData("weight_kg", e.target.value)}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 1 }}>
                    <Button type="submit" variant="contained" fullWidth disabled={processing}>
                        Add
                    </Button>
                </Grid>
            </Grid>
        </form>
    );
}

AdminShipmentShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
