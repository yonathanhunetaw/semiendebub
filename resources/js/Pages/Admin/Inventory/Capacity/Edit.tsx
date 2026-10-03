import AdminLayout from "@/Layouts/AppLayout";
import type { CapacityBand } from "@/types/capacity";
import { Head, Link, useForm } from "@inertiajs/react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import {
    Alert,
    Box,
    Button,
    Chip,
    Paper,
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

interface Props {
    variant: {
        id: number;
        product_name: string;
        sku: string | null;
        variant_label: string;
        store_name: string;
    };
    bands?: CapacityBand[];
    can_edit: boolean;
}

/**
 * The capacity band for one variant at every level it can be held at.
 *
 * One screen rather than four, because the four numbers are only meaningful
 * against each other: a shelf floor of 6 and a back-room floor of 60 describe a
 * replenishment chain, and editing them in separate places is how they end up
 * contradicting one another.
 *
 * Saving a row with a floor above zero enrols that level in automated
 * replenishment; clearing both numbers to zero withdraws it. Warehouse-class
 * rows are marked, because a shortfall between two warehouses is bulk freight
 * and is raised as a Shipment rather than as a Transfer.
 */
export default function CapacityEdit({ variant, bands = [], can_edit }: Props) {
    const { data, setData, patch, processing, errors, isDirty } = useForm<{
        bands: Array<{
            location_type: string;
            location_id: number;
            min_capacity: number;
            max_capacity: number;
        }>;
    }>({
        bands: bands.map((band) => ({
            location_type: band.location_type,
            location_id: band.location_id,
            min_capacity: band.min_capacity,
            max_capacity: band.max_capacity,
        })),
    });

    const update = (index: number, field: "min_capacity" | "max_capacity", value: string) => {
        const next = [...data.bands];
        next[index] = { ...next[index], [field]: Math.max(0, Number(value) || 0) };
        setData("bands", next);
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        patch(route("admin.inventory.capacity.update", variant.id), {
            preserveScroll: true,
        });
    };

    return (
        <>
            <Head title={`Capacity · ${variant.product_name}`} />

            <Box sx={{ p: { xs: 2, md: 3 } }} component="form" onSubmit={submit}>
                <Button
                    component={Link}
                    href={route("admin.inventory.capacity.index")}
                    startIcon={<ArrowBackIcon />}
                    size="small"
                    sx={{ mb: 2 }}
                >
                    All variants
                </Button>

                <Stack
                    direction={{ xs: "column", md: "row" }}
                    justifyContent="space-between"
                    alignItems={{ md: "center" }}
                    spacing={2}
                    sx={{ mb: 3 }}
                >
                    <Box>
                        <Typography variant="h5" fontWeight={800}>
                            {variant.product_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {variant.variant_label}
                            {variant.sku ? ` · ${variant.sku}` : ""} · {variant.store_name}
                        </Typography>
                    </Box>

                    <Button
                        type="submit"
                        variant="contained"
                        startIcon={<SaveIcon />}
                        disabled={!can_edit || processing || !isDirty}
                    >
                        Save capacity
                    </Button>
                </Stack>

                {!can_edit && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        You can see these bands but not change them. Capacity drives
                        automated replenishment, so it is set by this facility&rsquo;s
                        managers or an admin.
                    </Alert>
                )}

                {typeof errors.bands === "string" && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {errors.bands}
                    </Alert>
                )}

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Level</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell align="right">On hand</TableCell>
                                <TableCell align="right" sx={{ width: 140 }}>
                                    Min capacity
                                </TableCell>
                                <TableCell align="right" sx={{ width: 140 }}>
                                    Max capacity
                                </TableCell>
                                <TableCell align="center">State</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {bands.map((band, index) => {
                                const row = data.bands[index];
                                const minError = errors[`bands.${index}.min_capacity` as keyof typeof errors];
                                const maxError = errors[`bands.${index}.max_capacity` as keyof typeof errors];

                                return (
                                    <TableRow key={`${band.location_type}#${band.location_id}`} hover>
                                        <TableCell sx={{ fontWeight: 600 }}>
                                            {band.level_label}
                                            {band.is_structural && (
                                                <Tooltip title="Warehouse-class node. A shortfall filled from another warehouse is bulk freight and is raised as a Shipment, not a Transfer.">
                                                    <Chip
                                                        size="small"
                                                        label="Freight"
                                                        sx={{ ml: 1 }}
                                                        variant="outlined"
                                                    />
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell>{band.name}</TableCell>
                                        <TableCell align="right" sx={{ fontFamily: "monospace" }}>
                                            {band.on_hand}
                                        </TableCell>
                                        <TableCell align="right">
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={row?.min_capacity ?? 0}
                                                disabled={!can_edit}
                                                error={Boolean(minError)}
                                                helperText={minError as string | undefined}
                                                onChange={(event) =>
                                                    update(index, "min_capacity", event.target.value)
                                                }
                                                inputProps={{ min: 0, style: { textAlign: "right" } }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={row?.max_capacity ?? 0}
                                                disabled={!can_edit}
                                                error={Boolean(maxError)}
                                                helperText={maxError as string | undefined}
                                                onChange={(event) =>
                                                    update(index, "max_capacity", event.target.value)
                                                }
                                                inputProps={{ min: 0, style: { textAlign: "right" } }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {!band.monitored ? (
                                                <Chip size="small" label="Not monitored" />
                                            ) : band.breached ? (
                                                <Chip
                                                    size="small"
                                                    color="warning"
                                                    label={`Short ${band.shortfall}`}
                                                />
                                            ) : (
                                                <Chip size="small" color="success" label="Within band" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {bands.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            This variant&rsquo;s store has no stock-bearing
                                            locations yet.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
                    A minimum of zero means the level is not monitored. When stock reaches the
                    minimum, a replenishment transfer is proposed up to the maximum — and held
                    for a store manager&rsquo;s approval before it reaches the floor.
                </Typography>
            </Box>
        </>
    );
}

CapacityEdit.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
