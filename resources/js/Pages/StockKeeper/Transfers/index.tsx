import { Head, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import {
    Alert,
    Autocomplete,
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
    EmptyState,
    PageHeader,
    SkCard,
    StatCard,
    TransferStatusChip,
    formatMoment,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { StockKeeperTransfersProps, StockLocation, TransferRow } from "@/types/stockkeeper";

const STATUS_TABS: Array<{ value: string; label: string }> = [
    { value: "all", label: "All" },
    { value: "pending", label: "Queued" },
    { value: "in_transit", label: "In transit" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
];

/**
 * Stock movements between stores, from the warehouse floor.
 *
 * Stock leaves the origin at dispatch and lands at the destination on
 * completion, so units are never counted twice.
 */
export default function Transfers({
    transfers,
    filters,
    counts,
    locations = [],
    variants,
    pagination,
    flash,
}: StockKeeperTransfersProps): React.ReactElement {
    const [createOpen, setCreateOpen] = React.useState<boolean>(false);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const setStatus = (status: string): void => {
        router.get(
            route("stock_keeper.transfers.index"),
            status === "all" ? {} : { status },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const act = (transfer: TransferRow, action: "dispatch" | "complete" | "cancel"): void => {
        router.post(
            route(`stock_keeper.transfers.${action}`, transfer.id),
            {},
            { preserveScroll: true },
        );
    };

    return (
        <>
            <Head title="Stock Transfers" />

            <PageHeader
                title="Stock Transfers"
                subtitle="Move units between stores and confirm they landed."
                action={
                    <Button
                        variant="contained"
                        startIcon={<AddRoundedIcon />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Raise transfer
                    </Button>
                }
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="All transfers" value={counts.all} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="Queued" value={counts.pending} tone="warning" />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="In transit"
                        value={counts.in_transit}
                        icon={<LocalShippingRoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="Completed" value={counts.completed} tone="success" />
                </Grid>
            </Grid>

            <SkCard sx={{ p: 0, overflow: "hidden" }}>
                <Stack direction="row" spacing={1} sx={{ p: 2.5 }} flexWrap="wrap" useFlexGap>
                    {STATUS_TABS.map((tab) => {
                        const active = filters.status === tab.value;
                        return (
                            <Chip
                                key={tab.value}
                                label={tab.label}
                                onClick={() => setStatus(tab.value)}
                                color={active ? "primary" : "default"}
                                variant={active ? "filled" : "outlined"}
                                sx={{ fontWeight: 700 }}
                            />
                        );
                    })}
                </Stack>

                {transfers.length === 0 ? (
                    <EmptyState
                        icon={<LocalShippingRoundedIcon fontSize="large" />}
                        title="No transfers here yet"
                        hint="Raise one to move units between stores."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Reference</TableCell>
                                <TableCell>Product</TableCell>
                                <TableCell align="right">Qty</TableCell>
                                <TableCell>Route</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Raised</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transfers.map((transfer) => (
                                <TableRow key={transfer.id} hover>
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            sx={{ fontFamily: "monospace", fontWeight: 700 }}
                                        >
                                            {transfer.reference}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {transfer.product_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {transfer.sku ?? "—"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        {transfer.quantity.toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {transfer.source_label ?? transfer.from_store ?? "—"} →{" "}
                                            {transfer.destination_label ?? transfer.to_store ?? "—"}
                                        </Typography>
                                        {transfer.needs_courier ? (
                                            <Typography variant="caption" color={transfer.courier ? "text.secondary" : "warning.main"}>
                                                {transfer.courier ? `Courier: ${transfer.courier}` : "Waiting for a courier to claim it"}
                                            </Typography>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <TransferStatusChip status={transfer.status} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="caption" color="text.secondary">
                                            {formatMoment(transfer.created_at)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack
                                            direction="row"
                                            spacing={0.5}
                                            justifyContent="flex-end"
                                        >
                                            {transfer.status === "pending" ? (
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    disabled={Boolean(transfer.needs_courier && !transfer.courier)}
                                                    onClick={() => act(transfer, "dispatch")}
                                                >
                                                    {transfer.needs_courier ? "Hand to courier" : "Dispatch"}
                                                </Button>
                                            ) : null}
                                            {transfer.status === "in_transit" ? (
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    color="success"
                                                    onClick={() => act(transfer, "complete")}
                                                >
                                                    Complete
                                                </Button>
                                            ) : null}
                                            {transfer.status === "pending" ||
                                            transfer.status === "in_transit" ? (
                                                <Button
                                                    size="small"
                                                    color="error"
                                                    onClick={() => act(transfer, "cancel")}
                                                >
                                                    Cancel
                                                </Button>
                                            ) : null}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {pagination.last_page > 1 ? (
                    <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="center"
                        sx={{ p: 2 }}
                    >
                        <Button
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(
                                    route("stock_keeper.transfers.index"),
                                    { page: pagination.current_page - 1, status: filters.status },
                                    { preserveState: true },
                                )
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
                                router.get(
                                    route("stock_keeper.transfers.index"),
                                    { page: pagination.current_page + 1, status: filters.status },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </SkCard>

            <RaiseTransferDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                locations={locations}
                variants={variants}
            />

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={flash?.error ? "error" : "success"}
                    variant="filled"
                    onClose={() => setNotice(null)}
                >
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

/** Human label for a location kind in the pick list. */
const KIND_LABEL: Record<string, string> = {
    store: "whole store",
    shelf: "shelf",
    backroom: "store floor",
    remote_hub: "remote hub",
    main_hub: "main hub",
    warehouse: "warehouse",
};

/** "App\Models\…#12" — the pair the server resolves to a location. */
const pairOf = (location: StockLocation): string => `${location.type}#${location.id}`;

function RaiseTransferDialog({
    open,
    onClose,
    locations,
    variants,
}: {
    open: boolean;
    onClose: () => void;
    locations: StockLocation[];
    variants: StockKeeperTransfersProps["variants"];
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset, transform } = useForm<{
        item_variant_id: number | "";
        from: string;
        to: string;
        quantity: number | "";
        notes: string;
    }>({
        item_variant_id: "",
        from: "",
        to: "",
        quantity: 1,
        notes: "",
    });

    // The pick lists carry "type#id"; the server takes the pair split out.
    transform((form) => {
        const [sourceType, sourceId] = form.from.split("#");
        const [destinationType, destinationId] = form.to.split("#");

        return {
            item_variant_id: form.item_variant_id,
            quantity: form.quantity,
            notes: form.notes,
            source_location_type: sourceType || null,
            source_location_id: sourceId ? Number(sourceId) : null,
            destination_location_type: destinationType || null,
            destination_location_id: destinationId ? Number(destinationId) : null,
        };
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("stock_keeper.transfers.store"), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    // The server reports against the fields it received, not the form's.
    const serverErrors = errors as Record<string, string | undefined>;
    const fromError = serverErrors.source_location_id ?? serverErrors.from_store_id;
    const toError = serverErrors.destination_location_id ?? serverErrors.to_store_id;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>Raise a transfer</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Autocomplete
                            options={variants}
                            getOptionLabel={(option) => option.label}
                            onChange={(_event, value) =>
                                setData("item_variant_id", value ? value.id : "")
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Product variant"
                                    error={Boolean(errors.item_variant_id)}
                                    helperText={errors.item_variant_id}
                                />
                            )}
                        />

                        <TextField
                            select
                            label="From"
                            value={data.from}
                            onChange={(event) => setData("from", event.target.value)}
                            error={Boolean(fromError)}
                            helperText={fromError ?? "A whole store sends from its floor."}
                        >
                            {locations.map((location) => (
                                <MenuItem key={pairOf(location)} value={pairOf(location)}>
                                    {location.name} · {KIND_LABEL[location.kind] ?? location.kind} (
                                    {location.units.toLocaleString()} units)
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            label="To"
                            value={data.to}
                            onChange={(event) => setData("to", event.target.value)}
                            error={Boolean(toError)}
                            helperText={toError ?? "e.g. a store floor to its Store Shelf."}
                        >
                            {locations.map((location) => (
                                <MenuItem key={pairOf(location)} value={pairOf(location)}>
                                    {location.name} · {KIND_LABEL[location.kind] ?? location.kind}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            type="number"
                            label="Quantity"
                            value={data.quantity}
                            onChange={(event) =>
                                setData(
                                    "quantity",
                                    event.target.value === "" ? "" : Number(event.target.value),
                                )
                            }
                            error={Boolean(errors.quantity)}
                            helperText={errors.quantity ?? "In the variant's own unit."}
                            slotProps={{ htmlInput: { min: 1 } }}
                        />

                        <TextField
                            label="Notes (optional)"
                            value={data.notes}
                            onChange={(event) => setData("notes", event.target.value)}
                            error={Boolean(errors.notes)}
                            helperText={errors.notes}
                            multiline
                            rows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        Raise transfer
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

Transfers.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
