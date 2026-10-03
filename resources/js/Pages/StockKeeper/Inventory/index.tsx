import { Head, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Collapse,
    CircularProgress,
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
    ItemStockRow,
    ItemVariantStockRow,
    StockKeeperInventoryProps,
    StockRow,
    VariantOption,
} from "@/types/stockkeeper";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The stock ledger, read the way the floor reads it.
 *
 * One row per *item*, not per ledger row: this screen used to list `item_stocks`
 * directly — 4,907 rows — and headline a distinct variant count, so a desk
 * holding 182 products reported "1,629 tracked SKUs". Quantities are spoken in
 * the item's own packaging and in the order that location cares about: a shop
 * floor in its smallest unit ("47 Packets"), everywhere else biggest first
 * ("30 Cartons · 17 Pieces").
 *
 * The variant rows are still here, one expand away, because a receipt or a
 * recount is always written against a variant.
 */
export default function Inventory({
    items,
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

    /** Item id currently expanded, and the variant rows fetched for it. */
    const [openItem, setOpenItem] = React.useState<number | null>(null);
    const [variantRows, setVariantRows] = React.useState<Record<number, ItemVariantStockRow[]>>({});
    const [loadingItem, setLoadingItem] = React.useState<number | null>(null);

    /**
     * Variant rows are fetched on demand rather than shipped with the page:
     * 182 items carry 1,629 variants between them, and almost none of them are
     * looked at.
     */
    const toggleItem = async (row: ItemStockRow): Promise<void> => {
        if (openItem === row.item_id) {
            setOpenItem(null);
            return;
        }

        setOpenItem(row.item_id);

        if (variantRows[row.item_id]) return;

        setLoadingItem(row.item_id);

        try {
            const params = new URLSearchParams();
            if (filters.location_type) params.set("location_type", filters.location_type);
            if (filters.location_id) params.set("location_id", String(filters.location_id));

            const response = await fetch(
                `${route("stock_keeper.inventory.items.variants", row.item_id)}?${params.toString()}`,
                { headers: { Accept: "application/json" } },
            );
            const payload = await response.json();

            setVariantRows((current) => ({ ...current, [row.item_id]: payload.variants ?? [] }));
        } catch {
            setNotice("Could not load the variants for that item.");
        } finally {
            setLoadingItem(null);
        }
    };

    /**
     * The adjust dialog writes against a ledger row, so a variant row is shaped
     * into the StockRow the dialog already understands.
     */
    const adjustVariant = (item: ItemStockRow, variant: ItemVariantStockRow): void =>
        setAdjustRow({
            id: variant.stock_id,
            variant_id: variant.variant_id,
            item_id: item.item_id,
            product_name: item.product_name,
            sku: variant.sku,
            variant_label: variant.variant_label,
            location_name: variant.location_name,
            location_kind: "store",
            quantity: variant.quantity,
            unit: variant.unit,
            pieces_per_unit: variant.pieces_per_unit,
            pieces: variant.pieces,
            min_stock_level: variant.min_stock_level,
            headroom: variant.quantity - variant.min_stock_level,
            status: item.status,
            updated_at: variant.updated_at,
        });

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
                subtitle="Every item on hand, in the units the place it sits is counted in."
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

            {/*
              Items lead. The old headline was `tracked_skus`, a distinct variant
              count — a figure about how the catalogue is cut, not about what is
              on the floor. Variants are still shown, under the item count.
            */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Items on hand"
                        value={metrics.items}
                        icon={<Inventory2RoundedIcon fontSize="small" />}
                        hint={`${metrics.variants.toLocaleString()} variants`}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Pieces on hand"
                        value={metrics.pieces_on_hand}
                        hint={`${metrics.ledger_rows.toLocaleString()} ledger rows`}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Low stock items"
                        value={metrics.low_stock_items}
                        tone={metrics.low_stock_items > 0 ? "warning" : "success"}
                    />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <StatCard
                        label="Out of stock items"
                        value={metrics.out_of_stock_items}
                        tone={metrics.out_of_stock_items > 0 ? "danger" : "success"}
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

                {items.length === 0 ? (
                    <EmptyState
                        icon={<Inventory2RoundedIcon fontSize="large" />}
                        title="No items match"
                        hint="Adjust the search or pick a different location."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 48 }} />
                                <TableCell>Item</TableCell>
                                <TableCell>Variants</TableCell>
                                <TableCell align="right">On hand</TableCell>
                                <TableCell align="right">Pieces</TableCell>
                                <TableCell align="right">Status</TableCell>
                                <TableCell align="right">Updated</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((row) => {
                                const expanded = openItem === row.item_id;
                                const rows = variantRows[row.item_id] ?? [];

                                return (
                                    <React.Fragment key={row.item_id}>
                                        <TableRow hover>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => void toggleItem(row)}
                                                    aria-label={expanded ? "Hide variants" : "Show variants"}
                                                >
                                                    {expanded ? (
                                                        <ExpandLessRoundedIcon fontSize="small" />
                                                    ) : (
                                                        <ExpandMoreRoundedIcon fontSize="small" />
                                                    )}
                                                </IconButton>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {row.product_name}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    sx={{ fontFamily: "monospace" }}
                                                >
                                                    {row.item_sku ?? "—"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    label={`${row.variant_count} variant${row.variant_count === 1 ? "" : "s"}`}
                                                />
                                            </TableCell>
                                            {/*
                                              The figure, spoken in this location's
                                              own units — smallest-first on a shop
                                              floor, biggest-first everywhere else.
                                            */}
                                            <TableCell align="right">
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                    {row.display}
                                                </Typography>
                                                {row.display_mode === "smallest" ? (
                                                    <Typography variant="caption" color="text.secondary">
                                                        shop floor · single units
                                                    </Typography>
                                                ) : null}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="caption" color="text.secondary">
                                                    {row.pieces.toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <StockStatusChip status={row.status} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatMoment(row.updated_at)}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell colSpan={7} sx={{ py: 0, border: 0 }}>
                                                <Collapse in={expanded} timeout="auto" unmountOnExit>
                                                    <Box sx={{ py: 1.5, pl: 6 }}>
                                                        {loadingItem === row.item_id ? (
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <CircularProgress size={16} />
                                                                <Typography variant="caption">
                                                                    Loading variants…
                                                                </Typography>
                                                            </Stack>
                                                        ) : rows.length === 0 ? (
                                                            <Typography variant="caption" color="text.secondary">
                                                                No ledger rows for this item here.
                                                            </Typography>
                                                        ) : (
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>SKU</TableCell>
                                                                        <TableCell>Variant</TableCell>
                                                                        <TableCell>Location</TableCell>
                                                                        <TableCell align="right">Counted</TableCell>
                                                                        <TableCell align="right">Pieces</TableCell>
                                                                        <TableCell align="right">Minimum</TableCell>
                                                                        <TableCell align="right" />
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {rows.map((variant) => (
                                                                        <TableRow key={variant.stock_id}>
                                                                            <TableCell
                                                                                sx={{ fontFamily: "monospace", fontSize: 12 }}
                                                                            >
                                                                                {variant.sku ?? "—"}
                                                                            </TableCell>
                                                                            <TableCell>{variant.variant_label}</TableCell>
                                                                            <TableCell>{variant.location_name}</TableCell>
                                                                            {/*
                                                                              Named, not bare: "11 Cartons"
                                                                              reads very differently from
                                                                              "11" when a carton is 120.
                                                                            */}
                                                                            <TableCell align="right">
                                                                                {variant.quantity.toLocaleString()}{" "}
                                                                                {variant.unit}
                                                                                {variant.quantity === 1 ? "" : "s"}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                {variant.pieces.toLocaleString()}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                {variant.min_stock_level.toLocaleString()}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                <Tooltip title="Adjust count">
                                                                                    <IconButton
                                                                                        size="small"
                                                                                        onClick={() =>
                                                                                            adjustVariant(row, variant)
                                                                                        }
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
                                                    </Box>
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </React.Fragment>
                                );
                            })}
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
