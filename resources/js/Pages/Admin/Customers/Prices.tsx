import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    InputAdornment,
    Paper,
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
import ArrowBack from "@mui/icons-material/ArrowBack";
import Search from "@mui/icons-material/Search";

interface PriceRow {
    store_variant_id: number;
    item: string;
    sku: string | null;
    color: string | null;
    size: string | null;
    packaging: string | null;
    store_price: number | null;
    /** The customer's own price, when set. */
    price: number | null;
    discount_price: number | null;
    discount_ends_at: string | null;
}

interface Props {
    customer: { id: number; name: string; type: "individual" | "business"; store: string | null };
    rows?: PriceRow[];
}

type Draft = { price: string; discount_price: string; discount_ends_at: string };

const toDraft = (row: PriceRow): Draft => ({
    price: row.price !== null ? String(row.price) : "",
    discount_price: row.discount_price !== null ? String(row.discount_price) : "",
    discount_ends_at: row.discount_ends_at?.substring(0, 10) ?? "",
});

const variantLabel = (row: PriceRow) => [row.color, row.size, row.packaging].filter(Boolean).join(" · ") || "Standard";

/**
 * One customer's own prices across every item their store sells. Edit any
 * number of rows, or tick rows and set them all at once (a fixed price, or
 * a percentage off the store price); a blank price removes the customer's
 * own price and they pay the store's again.
 */
export default function CustomerPrices({ customer, rows = [] }: Props) {
    const initial = useMemo(() => Object.fromEntries(rows.map((row) => [row.store_variant_id, toDraft(row)])), [rows]);
    const [drafts, setDrafts] = useState<Record<number, Draft>>(initial);
    // Saved: the server's rows are the new starting point.
    useEffect(() => setDrafts(initial), [initial]);
    const [query, setQuery] = useState("");
    const [onlyOwn, setOnlyOwn] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [bulkPrice, setBulkPrice] = useState("");
    const [bulkPercent, setBulkPercent] = useState("");
    const [saving, setSaving] = useState(false);

    const visible = rows.filter((row) => {
        if (onlyOwn && !drafts[row.store_variant_id]?.price) return false;
        const term = query.trim().toLowerCase();
        if (!term) return true;
        return [row.item, row.sku, row.color, row.size, row.packaging].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    });

    const changed = rows.filter((row) => {
        const now = drafts[row.store_variant_id];
        const was = initial[row.store_variant_id];
        return now && was && (now.price !== was.price || now.discount_price !== was.discount_price || now.discount_ends_at !== was.discount_ends_at);
    });

    const setDraft = (id: number, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

    const applyToSelected = (mode: "price" | "percent" | "clear") => {
        setDrafts((all) => {
            const next = { ...all };
            selected.forEach((id) => {
                const row = rows.find((entry) => entry.store_variant_id === id);
                if (!row) return;
                if (mode === "clear") next[id] = { price: "", discount_price: "", discount_ends_at: "" };
                if (mode === "price" && bulkPrice !== "") next[id] = { ...next[id], price: bulkPrice };
                if (mode === "percent" && bulkPercent !== "" && row.store_price !== null) {
                    next[id] = { ...next[id], price: (row.store_price * (1 - Number(bulkPercent) / 100)).toFixed(2) };
                }
            });
            return next;
        });
    };

    const save = () => {
        setSaving(true);
        router.put(
            route("admin.customers.prices.update", customer.id),
            {
                rows: changed.map((row) => {
                    const draft = drafts[row.store_variant_id];
                    return {
                        store_variant_id: row.store_variant_id,
                        price: draft.price === "" ? null : draft.price,
                        discount_price: draft.discount_price === "" ? null : draft.discount_price,
                        discount_ends_at: draft.discount_ends_at || null,
                    };
                }),
            },
            { preserveScroll: true, onFinish: () => setSaving(false) },
        );
    };

    const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.includes(row.store_variant_id));

    return (
        <Box>
            <Head title={`Prices for ${customer.name}`} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }} mb={2}>
                <Box>
                    <Button component={Link} href={route("admin.customers.index")} startIcon={<ArrowBack />} size="small" sx={{ mb: 1, textTransform: "none" }}>
                        Customers
                    </Button>
                    <Typography variant="h5" fontWeight={800}>
                        {customer.name}'s prices
                    </Typography>
                    <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
                        <Chip size="small" label={customer.type === "individual" ? "Individual" : "Business"} />
                        <Typography variant="body2" color="text.secondary">
                            {customer.store ?? "No store"} · {rows.filter((row) => row.price !== null).length} own price(s)
                        </Typography>
                    </Stack>
                </Box>
                <Button variant="contained" onClick={save} disabled={saving || changed.length === 0}>
                    {saving ? "Saving…" : changed.length > 0 ? `Save ${changed.length} change(s)` : "No changes"}
                </Button>
            </Stack>

            {rows.length === 0 ? (
                <Alert severity="info">This customer has no store, or their store sells nothing yet.</Alert>
            ) : (
                <>
                    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                            <TextField
                                size="small"
                                placeholder="Search items"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                                sx={{ minWidth: 220 }}
                            />
                            <Button size="small" variant={onlyOwn ? "contained" : "outlined"} onClick={() => setOnlyOwn((on) => !on)} sx={{ textTransform: "none" }}>
                                Only their own prices
                            </Button>
                            <Box sx={{ flex: 1 }} />
                            <Typography variant="body2" color="text.secondary">{selected.length} selected</Typography>
                            <TextField size="small" type="number" label="Set price" value={bulkPrice} onChange={(event) => setBulkPrice(event.target.value)} sx={{ width: 120 }} />
                            <Button size="small" variant="outlined" disabled={!selected.length || bulkPrice === ""} onClick={() => applyToSelected("price")}>Apply</Button>
                            <TextField size="small" type="number" label="% off store" value={bulkPercent} onChange={(event) => setBulkPercent(event.target.value)} sx={{ width: 120 }} />
                            <Button size="small" variant="outlined" disabled={!selected.length || bulkPercent === ""} onClick={() => applyToSelected("percent")}>Apply</Button>
                            <Button size="small" color="error" disabled={!selected.length} onClick={() => applyToSelected("clear")}>Clear</Button>
                        </Stack>
                    </Paper>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "rgb(var(--surface-container-low))" } }}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            checked={allVisibleSelected}
                                            onChange={() =>
                                                setSelected(allVisibleSelected
                                                    ? selected.filter((id) => !visible.some((row) => row.store_variant_id === id))
                                                    : Array.from(new Set([...selected, ...visible.map((row) => row.store_variant_id)])))
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>Item</TableCell>
                                    <TableCell align="right">Store price</TableCell>
                                    <TableCell>Their price</TableCell>
                                    <TableCell>Discount</TableCell>
                                    <TableCell>Discount ends</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visible.map((row) => {
                                    const draft = drafts[row.store_variant_id] ?? toDraft(row);
                                    const dirty = changed.includes(row);

                                    return (
                                        <TableRow key={row.store_variant_id} hover sx={dirty ? { bgcolor: "rgb(var(--primary-container) / 0.25)" } : undefined}>
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    checked={selected.includes(row.store_variant_id)}
                                                    onChange={() => setSelected((ids) => ids.includes(row.store_variant_id) ? ids.filter((id) => id !== row.store_variant_id) : [...ids, row.store_variant_id])}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{row.item}</Typography>
                                                <Typography variant="caption" color="primary.main" fontWeight={600}>{variantLabel(row)}</Typography>
                                                {row.sku ? <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>{row.sku}</Typography> : null}
                                            </TableCell>
                                            <TableCell align="right">{row.store_price !== null ? row.store_price.toFixed(2) : "—"}</TableCell>
                                            <TableCell sx={{ minWidth: 120 }}>
                                                <TextField size="small" type="number" placeholder="Store price" value={draft.price} onChange={(event) => setDraft(row.store_variant_id, { price: event.target.value })} />
                                            </TableCell>
                                            <TableCell sx={{ minWidth: 120 }}>
                                                <TextField size="small" type="number" placeholder="None" value={draft.discount_price} disabled={draft.price === ""} onChange={(event) => setDraft(row.store_variant_id, { discount_price: event.target.value })} />
                                            </TableCell>
                                            <TableCell sx={{ minWidth: 150 }}>
                                                <TextField size="small" type="date" value={draft.discount_ends_at} disabled={draft.discount_price === ""} onChange={(event) => setDraft(row.store_variant_id, { discount_ends_at: event.target.value })} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}
        </Box>
    );
}

CustomerPrices.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
