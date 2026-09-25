import { Head, Link, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    MenuItem,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    LoadBar,
    ShipmentCard,
    ShipmentRouteHeader,
    TransitionBar,
    formatMoment,
} from "@/Components/Shipment/shipmentUi";
import AdminLayout from "@/Layouts/AdminLayout";
import type { AdminShipmentIndexProps, Shipment } from "@/types/shipment";

const STATUS_TABS = [
    "all", "open", "draft", "scheduled", "picking", "ready",
    "dispatched", "in_transit", "delivered", "received", "cancelled",
] as const;

/**
 * The admin shipment board — every run, at every stage, across all stores.
 */
export default function AdminShipments({
    shipments,
    counts,
    filters,
    stores,
    pagination,
    flash,
}: AdminShipmentIndexProps): React.ReactElement {
    const [createOpen, setCreateOpen] = React.useState(false);
    const [cancelling, setCancelling] = React.useState<Shipment | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    return (
        <>
            <Head title="Shipments" />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ sm: "center" }}
                spacing={2}
                sx={{ mb: 3 }}
            >
                <div>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        Shipments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Inter-store freight across every stage and every role.
                    </Typography>
                </div>
                <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => setCreateOpen(true)}
                >
                    New shipment
                </Button>
            </Stack>

            <ShipmentCard sx={{ p: 2, mb: 2.5 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {STATUS_TABS.map((tab) => (
                        <Chip
                            key={tab}
                            label={`${tab.replace("_", " ")}${counts[tab] !== undefined ? ` (${counts[tab]})` : ""}`}
                            onClick={() =>
                                router.get(
                                    route("admin.inventory.shipments.index"),
                                    tab === "all" ? {} : { status: tab },
                                    { preserveState: true, preserveScroll: true, replace: true },
                                )
                            }
                            color={filters.status === tab ? "primary" : "default"}
                            variant={filters.status === tab ? "filled" : "outlined"}
                            sx={{ fontWeight: 700, textTransform: "capitalize" }}
                        />
                    ))}
                </Stack>
            </ShipmentCard>

            {shipments.length === 0 ? (
                <ShipmentCard sx={{ textAlign: "center", py: 6 }}>
                    <LocalShippingRoundedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
                        No shipments in this view
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Raise one to move stock between stores.
                    </Typography>
                </ShipmentCard>
            ) : (
                <Stack spacing={2}>
                    {shipments.map((shipment) => (
                        <ShipmentCard key={shipment.id}>
                            <ShipmentRouteHeader shipment={shipment} />
                            <LoadBar shipment={shipment} />

                            <Stack
                                direction="row"
                                spacing={2}
                                sx={{ mt: 1.5 }}
                                flexWrap="wrap"
                                useFlexGap
                            >
                                <Typography variant="caption" color="text.secondary">
                                    Scheduled {formatMoment(shipment.scheduled_for)}
                                </Typography>
                                {shipment.courier ? (
                                    <Typography variant="caption" color="text.secondary">
                                        Courier: {shipment.courier.name}
                                    </Typography>
                                ) : null}
                                {shipment.created_by ? (
                                    <Typography variant="caption" color="text.secondary">
                                        By {shipment.created_by}
                                    </Typography>
                                ) : null}
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                <TransitionBar
                                    shipment={shipment}
                                    transitionRoute="admin.inventory.shipments.transition"
                                    onCancelRequested={setCancelling}
                                />
                                <Button
                                    component={Link}
                                    href={route("admin.inventory.shipments.show", shipment.id)}
                                    size="small"
                                    sx={{ mt: 1.5 }}
                                >
                                    Open
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
                            router.get(route("admin.inventory.shipments.index"), {
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
                            router.get(route("admin.inventory.shipments.index"), {
                                ...filters,
                                page: pagination.current_page + 1,
                            })
                        }
                    >
                        Next
                    </Button>
                </Stack>
            ) : null}

            <CreateShipmentDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                stores={stores}
            />
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

function CreateShipmentDialog({
    open,
    onClose,
    stores,
}: {
    open: boolean;
    onClose: () => void;
    stores: AdminShipmentIndexProps["stores"];
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm({
        origin_store_id: "",
        destination_store_id: "",
        vehicle_name: "",
        vehicle_plate: "",
        vehicle_max_cbm: "",
        scheduled_for: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("admin.inventory.shipments.store"), {
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>New shipment</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                        <Grid size={6}>
                            <TextField
                                select fullWidth label="Origin"
                                value={data.origin_store_id}
                                onChange={(e) => setData("origin_store_id", e.target.value)}
                                error={Boolean(errors.origin_store_id)}
                                helperText={errors.origin_store_id}
                            >
                                {stores.map((s) => (
                                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                select fullWidth label="Destination"
                                value={data.destination_store_id}
                                onChange={(e) => setData("destination_store_id", e.target.value)}
                                error={Boolean(errors.destination_store_id)}
                                helperText={errors.destination_store_id}
                            >
                                {stores.map((s) => (
                                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                fullWidth label="Vehicle"
                                value={data.vehicle_name}
                                onChange={(e) => setData("vehicle_name", e.target.value)}
                            />
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                fullWidth label="Plate"
                                value={data.vehicle_plate}
                                onChange={(e) => setData("vehicle_plate", e.target.value)}
                            />
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                fullWidth type="number" label="Vehicle max CBM"
                                value={data.vehicle_max_cbm}
                                onChange={(e) => setData("vehicle_max_cbm", e.target.value)}
                            />
                        </Grid>
                        <Grid size={6}>
                            <TextField
                                fullWidth type="datetime-local" label="Scheduled for"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={data.scheduled_for}
                                onChange={(e) => setData("scheduled_for", e.target.value)}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        Create
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

/** Cancelling always demands a reason, so it gets its own prompt. */
export function CancelDialog({
    shipment,
    onClose,
    transitionRoute,
}: {
    shipment: Shipment | null;
    onClose: () => void;
    transitionRoute: string;
}): React.ReactElement {
    const { data, setData, patch, processing, errors, reset } = useForm({
        status: "cancelled",
        cancel_reason: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        if (!shipment) return;

        patch(route(transitionRoute, shipment.id), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={shipment !== null} onClose={onClose} fullWidth maxWidth="xs">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>Cancel shipment</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {shipment?.reference}. Stock already dispatched returns to the origin.
                    </Typography>
                    <TextField
                        autoFocus fullWidth multiline rows={3}
                        label="Reason"
                        value={data.cancel_reason}
                        onChange={(e) => setData("cancel_reason", e.target.value)}
                        error={Boolean(errors.cancel_reason)}
                        helperText={errors.cancel_reason}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Keep it</Button>
                    <Button type="submit" variant="contained" color="error" disabled={processing}>
                        Cancel shipment
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

AdminShipments.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
