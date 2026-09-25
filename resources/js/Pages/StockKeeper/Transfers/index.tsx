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
import type { StockKeeperTransfersProps, TransferRow } from "@/types/stockkeeper";

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
    stores,
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
                                            {transfer.from_store ?? "—"} →{" "}
                                            {transfer.to_store ?? "—"}
                                        </Typography>
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
                                                    onClick={() => act(transfer, "dispatch")}
                                                >
                                                    Dispatch
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
                stores={stores}
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

function RaiseTransferDialog({
    open,
    onClose,
    stores,
    variants,
}: {
    open: boolean;
    onClose: () => void;
    stores: StockKeeperTransfersProps["stores"];
    variants: StockKeeperTransfersProps["variants"];
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm<{
        item_variant_id: number | "";
        from_store_id: number | "";
        to_store_id: number | "";
        quantity: number | "";
        notes: string;
    }>({
        item_variant_id: "",
        from_store_id: "",
        to_store_id: "",
        quantity: 1,
        notes: "",
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
                            label="From store"
                            value={data.from_store_id}
                            onChange={(event) =>
                                setData("from_store_id", Number(event.target.value))
                            }
                            error={Boolean(errors.from_store_id)}
                            helperText={errors.from_store_id}
                        >
                            {stores.map((store) => (
                                <MenuItem key={store.id} value={store.id}>
                                    {store.name} ({store.units.toLocaleString()} units)
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            label="To store"
                            value={data.to_store_id}
                            onChange={(event) =>
                                setData("to_store_id", Number(event.target.value))
                            }
                            error={Boolean(errors.to_store_id)}
                            helperText={errors.to_store_id}
                        >
                            {stores.map((store) => (
                                <MenuItem key={store.id} value={store.id}>
                                    {store.name}
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
                            helperText={errors.quantity}
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
