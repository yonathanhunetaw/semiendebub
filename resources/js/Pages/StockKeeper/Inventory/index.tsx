import { Head, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Alert,
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

import {
    EmptyState,
    PageHeader,
    SkCard,
    StatCard,
    StockStatusChip,
    formatMoment,
} from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type {
    StockKeeperInventoryProps,
    StockRow,
    VariantOption,
} from "@/types/stockkeeper";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The stock ledger, plus the desk's two write actions: receiving goods in and
 * correcting a count after a physical recount.
 */
export default function Inventory({
    stock,
    locations,
    variants,
    filters,
    metrics,
    pagination,
    flash,
}: StockKeeperInventoryProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const [receiveOpen, setReceiveOpen] = React.useState<boolean>(false);
    const [adjustRow, setAdjustRow] = React.useState<StockRow | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const applyFilters = React.useCallback(
        (next: { search?: string; location?: string | null }): void => {
            const query: Record<string, string | number> = {};
            const nextSearch = next.search ?? filters.search;

            if (nextSearch) {
                query.search = nextSearch;
            }

            // Location is passed as "type#id" from the select, then split apart.
            const locationValue =
                next.location !== undefined
                    ? next.location
                    : filters.location_type && filters.location_id
                      ? `${filters.location_type}#${filters.location_id}`
                      : null;

            if (locationValue) {
                const [type, id] = locationValue.split("#");
                query.location_type = type;
                query.location_id = Number(id);
            }

            router.get(route("stock_keeper.inventory.index"), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        },
        [filters.search, filters.location_type, filters.location_id],
    );

    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => applyFilters({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    const selectedLocation =
        filters.location_type && filters.location_id
            ? `${filters.location_type}#${filters.location_id}`
            : "";

    return (
        <>
            <Head title="Inventory Ledger" />

            <PageHeader
                title="Inventory Ledger"
                subtitle="Every tracked SKU and where its units physically sit."
                action={
                    <Button
                        variant="contained"
                        startIcon={<AddRoundedIcon />}
                        onClick={() => setReceiveOpen(true)}
                    >
                        Receive stock
                    </Button>
                }
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Units on hand"
                        value={metrics.units_on_hand}
                        icon={<Inventory2RoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard label="Tracked SKUs" value={metrics.tracked_skus} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Low stock"
                        value={metrics.low_stock}
                        tone={metrics.low_stock > 0 ? "warning" : "success"}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Out of stock"
                        value={metrics.out_of_stock}
                        tone={metrics.out_of_stock > 0 ? "danger" : "success"}
                    />
                </Grid>
            </Grid>

            <SkCard sx={{ p: 0, overflow: "hidden" }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    sx={{ p: 2.5 }}
                >
                    <TextField
                        size="small"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search product, SKU or barcode…"
                        sx={{ flex: 1 }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <TextField
                        select
                        size="small"
                        label="Location"
                        value={selectedLocation}
                        onChange={(event) =>
                            applyFilters({ location: event.target.value || null })
                        }
                        sx={{ minWidth: 240 }}
                    >
                        <MenuItem value="">All locations</MenuItem>
                        {locations.map((location) => (
                            <MenuItem
                                key={`${location.kind}-${location.id}`}
                                value={`${location.type}#${location.id}`}
                            >
                                {location.name} ({location.units.toLocaleString()})
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>

                {stock.length === 0 ? (
                    <EmptyState
                        icon={<Inventory2RoundedIcon fontSize="large" />}
                        title="No stock rows match"
                        hint="Adjust the search or pick a different location."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Product</TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell align="right">On hand</TableCell>
                                <TableCell align="right">Minimum</TableCell>
                                <TableCell align="right">Status</TableCell>
                                <TableCell align="right">Updated</TableCell>
                                <TableCell align="right" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stock.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {row.product_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {row.variant_label}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            sx={{ fontFamily: "monospace" }}
                                        >
                                            {row.sku ?? "—"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{row.location_name}</TableCell>
                                    <TableCell align="right">
                                        {row.quantity.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {row.min_stock_level.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        <StockStatusChip status={row.status} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="caption" color="text.secondary">
                                            {formatMoment(row.updated_at)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Adjust count">
                                            <IconButton
                                                size="small"
                                                onClick={() => setAdjustRow(row)}
                                            >
                                                <EditRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
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
                                    route("stock_keeper.inventory.index"),
                                    { page: pagination.current_page - 1, search: filters.search },
                                    { preserveState: true },
                                )
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page} ·{" "}
                            {pagination.total.toLocaleString()} rows
                        </Typography>
                        <Button
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(
                                    route("stock_keeper.inventory.index"),
                                    { page: pagination.current_page + 1, search: filters.search },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </SkCard>

            <ReceiveStockDialog
                open={receiveOpen}
                onClose={() => setReceiveOpen(false)}
                variants={variants}
                locations={locations}
            />

            <AdjustStockDialog row={adjustRow} onClose={() => setAdjustRow(null)} />

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

/* ----------------------------------------------------------
 | Receive
 |----------------------------------------------------------*/

interface ReceiveDialogProps {
    open: boolean;
    onClose: () => void;
    variants: VariantOption[];
    locations: StockKeeperInventoryProps["locations"];
}

function ReceiveStockDialog({
    open,
    onClose,
    variants,
    locations,
}: ReceiveDialogProps): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm<{
        item_variant_id: number | "";
        location_type: string;
        location_id: number | "";
        quantity: number | "";
        min_stock_level: number | "";
    }>({
        item_variant_id: "",
        location_type: "",
        location_id: "",
        quantity: 1,
        min_stock_level: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("stock_keeper.inventory.receive"), {
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
                <DialogTitle sx={{ fontWeight: 800 }}>Receive stock</DialogTitle>
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
                            label="Destination"
                            value={
                                data.location_type && data.location_id
                                    ? `${data.location_type}#${data.location_id}`
                                    : ""
                            }
                            onChange={(event) => {
                                const [type, id] = event.target.value.split("#");
                                setData((current) => ({
                                    ...current,
                                    location_type: type ?? "",
                                    location_id: id ? Number(id) : "",
                                }));
                            }}
                            error={Boolean(errors.location_id || errors.location_type)}
                            helperText={errors.location_id ?? errors.location_type}
                        >
                            {locations.map((location) => (
                                <MenuItem
                                    key={`${location.kind}-${location.id}`}
                                    value={`${location.type}#${location.id}`}
                                >
                                    {location.name} · {location.kind}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            type="number"
                            label="Quantity received"
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
                            type="number"
                            label="Minimum stock level (optional)"
                            value={data.min_stock_level}
                            onChange={(event) =>
                                setData(
                                    "min_stock_level",
                                    event.target.value === "" ? "" : Number(event.target.value),
                                )
                            }
                            error={Boolean(errors.min_stock_level)}
                            helperText={
                                errors.min_stock_level ??
                                "Sets the threshold that triggers a stock alert."
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        Receive
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

/* ----------------------------------------------------------
 | Adjust
 |----------------------------------------------------------*/

function AdjustStockDialog({
    row,
    onClose,
}: {
    row: StockRow | null;
    onClose: () => void;
}): React.ReactElement {
    const { data, setData, patch, processing, errors } = useForm<{
        counted_quantity: number | "";
        min_stock_level: number | "";
        notes: string;
    }>({
        counted_quantity: 0,
        min_stock_level: "",
        notes: "",
    });

    // Seed the form from whichever row was opened.
    React.useEffect(() => {
        if (row) {
            setData({
                counted_quantity: row.quantity,
                min_stock_level: row.min_stock_level,
                notes: "",
            });
        }
        // setData identity is stable in Inertia's useForm.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row]);

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        if (!row) {
            return;
        }

        patch(route("stock_keeper.inventory.adjust", row.id), {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    const delta =
        row && data.counted_quantity !== ""
            ? Number(data.counted_quantity) - row.quantity
            : 0;

    return (
        <Dialog open={row !== null} onClose={onClose} fullWidth maxWidth="sm">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>
                    Adjust count
                    <Typography variant="body2" color="text.secondary">
                        {row?.product_name} · {row?.location_name}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <TextField
                            type="number"
                            label="Counted quantity"
                            value={data.counted_quantity}
                            onChange={(event) =>
                                setData(
                                    "counted_quantity",
                                    event.target.value === "" ? "" : Number(event.target.value),
                                )
                            }
                            error={Boolean(errors.counted_quantity)}
                            helperText={
                                errors.counted_quantity ??
                                (delta === 0
                                    ? "Matches the system count."
                                    : `${delta > 0 ? "+" : ""}${delta} against the system count.`)
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                        />

                        <TextField
                            type="number"
                            label="Minimum stock level"
                            value={data.min_stock_level}
                            onChange={(event) =>
                                setData(
                                    "min_stock_level",
                                    event.target.value === "" ? "" : Number(event.target.value),
                                )
                            }
                            error={Boolean(errors.min_stock_level)}
                            helperText={errors.min_stock_level}
                            slotProps={{ htmlInput: { min: 0 } }}
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
                        Save count
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

Inventory.layout = (page: React.ReactNode) => (
    <StockKeeperLayout>{page}</StockKeeperLayout>
);
