import React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
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
    Typography,
} from "@mui/material";
import OpenInNew from "@mui/icons-material/OpenInNew";

type Status = "active" | "expired" | "price";

interface CustomerDiscount {
    id: number;
    customer: string | null;
    customer_phone: string | null;
    store_id: number | null;
    store: string | null;
    item_id: number | null;
    item: string;
    variant: string | null;
    sku: string | null;
    price: number | null;
    discount_price: number | null;
    discount_ends_at: string | null;
    days_left: number | null;
    status: Status;
}

interface Props {
    discounts?: CustomerDiscount[];
    counts?: Record<Status | "all", number>;
    filters?: { status: Status | "all" };
}

const FILTERS: Array<{ value: Status | "all"; label: string }> = [
    { value: "active", label: "Running discounts" },
    { value: "expired", label: "Ended" },
    { value: "price", label: "Set price, no discount" },
    { value: "all", label: "All" },
];

const money = (amount: number | null): string =>
    amount === null ? "—" : `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const date = (iso: string): string =>
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));

function endsLabel(row: CustomerDiscount): { label: string; color: "success" | "warning" | "default" | "error" } {
    if (row.status === "price") return { label: "No discount", color: "default" };
    if (row.status === "expired") return { label: `Ended ${row.discount_ends_at ? date(row.discount_ends_at) : ""}`, color: "error" };
    if (row.discount_ends_at === null) return { label: "No end date", color: "success" };
    if (row.days_left === 0) return { label: "Ends today", color: "warning" };

    return {
        label: `Ends ${date(row.discount_ends_at)} · ${row.days_left} day${row.days_left === 1 ? "" : "s"} left`,
        color: (row.days_left ?? 99) <= 7 ? "warning" : "success",
    };
}

/**
 * Prices and discounts set for a specific customer on a store's item (under
 * "Edit price & rule" on the store item page), and when each discount ends.
 * Follows the active store.
 */
export default function CustomerDiscounts({ discounts = [], counts = { active: 0, expired: 0, price: 0, all: 0 }, filters = { status: "active" } }: Props) {
    return (
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>
            <Head title="Customer prices & discounts" />

            <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Customer prices &amp; discounts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Prices set for one customer on a store item, and when each discount ends. Change them on the item&apos;s page under
                &ldquo;Edit price &amp; rule&rdquo;.
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {FILTERS.map((filter) => (
                    <Chip
                        key={filter.value}
                        label={`${filter.label} (${counts[filter.value] ?? 0})`}
                        color={filters.status === filter.value ? "primary" : "default"}
                        variant={filters.status === filter.value ? "filled" : "outlined"}
                        onClick={() => router.get(route("admin.customers.discounts"), { status: filter.value }, { preserveScroll: true, replace: true })}
                        sx={{ fontWeight: 700 }}
                    />
                ))}
            </Stack>

            {discounts.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
                    <Typography color="text.secondary">Nothing here for this store.</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Customer</TableCell>
                                <TableCell>Item</TableCell>
                                <TableCell>Store</TableCell>
                                <TableCell align="right">Price</TableCell>
                                <TableCell align="right">Discount price</TableCell>
                                <TableCell>Ends</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {discounts.map((row) => {
                                const ends = endsLabel(row);

                                return (
                                    <TableRow key={row.id} hover>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{row.customer ?? "—"}</Typography>
                                            {row.customer_phone && (
                                                <Typography variant="caption" color="text.secondary">{row.customer_phone}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{row.item}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {[row.variant, row.sku].filter(Boolean).join(" · ") || "—"}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{row.store ?? "—"}</TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{money(row.price)}</TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700 }}>{money(row.discount_price)}</TableCell>
                                        <TableCell>
                                            <Chip size="small" variant="outlined" color={ends.color} label={ends.label} />
                                        </TableCell>
                                        <TableCell align="right">
                                            {row.store_id !== null && row.item_id !== null && (
                                                <Button
                                                    size="small"
                                                    component={Link}
                                                    href={route("store.item.variants", { store: row.store_id, item: row.item_id })}
                                                    endIcon={<OpenInNew fontSize="small" />}
                                                    sx={{ whiteSpace: "nowrap" }}
                                                >
                                                    Edit price &amp; rule
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}

CustomerDiscounts.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
