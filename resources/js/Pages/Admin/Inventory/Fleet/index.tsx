import { Head, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

import AdminLayout from "@/Layouts/AdminLayout";
import type { SharedProps } from "@/types/shipment";

/** One car in the fleet. */
interface Vehicle {
    id: number;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
    status: "active" | "inactive";
    notes: string | null;
    /** Runs not yet received or cancelled that use this car. */
    open_runs: number;
}

interface Props extends SharedProps {
    vehicles: Vehicle[];
}

/**
 * The cars a shipment can be carried in. A shipment's creator picks one of
 * these on the Fleet step, along with the drivers the run is offered to.
 */
export default function FleetIndex({ vehicles = [], flash }: Props): React.ReactElement {
    const [editing, setEditing] = React.useState<Vehicle | "new" | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    return (
        <>
            <Head title="Fleet" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Box>
                    <Typography variant="h5" fontWeight={800}>Fleet</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Cars a shipment can be carried in. Retire a car to stop it being offered.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditing("new")}>
                    Add car
                </Button>
            </Stack>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Car</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Plate</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Capacity</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Payload</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Open runs</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {vehicles.map((v) => (
                            <TableRow key={v.id} hover>
                                <TableCell sx={{ fontWeight: 700 }}>{v.name}</TableCell>
                                <TableCell sx={{ fontFamily: "monospace" }}>{v.plate}</TableCell>
                                <TableCell>{v.max_cbm} CBM</TableCell>
                                <TableCell>{v.payload_kg ? `${v.payload_kg.toLocaleString()} kg` : "—"}</TableCell>
                                <TableCell>{v.open_runs}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={v.status === "active" ? "Active" : "Retired"}
                                        color={v.status === "active" ? "success" : "default"}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => setEditing(v)}>
                                            <EditRoundedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={v.open_runs > 0 ? "On an open run — retire it instead" : "Remove"}>
                                        <span>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                disabled={v.open_runs > 0}
                                                onClick={() =>
                                                    router.delete(route("admin.inventory.fleet.destroy", v.id), {
                                                        preserveScroll: true,
                                                    })
                                                }
                                            >
                                                <DeleteRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {vehicles.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">
                                        No cars yet. Add one so shipments can pick it.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {editing !== null && (
                <VehicleDialog vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
            )}

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

function VehicleDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }): React.ReactElement {
    const { data, setData, post, put, processing, errors } = useForm({
        name: vehicle?.name ?? "",
        plate: vehicle?.plate ?? "",
        max_cbm: vehicle?.max_cbm ?? 0,
        payload_kg: vehicle?.payload_kg ?? 0,
        status: vehicle?.status ?? "active",
        notes: vehicle?.notes ?? "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (vehicle) {
            put(route("admin.inventory.fleet.update", vehicle.id), options);
        } else {
            post(route("admin.inventory.fleet.store"), options);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm">
            <form onSubmit={submit}>
                <DialogTitle>{vehicle ? `Edit ${vehicle.plate}` : "Add car"}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 1 }}>
                        <Grid size={{ xs: 12, sm: 7 }}>
                            <TextField fullWidth size="small" label="Car" placeholder="Isuzu NPR"
                                value={data.name} onChange={(e) => setData("name", e.target.value)}
                                error={Boolean(errors.name)} helperText={errors.name} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 5 }}>
                            <TextField fullWidth size="small" label="Plate"
                                value={data.plate} onChange={(e) => setData("plate", e.target.value)}
                                error={Boolean(errors.plate)} helperText={errors.plate} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField fullWidth size="small" type="number" label="Capacity (CBM)"
                                value={data.max_cbm} onChange={(e) => setData("max_cbm", Number(e.target.value))}
                                error={Boolean(errors.max_cbm)} helperText={errors.max_cbm} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField fullWidth size="small" type="number" label="Payload (kg)"
                                value={data.payload_kg} onChange={(e) => setData("payload_kg", Number(e.target.value))}
                                error={Boolean(errors.payload_kg)} helperText={errors.payload_kg} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField fullWidth size="small" select label="Status"
                                value={data.status} onChange={(e) => setData("status", e.target.value as Vehicle["status"])}>
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="inactive">Retired</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={12}>
                            <TextField fullWidth size="small" multiline minRows={2} label="Notes"
                                value={data.notes} onChange={(e) => setData("notes", e.target.value)} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        {vehicle ? "Save" : "Add"}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

FleetIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
