import { Head, router } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Avatar,
    Button,
    Grid,
    InputAdornment,
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
    StatCard,
    VendorCard,
} from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorCatalogueProps } from "@/types/vendor";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The SKUs this vendor supplies, with live network stock per variant.
 */
export default function Catalogue({
    variants,
    metrics,
    filters,
    pagination,
}: VendorCatalogueProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => {
            router.get(
                route("vendor.catalogue.index"),
                search ? { search } : {},
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [search, filters.search]);

    return (
        <>
            <Head title="My Catalogue" />

            <PageHeader
                title="My Catalogue"
                subtitle="Every SKU registered to your account, and where the units are."
            />

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <StatCard
                        label="SKUs supplied"
                        value={metrics.catalogue_skus}
                        icon={<Inventory2RoundedIcon fontSize="small" />}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <StatCard
                        label="Units in network"
                        value={metrics.units_in_network}
                        hint="Across every store and warehouse"
                    />
                </Grid>
            </Grid>

            <VendorCard sx={{ p: 0, overflow: "hidden" }}>
                <Stack sx={{ p: 2.5 }}>
                    <TextField
                        size="small"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search product, SKU or barcode…"
                        sx={{ maxWidth: { md: 400 } }}
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
                </Stack>

                {variants.length === 0 ? (
                    <EmptyState
                        icon={<Inventory2RoundedIcon fontSize="large" />}
                        title="No SKUs registered to you"
                        hint="Variants are linked to a vendor by their owner. Ask an admin to assign yours."
                    />
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Product</TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell>Variant</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell align="right">Pack</TableCell>
                                <TableCell align="right">In network</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {variants.map((variant) => (
                                <TableRow key={variant.id} hover>
                                    <TableCell>
                                        <Stack
                                            direction="row"
                                            spacing={1.5}
                                            alignItems="center"
                                        >
                                            <Avatar
                                                src={variant.image_url ?? undefined}
                                                variant="rounded"
                                                sx={{ width: 36, height: 36 }}
                                            >
                                                {variant.product_name.charAt(0)}
                                            </Avatar>
                                            <Typography
                                                variant="body2"
                                                sx={{ fontWeight: 600 }}
                                            >
                                                {variant.product_name}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            sx={{ fontFamily: "monospace" }}
                                        >
                                            {variant.sku ?? "—"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {[variant.color, variant.size]
                                            .filter(Boolean)
                                            .join(" / ") || "Standard"}
                                    </TableCell>
                                    <TableCell>{variant.category ?? "—"}</TableCell>
                                    <TableCell align="right">
                                        {variant.packaging ?? "—"}
                                        {variant.pieces_per_unit > 0 ? (
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                display="block"
                                            >
                                                {variant.pieces_per_unit} pcs
                                            </Typography>
                                        ) : null}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {variant.units_in_network.toLocaleString()}
                                        </Typography>
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
                                    route("vendor.catalogue.index"),
                                    { ...filters, page: pagination.current_page - 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            Page {pagination.current_page} of {pagination.last_page} ·{" "}
                            {pagination.total.toLocaleString()} SKUs
                        </Typography>
                        <Button
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(
                                    route("vendor.catalogue.index"),
                                    { ...filters, page: pagination.current_page + 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </VendorCard>
        </>
    );
}

Catalogue.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
