import { Head, router } from "@inertiajs/react";
import { Chip, InputAdornment, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import React from "react";

import { Pager } from "@/Components/Admin/adminUi";
import NoStore from "@/Components/Vendor/NoStore";
import { EmptyState, PageHeader, VendorCard, formatMoney } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { Paginated, VendorCatalogueRow, VendorStoreProfile } from "@/types/vendor";

interface Props {
    store: VendorStoreProfile | null;
    items: Paginated<VendorCatalogueRow> | null;
    filters: { search: string | null };
}

/** What the store lists, at its own base price. */
export default function Catalogue({ store, items, filters }: Props): React.ReactElement {
    const [search, setSearch] = React.useState(filters.search ?? "");
    const rows = items?.data ?? [];

    return (
        <>
            <Head title="Catalogue" />
            <PageHeader title="Catalogue" subtitle="What your store lists on the shop, at its own price." />

            {!store ? (
                <NoStore />
            ) : (
                <VendorCard>
                    <TextField
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && router.get(route("vendor.catalogue.index"), { search }, { preserveState: true })}
                        placeholder="Search items (Enter)"
                        sx={{ mb: 2, maxWidth: 360, width: "100%" }}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
                    />
                    {rows.length === 0 ? (
                        <EmptyState title="Nothing listed yet" hint="Items your store sells show here once they are deployed to it." />
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Item</TableCell>
                                    <TableCell>SKU</TableCell>
                                    <TableCell align="right">Price</TableCell>
                                    <TableCell>On the shop</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell sx={{ fontWeight: 600 }}>{r.item}</TableCell>
                                        <TableCell sx={{ fontFamily: "monospace" }}>{r.sku ?? "—"}</TableCell>
                                        <TableCell align="right">{r.price === null ? "No price" : formatMoney(r.price)}</TableCell>
                                        <TableCell><Chip size="small" color={r.active ? "success" : "default"} label={r.active ? "Listed" : "Hidden"} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <Pager links={items?.links} from={items?.from} to={items?.to} total={items?.total} />
                </VendorCard>
            )}
        </>
    );
}

Catalogue.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
