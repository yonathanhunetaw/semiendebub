import AdminLayout from "@/Layouts/AppLayout";
import type { StockLocation, VariantOption } from "@/types/stockkeeper";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Autocomplete,
    Box,
    Button,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

interface Props {
    locations?: StockLocation[];
    variants?: VariantOption[];
    couriers?: Array<{ id: number; name: string }>;
}

const KIND_LABEL: Record<string, string> = {
    store: "whole store",
    shelf: "shelf",
    backroom: "store floor",
    remote_hub: "remote hub",
    main_hub: "main hub",
};

const pairOf = (location: StockLocation): string => `${location.type}#${location.id}`;

/**
 * Raise a transfer between any two places in the location tree. Between two
 * sites a courier carries it — pick one now or let Delivery claim it. Stock
 * leaving a Main Hub is a shipment, and the form says so if one is chosen.
 */
export default function TransferCreate({ locations = [], variants = [], couriers = [] }: Props): React.ReactElement {
    const { data, setData, post, processing, errors, transform } = useForm<{
        item_variant_id: number | "";
        from: string;
        to: string;
        quantity: number | "";
        courier_id: number | "";
        notes: string;
    }>({ item_variant_id: "", from: "", to: "", quantity: 1, courier_id: "", notes: "" });

    transform((form) => {
        const [sourceType, sourceId] = form.from.split("#");
        const [destinationType, destinationId] = form.to.split("#");

        return {
            item_variant_id: form.item_variant_id,
            quantity: form.quantity,
            notes: form.notes,
            courier_id: form.courier_id === "" ? null : form.courier_id,
            source_location_type: sourceType || null,
            source_location_id: sourceId ? Number(sourceId) : null,
            destination_location_type: destinationType || null,
            destination_location_id: destinationId ? Number(destinationId) : null,
        };
    });

    const serverErrors = errors as Record<string, string | undefined>;
    const label = (location: StockLocation): string => `${location.name} · ${KIND_LABEL[location.kind] ?? location.kind}`;

    return (
        <>
            <Head title="New transfer" />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
                    New transfer
                </Typography>
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                    <Stack
                        component="form"
                        spacing={2.5}
                        onSubmit={(event: React.FormEvent) => {
                            event.preventDefault();
                            post(route("admin.inventory.transfers.store"));
                        }}
                    >
                        <Autocomplete
                            options={variants}
                            getOptionLabel={(option) => option.label}
                            onChange={(_event, value) => setData("item_variant_id", value ? value.id : "")}
                            renderInput={(params) => (
                                <TextField {...params} label="Product variant" error={Boolean(errors.item_variant_id)} helperText={errors.item_variant_id} />
                            )}
                        />
                        <TextField
                            select
                            label="From"
                            value={data.from}
                            onChange={(event) => setData("from", event.target.value)}
                            error={Boolean(serverErrors.source_location_id ?? serverErrors.to_store_id)}
                            helperText={serverErrors.source_location_id ?? serverErrors.to_store_id ?? "Main Hubs send stock as shipments, not transfers."}
                        >
                            {locations.map((location) => (
                                <MenuItem key={pairOf(location)} value={pairOf(location)}>
                                    {label(location)} ({location.units.toLocaleString()} units)
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="To"
                            value={data.to}
                            onChange={(event) => setData("to", event.target.value)}
                            error={Boolean(serverErrors.destination_location_id)}
                            helperText={serverErrors.destination_location_id}
                        >
                            {locations.map((location) => (
                                <MenuItem key={pairOf(location)} value={pairOf(location)}>
                                    {label(location)}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            type="number"
                            label="Quantity"
                            value={data.quantity}
                            onChange={(event) => setData("quantity", event.target.value === "" ? "" : Number(event.target.value))}
                            error={Boolean(errors.quantity)}
                            helperText={errors.quantity ?? "In the variant's own unit."}
                            slotProps={{ htmlInput: { min: 1 } }}
                        />
                        <TextField
                            select
                            label="Courier (between two sites)"
                            value={data.courier_id}
                            onChange={(event) => setData("courier_id", event.target.value === "" ? "" : Number(event.target.value))}
                            helperText="Leave empty to let a courier claim it from Delivery → Transfers."
                        >
                            <MenuItem value="">No courier yet</MenuItem>
                            {couriers.map((courier) => (
                                <MenuItem key={courier.id} value={courier.id}>
                                    {courier.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField label="Notes" value={data.notes} onChange={(event) => setData("notes", event.target.value)} multiline rows={2} />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button component={Link} href={route("admin.inventory.transfers")}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="contained" disabled={processing}>
                                Raise transfer
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            </Box>
        </>
    );
}

TransferCreate.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
