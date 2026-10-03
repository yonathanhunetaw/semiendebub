import AdminLayout from "@/Layouts/AppLayout";
import type { CapacityStoreOption, CapacityVariantRow } from "@/types/capacity";
import { Head, Link, router } from "@inertiajs/react";
import TuneIcon from "@mui/icons-material/Tune";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Box,
    Button,
    Chip,
    FormControl,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

interface Props {
    store: CapacityStoreOption | null;
    stores?: CapacityStoreOption[];
    variants?: CapacityVariantRow[];
    filters: { store_id: number | null; search: string };
    pagination: { current_page: number; last_page: number; total: number };
}

/**
 * Variant capacity, store by store.
 *
 * Capacity is deliberately opt-in: a variant with no monitored level is simply
 * not watched, which is what keeps the replenishment planner from proposing a
 * transfer for every back room that has never had a stock row written for it.
 * "Monitored" below is the count of levels with a floor above zero.
 */
export default function CapacityIndex({
    store,
    stores = [],
    variants = [],
    filters,
    pagination,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? "");

    const visit = (next: { store_id?: number; search?: string }) => {
        router.get(
            route("admin.inventory.capacity.index"),
            {
                store_id: next.store_id ?? filters.store_id ?? undefined,
                search: next.search ?? search,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    return (
        <>
            <Head title="Variant capacity" />

            <Box sx={{ p: { xs: 2, md: 3 } }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ md: "center" }}
                    justifyContent="space-between"
                    sx={{ mb: 3 }}
                >
                    <Box>
                        <Typography variant="h5" fontWeight={800}>
                            Variant capacity
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Minimum and maximum holding per variant, set separately for the
                            shop floor, the back room, the remote warehouse and the main
                            warehouse.
                        </Typography>
                    </Box>

                    <Button
                        component={Link}
                        href={route("admin.inventory.replenishment.index")}
                        variant="outlined"
                        startIcon={<WarningAmberIcon />}
                    >
                        Replenishment approvals
                    </Button>
                </Stack>

                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <FormControl size="small" sx={{ minWidth: 240 }}>
                            <InputLabel id="capacity-store-label">Facility</InputLabel>
                            <Select
                                labelId="capacity-store-label"
                                label="Facility"
                                value={filters.store_id ?? ""}
                                onChange={(event) =>
                                    visit({ store_id: Number(event.target.value) })
                                }
                            >
                                {stores.map((option) => (
                                    <MenuItem key={option.id} value={option.id}>
                                        {option.name} — {option.type_label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            size="small"
                            fullWidth
                            placeholder="Product name or SKU"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") visit({ search });
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Button variant="contained" onClick={() => visit({ search })}>
                            Search
                        </Button>
                    </Stack>
                </Paper>

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Product</TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell>Variant</TableCell>
                                <TableCell align="center">Monitored levels</TableCell>
                                <TableCell align="right">Capacity</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {variants.map((variant) => (
                                <TableRow key={variant.id} hover>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                        {variant.product_name}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                                        {variant.sku ?? "—"}
                                    </TableCell>
                                    <TableCell>{variant.variant_label}</TableCell>
                                    <TableCell align="center">
                                        {variant.monitored_levels === 0 ? (
                                            <Chip size="small" label="Not monitored" />
                                        ) : (
                                            <Chip
                                                size="small"
                                                color="primary"
                                                label={`${variant.monitored_levels} of ${variant.levels_total}`}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            component={Link}
                                            href={route(
                                                "admin.inventory.capacity.edit",
                                                variant.id,
                                            )}
                                            size="small"
                                            startIcon={<TuneIcon />}
                                        >
                                            Set bands
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}

                            {variants.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {store === null
                                                ? "Pick a facility to list its variants."
                                                : "No variants match this search."}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {pagination.last_page > 1 && (
                    <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
                        <Button
                            size="small"
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(route("admin.inventory.capacity.index"), {
                                    store_id: filters.store_id ?? undefined,
                                    search: filters.search,
                                    page: pagination.current_page - 1,
                                })
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" sx={{ alignSelf: "center" }}>
                            Page {pagination.current_page} of {pagination.last_page}
                        </Typography>
                        <Button
                            size="small"
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(route("admin.inventory.capacity.index"), {
                                    store_id: filters.store_id ?? undefined,
                                    search: filters.search,
                                    page: pagination.current_page + 1,
                                })
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                )}
            </Box>
        </>
    );
}

CapacityIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
