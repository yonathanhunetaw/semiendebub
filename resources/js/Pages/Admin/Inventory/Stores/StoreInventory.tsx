import React, { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Stack, Chip,
    IconButton, Collapse, Drawer, Divider, TextField, MenuItem,
    Select, FormControl, InputLabel, Tooltip, Alert, CircularProgress,
    Tabs, Tab, InputAdornment, Snackbar, Pagination, useMediaQuery,
    useTheme, Card, CardContent, Grid, CardActions,
    ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";
import { keyframes } from "@emotion/react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface CustomerPrice {
    id: number;
    customer_id: number;
    customer_name: string;
    tin_number: string | null;
    customer_type?: "business" | "individual";
    price: string | number;
    individual_price: number | null;
    business_price?: number | null;
    discount_price: string | number | null;
    discount_ends_at: string | null;
}

interface SellerPrice {
    id: number;
    seller_id: number;
    seller_name: string;
    price: string | number;
    discount_price: string | number | null;
    discount_ends_at: string | null;
    business?: PriceTier | null;
    individual?: PriceTier | null;
}

interface PriceTier {
    price: string | number;
    discount_price: string | number | null;
    discount_ends_at: string | null;
}

interface IndividualPrice {
    id: number;
    price: string | number | null;
    discount_price: string | number | null;
    discount_ends_at: string | null;
    active: boolean;
}

interface Variant {
    id: number;
    sku: string;
    label: string;
    price: string | number;
    discount_price: string | number | null;
    discount_ends_at: string | null;
    active: boolean;
    stock: number;
    remote_stock: number;
    multiplier: number;
    status: string;
    customer_prices: CustomerPrice[];
    seller_prices: SellerPrice[];
    individual_price: IndividualPrice | null;
}

interface InventoryItem {
    item_id: number;
    item_name: string;
    category: string;
    starting_price: number;
    total_variants: number;
    total_stock: number;
    remote_total_stock: number;
    variants: Variant[];
}

interface Person {
    id: number;
    first_name: string;
    last_name?: string;
    tin_number?: string | null;
}

// Pagination meta (from Laravel/Inertia)
interface PaginationMeta {
    current_page: number;
    from: number;
    last_page: number;
    per_page: number;
    to: number;
    total: number;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface PaginatedData<T> {
    data: T[];
    links: PaginationLink[];
    meta: PaginationMeta;
}

interface Props {
    store: { id: number; name: string; location?: string; manager?: string; status: string };
    inventory: PaginatedData<InventoryItem> | InventoryItem[]; // support both
    customers: Person[];
    sellers: Person[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v: string | number | null | undefined) =>
    v != null && v !== "" ? `$${Number(v).toFixed(2)}` : "—";

const getPersonName = (person: Person) => {
    return person.last_name
        ? `${person.first_name} ${person.last_name}`
        : person.first_name;
};

const defaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
};

const discountFromDefault = (defaultPrice: string, price: string) => {
    const defaultValue = Number(defaultPrice);
    const priceValue = Number(price);
    if (!defaultValue || !Number.isFinite(priceValue)) return "Set a price to see the discount.";
    return `${Math.max(0, ((defaultValue - priceValue) / defaultValue) * 100).toFixed(1)}% ${priceValue <= defaultValue ? "below" : "above"} the default price.`;
};

const includingVat = (price: string | number | null | undefined) =>
    price == null || price === "" ? "" : (Number(price) * 1.15).toFixed(2);

const COLOR_MAP: Record<string, string> = {
    // Grays / Neutrals
    gray: "#9ca3af", grey: "#9ca3af", silver: "#c0c0c0",
    white: "#e5e7eb", black: "#1f2937", charcoal: "#374151",
    // Reds
    red: "#ef4444", crimson: "#dc143c", maroon: "#7f1d1d",
    rose: "#f43f5e", pink: "#ec4899", coral: "#ff6b6b", salmon: "#fa8072",
    // Oranges / Yellows
    orange: "#f97316", amber: "#f59e0b", yellow: "#eab308",
    gold: "#d4af37", cream: "#fdf6c3", beige: "#d4b896",
    // Greens
    green: "#22c55e", lime: "#84cc16", olive: "#65a30d",
    teal: "#14b8a6", mint: "#6ee7b7", sage: "#87a878",
    // Blues
    blue: "#3b82f6", navy: "#1e3a5f", sky: "#0ea5e9",
    cyan: "#06b6d4", indigo: "#6366f1", cobalt: "#0047ab",
    // Purples / Violets
    purple: "#a855f7", violet: "#7c3aed", lavender: "#c4b5fd",
    magenta: "#d946ef", fuchsia: "#e879f9",
    // Browns / Earthy
    brown: "#78350f", tan: "#c8a97e", khaki: "#c3b091",
    caramel: "#c68642", chocolate: "#7b3f00",
};

const variantAccent = (label: string) => {
    // Label format: "Color / Size / Packaging" — color is always the first segment
    const colorName = label.split("/")[0].trim().toLowerCase();
    // Direct lookup
    if (COLOR_MAP[colorName]) return COLOR_MAP[colorName];
    // Partial match (e.g. "light gray", "dark blue")
    for (const [key, hex] of Object.entries(COLOR_MAP)) {
        if (colorName.includes(key)) return hex;
    }
    // Fallback: deterministic hash → one of a set of neutral-ish accents
    const fallbacks = ["#2563eb", "#7c3aed", "#db2777", "#0891b2", "#d97706", "#16a34a"];
    return fallbacks[[...label].reduce((t, c) => t + c.charCodeAt(0), 0) % fallbacks.length];
};

const bounce = keyframes`
    0%, 100% { transform: translateY(0); }
    20% { transform: translateY(-10px); }
    40% { transform: translateY(0); }
    60% { transform: translateY(-6px); }
    80% { transform: translateY(0); }
`;

export type StockLocationMode = 'store' | 'remote' | 'both';

// ─────────────────────────────────────────────────────────────────────────────
// Toast Component (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ open, message, severity, onClose }: {
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
    onClose: () => void;
}) {
    return (
        <Snackbar
            open={open}
            autoHideDuration={3000}
            onClose={onClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
            <Alert onClose={onClose} severity={severity} sx={{ width: "100%" }}>
                {message}
            </Alert>
        </Snackbar>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditDrawer – exactly as before (no changes needed)
// ─────────────────────────────────────────────────────────────────────────────
function EditDrawer({
    variant,
    customers,
    sellers,
    onClose,
    onSaved,
}: {
    variant: Variant;
    customers: Person[];
    sellers: Person[];
    onClose: () => void;
    onSaved: (updated: Variant) => void;
}) {
    const [tab, setTab] = useState(0);
    const [pricingSection, setPricingSection] = useState<"default" | "customer" | "seller">("default");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

    // ── Base price form ──────────────────────────────────────────────────────
    const [basePrice, setBasePrice] = useState(String(variant.price ?? ""));
    const [discountPrice, setDiscountPrice] = useState(String(variant.discount_price ?? ""));
    const [discountEndsAt, setDiscountEndsAt] = useState(variant.discount_ends_at?.substring(0, 10) ?? "");
    const [active, setActive] = useState(variant.active);

    // ── Local copies of price lists ──────────────────────────────────────
    const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>(variant.customer_prices);
    const [sellerPrices, setSellerPrices] = useState<SellerPrice[]>(variant.seller_prices);

    // ── Individual price state ───────────────────────────────────────────────
    const [indPrice, setIndPrice] = useState(String(variant.individual_price?.price ?? includingVat(variant.price)));
    const [indDiscount, setIndDiscount] = useState(String(variant.individual_price?.discount_price ?? includingVat(variant.discount_price)));
    const [indEndsAt, setIndEndsAt] = useState(variant.discount_ends_at?.substring(0, 10) ?? "");
    const [indActive, setIndActive] = useState(variant.individual_price?.active ?? true);
    const [individualPrice, setIndividualPrice] = useState<IndividualPrice | null>(variant.individual_price ?? null);

    // ── Add-customer-price form ──────────────────────────────────────────────
    const [cpCustomer, setCpCustomer] = useState("");
    const [cpPrice, setCpPrice] = useState("");
    const [cpDiscount, setCpDiscount] = useState("");
    const [cpEndsAt, setCpEndsAt] = useState("");

    // ── Add-seller-price form ────────────────────────────────────────────────
    const [spSeller, setSpSeller] = useState("");
    const [spPrice, setSpPrice] = useState("");
    const [spDiscount, setSpDiscount] = useState("");
    const [spEndsAt, setSpEndsAt] = useState("");

    const customerType = tab === 1 ? "individual" : "business";
    const defaultTierPrice = customerType === "business" ? basePrice : indPrice;
    const visibleCustomerPrices = customerPrices.filter(price =>
        customerType === "individual" ? Boolean(price.tin_number) : !price.tin_number
    );
    const eligibleCustomers = customers.filter(customer =>
        customerType === "individual" ? Boolean(customer.tin_number) : !customer.tin_number
    );
    const visibleSellerPrices = sellerPrices
        .map(sellerPrice => ({
            sellerPrice,
            tier: customerType === "individual" ? sellerPrice.individual : (sellerPrice.business ?? sellerPrice),
        }))
        .filter(({ tier }) => Boolean(tier));

    const showToast = (message: string, severity: "success" | "error") => {
        setToast({ open: true, message, severity });
    };

    const wrap = async (fn: () => Promise<void>, successMessage?: string) => {
        setSaving(true);
        setError(null);
        try {
            await fn();
            if (successMessage) {
                showToast(successMessage, "success");
            }
        } catch (e: any) {
            const errorMsg = e?.response?.data?.message ?? "Something went wrong.";
            setError(errorMsg);
            showToast(errorMsg, "error");
        } finally {
            setSaving(false);
        }
    };

    // Save base variant
    const saveBase = () => wrap(async () => {
        const { data } = await axios.patch(`/store-variants/${variant.id}`, {
            price: basePrice,
            discount_price: discountPrice || null,
            discount_ends_at: discountEndsAt || null,
            active,
        });

        if (data.variant) {
            onSaved(data.variant);
        } else {
            onSaved({
                ...variant,
                price: basePrice,
                discount_price: discountPrice || null,
                discount_ends_at: discountEndsAt || null,
                active,
                customer_prices: customerPrices,
                seller_prices: sellerPrices,
            });
        }
    }, "Base price saved successfully!");

    // Add / update customer price
    const addCustomerPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/customer-prices`, {
            customer_id: cpCustomer,
            customer_type: customerType,
            price: cpPrice,
            discount_price: cpDiscount || null,
            discount_ends_at: cpEndsAt || null,
        });
        const row: CustomerPrice = {
                id: data.id,
                customer_id: data.customer_id,
                customer_name: data.customer?.first_name
                    ? `${data.customer.first_name} ${data.customer.last_name ?? ''}`.trim()
                    : `Customer #${data.customer_id}`,
                tin_number: data.customer?.tin_number ?? null,
                customer_type: data.customer?.tin_number ? "individual" : "business",
                price: data.pricing_matrix?.price ?? data.price ?? 0,
                individual_price: null,
                business_price: null,
                discount_price: data.pricing_matrix?.discount_price ?? data.discount_price,
                discount_ends_at: data.pricing_matrix?.discount_ends_at ?? data.discount_ends_at,
        };
        const index = customerPrices.findIndex(price => price.customer_id === Number(cpCustomer));
        const next = index >= 0 ? customerPrices.map((price, currentIndex) => currentIndex === index ? row : price) : [...customerPrices, row];
        setCustomerPrices(next);
        onSaved({ ...variant, customer_prices: next, seller_prices: sellerPrices, individual_price: individualPrice });
        setCpCustomer(""); setCpPrice(""); setCpDiscount(""); setCpEndsAt("");
    }, "Customer price saved successfully!");

    // Delete customer price
    const deleteCustomerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-customer-prices/${id}`);
        const next = customerPrices.filter(cp => cp.id !== id);
        setCustomerPrices(next);
        onSaved({ ...variant, customer_prices: next, seller_prices: sellerPrices, individual_price: individualPrice });
    }, "Customer price deleted successfully!");

    // Add / update seller price
    const addSellerPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/seller-prices`, {
            seller_id: spSeller,
            customer_type: customerType,
            price: spPrice,
            discount_price: spDiscount || null,
            discount_ends_at: spEndsAt || null,
        });
        const row: SellerPrice = {
                id: data.id,
                seller_id: data.seller_id,
                seller_name: data.seller?.first_name
                    ? `${data.seller.first_name} ${data.seller.last_name ?? ''}`.trim()
                    : `Seller #${data.seller_id}`,
                price: data.pricing_matrix?.business?.price ?? data.pricing_matrix?.price ?? data.price,
                discount_price: data.pricing_matrix?.business?.discount_price ?? data.pricing_matrix?.discount_price ?? data.discount_price,
                discount_ends_at: data.pricing_matrix?.business?.discount_ends_at ?? data.pricing_matrix?.discount_ends_at ?? data.discount_ends_at,
                business: data.pricing_matrix?.business ?? (customerType === "business" ? data.pricing_matrix : null),
                individual: data.pricing_matrix?.individual ?? (customerType === "individual" ? data.pricing_matrix : null),
        };
        const index = sellerPrices.findIndex(price => price.seller_id === Number(spSeller));
        const next = index >= 0 ? sellerPrices.map((price, currentIndex) => currentIndex === index ? row : price) : [...sellerPrices, row];
        setSellerPrices(next);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: next, individual_price: individualPrice });
        setSpSeller(""); setSpPrice(""); setSpDiscount(""); setSpEndsAt("");
    }, "Seller price saved successfully!");

    // Delete seller price
    const deleteSellerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-seller-prices/${id}`, { data: { customer_type: customerType } });
        const next = sellerPrices.map(sellerPrice => sellerPrice.id !== id
            ? sellerPrice
            : { ...sellerPrice, [customerType]: null }
        ).filter(sellerPrice => sellerPrice.business || sellerPrice.individual || sellerPrice.id !== id);
        setSellerPrices(next);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: next, individual_price: individualPrice });
    }, "Seller price deleted successfully!");

    // Save / update individual price
    const saveIndividualPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/individual-price`, {
            price: indPrice,
            discount_price: indDiscount || null,
            discount_ends_at: indEndsAt || null,
            active: indActive,
        });
        setIndividualPrice(data);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: sellerPrices, individual_price: data });
    }, "Individual price saved successfully!");

    // Clear individual price override
    const clearIndividualPrice = () => wrap(async () => {
        await axios.delete(`/store-variant-individual-prices/${variant.id}`);
        setIndividualPrice(null);
        setIndPrice("");
        setIndDiscount("");
        setIndEndsAt("");
        setIndActive(true);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: sellerPrices, individual_price: null });
    }, "Individual price cleared!");

    return (
        <>
            <Drawer
                anchor="right"
                open
                onClose={onClose}
                PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, p: 0 } }}
            >
                {/* Header */}
                <Box sx={{ px: 3, py: 2, bgcolor: "grey.900", color: "white" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                            <Typography variant="h6" fontWeight={700}>{variant.label}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.6 }}>{variant.sku}</Typography>
                        </Box>
                        <IconButton onClick={onClose} sx={{ color: "white" }} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Stack>

                    <Tabs
                        value={tab}
                        onChange={(_, v) => {
                            setTab(v);
                            setPricingSection("default");
                        }}
                        textColor="inherit"
                        TabIndicatorProps={{ style: { backgroundColor: "#fff" } }}
                        sx={{ mt: 1 }}
                    >
                        <Tab label="Business" sx={{ fontSize: 12 }} />
                        <Tab label="Individual" sx={{ fontSize: 12 }} />
                    </Tabs>
                </Box>

                <Box sx={{ px: 3, py: 2, overflowY: "auto", flex: 1 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Tabs
                        value={pricingSection}
                        onChange={(_, section) => setPricingSection(section)}
                        variant="fullWidth"
                        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
                    >
                        <Tab value="default" label="Default Price" sx={{ fontSize: 12 }} />
                        <Tab value="customer" label="Customer Price" sx={{ fontSize: 12 }} />
                        <Tab value="seller" label="Seller Price" sx={{ fontSize: 12 }} />
                    </Tabs>

                    {/* ── TAB 0: Base Price ──────────────────────────────────────── */}
                    {tab === 0 && pricingSection === "default" && (
                        <Stack spacing={2.5} mt={1}>
                            <Typography variant="subtitle2" color="text.secondary">
                                Default business price for this active store variant. Individual prices are configured in the Individual tab.
                            </Typography>

                            <TextField
                                label="Default Business Price"
                                type="number"
                                value={basePrice}
                                onChange={e => setBasePrice(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth
                                size="small"
                            />
                            <TextField
                                label="Discount Price"
                                type="number"
                                value={discountPrice}
                                onChange={e => setDiscountPrice(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth
                                size="small"
                                helperText="Leave blank for no discount"
                            />
                            <TextField
                                label="Discount Ends At"
                                type="date"
                                value={discountEndsAt}
                                onChange={e => setDiscountEndsAt(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                size="small"
                            />

                            <FormControl size="small" fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={active ? "active" : "inactive"}
                                    label="Status"
                                    onChange={e => setActive(e.target.value === "active")}
                                >
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>

                            <Button
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                                onClick={saveBase}
                                disabled={saving}
                            >
                                Save Default Business Price
                            </Button>
                        </Stack>
                    )}

                    {tab === 1 && pricingSection === "default" && (
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: "success.50" }}>
                            <Typography variant="subtitle2" fontWeight={700} mb={0.5}>Default Individual Price</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                                Used for walk-in and individual customers unless they have a personal override.
                            </Typography>
                            <Stack spacing={1.5}>
                                <TextField label="Individual Price" type="number" value={indPrice} onChange={e => setIndPrice(e.target.value)} size="small" fullWidth InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                                <TextField label="Individual Discount Price" type="number" value={indDiscount} onChange={e => setIndDiscount(e.target.value)} size="small" fullWidth InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                                <TextField label="Discount Ends At" type="date" value={indEndsAt} InputLabelProps={{ shrink: true }} size="small" fullWidth disabled helperText="Matches the Default Business Price discount expiry." />
                                <FormControl size="small" fullWidth><InputLabel>Status</InputLabel><Select value={indActive ? "active" : "inactive"} label="Status" onChange={e => setIndActive(e.target.value === "active")}><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></Select></FormControl>
                                <Stack direction="row" spacing={1}><Button variant="contained" onClick={saveIndividualPrice} disabled={saving || !indPrice}>Save Default Individual Price</Button>{individualPrice && <Button color="inherit" onClick={clearIndividualPrice} disabled={saving}>Clear</Button>}</Stack>
                            </Stack>
                        </Paper>
                    )}

                    {/* ── Customer Prices ───────────────────────────────────────── */}
                    {pricingSection === "customer" && (
                        <Box mt={1}>
                            <Typography variant="subtitle2" color="text.secondary" mb={2}>
                                {customerType === "business"
                                    ? "Business customer price overrides for this variant."
                                    : "Individual customer price overrides for this variant."}
                            </Typography>

                            {visibleCustomerPrices.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                                    <Table size="small">
                                        <TableHead sx={{ bgcolor: "grey.50" }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Price</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Discount</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Ends</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {visibleCustomerPrices.map(cp => (
                                                <TableRow key={cp.id} hover>
                                                    <TableCell>{cp.customer_name}</TableCell>
                                                    <TableCell>{fmt(cp.price)}</TableCell>
                                                    <TableCell>{fmt(cp.discount_price)}</TableCell>
                                                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>
                                                        {cp.discount_ends_at?.substring(0, 10) ?? "—"}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Tooltip title="Delete">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => deleteCustomerPrice(cp.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    No {customerType} customer prices yet.
                                </Alert>
                            )}

                            <Divider sx={{ mb: 2 }} />
                            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                                Add / Update {customerType === "business" ? "Business" : "Individual"} Customer Price
                            </Typography>

                            <Stack spacing={2}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Customer</InputLabel>
                                    <Select
                                        value={cpCustomer}
                                        label="Customer"
                                        onChange={e => {
                                            setCpCustomer(String(e.target.value));
                                            setCpPrice(defaultTierPrice);
                                            setCpDiscount("");
                                            setCpEndsAt(defaultExpiryDate());
                                        }}
                                    >
                                        {eligibleCustomers.map(c => <MenuItem key={c.id} value={c.id}>{getPersonName(c)}</MenuItem>)}
                                    </Select>
                                </FormControl>

                                <TextField
                                    label={`${customerType === "business" ? "Business" : "Individual"} Customer Price`}
                                    type="number"
                                    value={cpPrice}
                                    onChange={e => setCpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Discount from the default: {discountFromDefault(defaultTierPrice, cpPrice)}
                                </Typography>
                                <TextField
                                    label="Discount Price"
                                    type="number"
                                    value={cpDiscount}
                                    onChange={e => setCpDiscount(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                    helperText="Leave blank for no discount"
                                />
                                <TextField
                                    label="Discount Ends At"
                                    type="date"
                                    value={cpEndsAt}
                                    onChange={e => setCpEndsAt(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    size="small"
                                    fullWidth
                                />
                                <Button
                                    variant="contained"
                                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                                    onClick={addCustomerPrice}
                                    disabled={saving || !cpCustomer || !cpPrice}
                                >
                                    Save {customerType === "business" ? "Business" : "Individual"} Price
                                </Button>
                            </Stack>
                        </Box>
                    )}

                    {/* ── TAB 2: Seller Prices ───────────────────────────────────── */}
                    {pricingSection === "seller" && (
                        <Box mt={1}>
                            <Typography variant="subtitle2" color="text.secondary" mb={2}>
                                {customerType === "business" ? "Business seller price overrides." : "Individual seller price overrides."}
                            </Typography>

                            {visibleSellerPrices.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                                    <Table size="small">
                                        <TableHead sx={{ bgcolor: "grey.50" }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700 }}>Seller</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Price</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Discount</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Ends</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {visibleSellerPrices.map(({ sellerPrice: sp, tier }) => (
                                                <TableRow key={sp.id} hover>
                                                    <TableCell>{sp.seller_name}</TableCell>
                                                    <TableCell>{fmt(tier?.price)}</TableCell>
                                                    <TableCell>{fmt(tier?.discount_price)}</TableCell>
                                                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>
                                                        {tier?.discount_ends_at?.substring(0, 10) ?? "—"}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Tooltip title="Delete">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => deleteSellerPrice(sp.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    No {customerType} seller prices yet.
                                </Alert>
                            )}

                            <Divider sx={{ mb: 2 }} />
                            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                                Add / Update {customerType === "business" ? "Business" : "Individual"} Seller Price
                            </Typography>

                            <Stack spacing={2}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Seller</InputLabel>
                                    <Select
                                        value={spSeller}
                                        label="Seller"
                                        onChange={e => {
                                            setSpSeller(String(e.target.value));
                                            setSpPrice(defaultTierPrice);
                                            setSpDiscount("");
                                            setSpEndsAt(defaultExpiryDate());
                                        }}
                                    >
                                        {sellers.map(s => (
                                            <MenuItem key={s.id} value={s.id}>
                                                {getPersonName(s)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label={`${customerType === "business" ? "Business" : "Individual"} Seller Price`}
                                    type="number"
                                    value={spPrice}
                                    onChange={e => setSpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Discount from the default: {discountFromDefault(defaultTierPrice, spPrice)}
                                </Typography>
                                <TextField
                                    label="Discount Price"
                                    type="number"
                                    value={spDiscount}
                                    onChange={e => setSpDiscount(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                    helperText="Leave blank for no discount"
                                />
                                <TextField
                                    label="Discount Ends At"
                                    type="date"
                                    value={spEndsAt}
                                    onChange={e => setSpEndsAt(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    size="small"
                                    fullWidth
                                />
                                <Button
                                    variant="contained"
                                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                                    onClick={addSellerPrice}
                                    disabled={saving || !spSeller || !spPrice}
                                >
                                    Save Seller Price
                                </Button>
                            </Stack>
                        </Box>
                    )}
                </Box>

                {/* Toast Component */}
                <Toast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast(prev => ({ ...prev, open: false }))}
                />
            </Drawer>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row — one inventory item row with collapsible variants (desktop)
// ─────────────────────────────────────────────────────────────────────────────
function DesktopRow({
    item,
    customers,
    sellers,
}: {
    item: InventoryItem;
    customers: Person[];
    sellers: Person[];
}) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Variant | null>(null);
    const [variants, setVariants] = useState<Variant[]>(item.variants);
    const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);

    const handleSaved = (updated: Variant) => {
        setVariants(prev => prev.map(v => v.id === updated.id ? updated : v));
        setEditing(null);
        setOpen(true);
        setHighlightedVariantId(updated.id);
        window.setTimeout(() => {
            document.getElementById(`variant-${updated.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        window.setTimeout(() => {
            setHighlightedVariantId(null);
            router.reload();
        }, 1900);
    };

    return (
        <>
            {/* Parent row */}
            <TableRow
                sx={{ "& > *": { borderBottom: "unset" } }}
                hover
                onClick={() => setOpen(o => !o)}
                style={{ cursor: "pointer" }}
            >
                <TableCell width={50}>
                    <IconButton size="small">
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{item.item_name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell align="center">
                    <Button size="small" variant="outlined" endIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />} onClick={event => { event.stopPropagation(); setOpen(value => !value); }}>
                        {open ? "Hide Variants" : `Show Variants (${item.total_variants})`}
                    </Button>
                </TableCell>
                <TableCell align="right">
                    <Typography
                        fontWeight="bold"
                        color={item.total_stock > 0 ? "success.main" : "error.main"}
                        sx={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}
                    >
                        {item.total_stock} Pieces
                    </Typography>
                </TableCell>
            </TableRow>

            {/* Collapsible variant detail */}
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ my: 1.5, mx: { xs: 0.5, sm: 1 }, bgcolor: "action.hover", p: { xs: 1, sm: 2 }, borderRadius: 2, maxWidth: "100%", overflow: "hidden" }}>
                            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                                Variants — {item.item_name}
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: "100%", overflowX: "auto" }}>
                                <Table size="small" sx={{ minWidth: 680 }}>
                                    <TableHead sx={{ bgcolor: "grey.50" }}>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Base Price</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Price Tiers</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Stock</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }} align="center">Edit</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {variants.map(v => {
                                            const hasDiscount = v.discount_price != null && Number(v.discount_price) < Number(v.price);
                                            const hasOverrides = (v.seller_prices && v.seller_prices.length > 0) ||
                                                (v.customer_prices && v.customer_prices.length > 0) ||
                                                Boolean(v.individual_price?.price);

                                            return (
                                                <TableRow key={v.id} id={`variant-${v.id}`} hover sx={highlightedVariantId === v.id ? { animation: `${bounce} 0.6s ease-in-out 3`, bgcolor: "primary.50" } : undefined}>
                                                    <TableCell sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                                                        {v.sku}
                                                    </TableCell>
                                                    <TableCell sx={{ fontWeight: 600 }}><Stack direction="row" alignItems="center" spacing={1}><Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: variantAccent(v.label), boxShadow: `0 0 0 3px ${variantAccent(v.label)}22` }} /><span>{v.label}</span></Stack></TableCell>
                                                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                                                        {hasDiscount ? (
                                                            <Stack direction="row" alignItems="baseline" spacing={0.75}>
                                                                <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main" }}>
                                                                    {fmt(v.discount_price)}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>
                                                                    {fmt(v.price)}
                                                                </Typography>
                                                            </Stack>
                                                        ) : (
                                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                                {fmt(v.price)}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {hasOverrides ? (
                                                            <Stack spacing={0.5}>
                                                                {v.seller_prices.map(sp => (
                                                                    <Stack key={`sp-${sp.id}`} direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                                                        <Chip
                                                                            label="Seller"
                                                                            size="small"
                                                                            sx={{ bgcolor: "#1e293b", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }}
                                                                        />
                                                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                                                            {fmt(sp.discount_price && Number(sp.discount_price) < Number(sp.price) ? sp.discount_price : sp.price)}
                                                                        </Typography>
                                                                        {sp.discount_price && Number(sp.discount_price) < Number(sp.price) && (
                                                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>
                                                                                {fmt(sp.price)}
                                                                            </Typography>
                                                                        )}
                                                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                                                            ({sp.seller_name})
                                                                        </Typography>
                                                                    </Stack>
                                                                ))}
                                                                {v.customer_prices.map(cp => (
                                                                    <Stack key={`cp-${cp.id}`} direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                                                        <Chip
                                                                            label="Customer"
                                                                            size="small"
                                                                            sx={{ bgcolor: "#6366f1", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }}
                                                                        />
                                                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                                                            {fmt(cp.discount_price && Number(cp.discount_price) < Number(cp.price) ? cp.discount_price : cp.price)}
                                                                        </Typography>
                                                                        {cp.discount_price && Number(cp.discount_price) < Number(cp.price) && (
                                                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>
                                                                                {fmt(cp.price)}
                                                                            </Typography>
                                                                        )}
                                                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                                                            ({cp.customer_name})
                                                                        </Typography>
                                                                    </Stack>
                                                                ))}
                                                                {v.individual_price?.price && (
                                                                    <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                                                        <Chip
                                                                            label="Individual"
                                                                            size="small"
                                                                            sx={{ bgcolor: "#059669", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }}
                                                                        />
                                                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                                                            {fmt(v.individual_price.discount_price && Number(v.individual_price.discount_price) < Number(v.individual_price.price) ? v.individual_price.discount_price : v.individual_price.price)}
                                                                        </Typography>
                                                                        {v.individual_price.discount_price && Number(v.individual_price.discount_price) < Number(v.individual_price.price) && (
                                                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>
                                                                                {fmt(v.individual_price.price)}
                                                                            </Typography>
                                                                        )}
                                                                    </Stack>
                                                                )}
                                                            </Stack>
                                                        ) : (
                                                            <Typography variant="caption" color="text.disabled">
                                                                —
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">{v.stock}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={v.active ? "Active" : "Inactive"}
                                                            size="small"
                                                            color={v.active ? "success" : "default"}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Stack direction="row" spacing={0.5} justifyContent="center">
                                                            <Tooltip title="Edit prices">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setEditing(v);
                                                                    }}
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Stack>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>

            {/* Edit Drawer */}
            {editing && (
                <EditDrawer
                    variant={editing}
                    customers={customers}
                    sellers={sellers}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// VariantCard — single variant collapsed by default, expands on click
// ─────────────────────────────────────────────────────────────────────────────
function VariantCard({
    v,
    hasDiscount,
    hasOverrides,
    highlighted,
    onEdit,
}: {
    v: Variant;
    hasDiscount: boolean;
    hasOverrides: boolean;
    highlighted: boolean;
    onEdit: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [stockLocation, setStockLocation] = useState<StockLocationMode>('store');

    const displayStock = stockLocation === 'remote'
        ? v.remote_stock
        : stockLocation === 'both'
            ? v.stock + v.remote_stock
            : v.stock;

    return (
        <Paper
            id={`variant-${v.id}`}
            variant="outlined"
            sx={{
                mb: 1.5,
                borderRadius: 2,
                overflow: "hidden",
                ...(highlighted ? { animation: `${bounce} 0.6s ease-in-out 3`, borderColor: "primary.main" } : {}),
            }}
        >
            {/* ── Collapsed header — always visible, click to expand ── */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                onClick={() => setOpen(o => !o)}
                sx={{ px: 1.5, py: 1.25, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", flex: "0 0 auto", bgcolor: variantAccent(v.label) }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ wordBreak: "break-word" }}>
                        {v.label}
                    </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                        label={v.active ? "Active" : "Inactive"}
                        size="small"
                        color={v.active ? "success" : "default"}
                        variant="outlined"
                    />
                    {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                </Stack>
            </Stack>

            {/* ── Expanded detail ── */}
            <Collapse in={open} timeout="auto" unmountOnExit>
                <Divider />
                <Stack spacing={1} sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }} alignItems="flex-end">
                        <Box>
                            <Typography variant="caption" color="text.secondary">SKU</Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{v.sku}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Base Price</Typography>
                            {hasDiscount ? (
                                <Stack direction="row" alignItems="baseline" spacing={0.5}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main" }}>{fmt(v.discount_price)}</Typography>
                                    <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>{fmt(v.price)}</Typography>
                                </Stack>
                            ) : (
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmt(v.price)}</Typography>
                            )}
                        </Box>
                    </Stack>

                    {/* ── Stock with location toggle ── */}
                    <Box sx={{ pt: 0.5 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                            <Box>
                                <Typography variant="caption" color="text.secondary" display="block">Stock</Typography>
                                <Typography variant="body1" fontWeight={700}>{displayStock}</Typography>
                            </Box>
                            <ToggleButtonGroup
                                size="small"
                                value={stockLocation}
                                exclusive
                                onChange={(_, val) => val && setStockLocation(val)}
                                onClick={e => e.stopPropagation()}
                                sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1, fontSize: "0.7rem" } }}
                            >
                                <ToggleButton value="store">Store</ToggleButton>
                                <ToggleButton value="remote">Remote</ToggleButton>
                                <ToggleButton value="both">Both</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>
                    </Box>

                    {hasOverrides && (
                        <Box sx={{ pt: 1, borderTop: "1px dashed #e2e8f0" }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                                Price Tiers:
                            </Typography>
                            <Stack spacing={0.5}>
                                {v.seller_prices.map(sp => (
                                    <Stack key={`sp-${sp.id}`} direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                        <Chip label="Seller" size="small" sx={{ bgcolor: "#1e293b", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                            {fmt(sp.discount_price && Number(sp.discount_price) < Number(sp.price) ? sp.discount_price : sp.price)}
                                        </Typography>
                                        {sp.discount_price && Number(sp.discount_price) < Number(sp.price) && (
                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>{fmt(sp.price)}</Typography>
                                        )}
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>({sp.seller_name})</Typography>
                                    </Stack>
                                ))}
                                {v.customer_prices.map(cp => (
                                    <Stack key={`cp-${cp.id}`} direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                        <Chip label="Customer" size="small" sx={{ bgcolor: "#6366f1", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                            {fmt(cp.discount_price && Number(cp.discount_price) < Number(cp.price) ? cp.discount_price : cp.price)}
                                        </Typography>
                                        {cp.discount_price && Number(cp.discount_price) < Number(cp.price) && (
                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>{fmt(cp.price)}</Typography>
                                        )}
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>({cp.customer_name})</Typography>
                                    </Stack>
                                ))}
                                {v.individual_price?.price && (
                                    <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                        <Chip label="Individual" size="small" sx={{ bgcolor: "#059669", color: "#fff", fontWeight: 700, fontSize: "0.62rem", height: 18 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                                            {fmt(v.individual_price.discount_price && Number(v.individual_price.discount_price) < Number(v.individual_price.price) ? v.individual_price.discount_price : v.individual_price.price)}
                                        </Typography>
                                        {v.individual_price.discount_price && Number(v.individual_price.discount_price) < Number(v.individual_price.price) && (
                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled", fontSize: "0.7rem" }}>{fmt(v.individual_price.price)}</Typography>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </Box>
                    )}

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={e => { e.stopPropagation(); onEdit(); }}
                        sx={{ alignSelf: "flex-end" }}
                    >
                        Edit Prices
                    </Button>
                </Stack>
            </Collapse>
        </Paper>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Mobile Card view — each inventory item as a card, with expandable variants
// ─────────────────────────────────────────────────────────────────────────────
function MobileCard({
    item,
    customers,
    sellers,
}: {
    item: InventoryItem;
    customers: Person[];
    sellers: Person[];
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState<Variant | null>(null);
    const [variants, setVariants] = useState<Variant[]>(item.variants);
    const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);

    const handleSaved = (updated: Variant) => {
        setVariants(prev => prev.map(v => v.id === updated.id ? updated : v));
        setEditing(null);
        setExpanded(true);
        setHighlightedVariantId(updated.id);
        window.setTimeout(() => {
            document.getElementById(`variant-${updated.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        window.setTimeout(() => {
            setHighlightedVariantId(null);
            router.reload();
        }, 1900);
    };

    return (
        <Card sx={{ mb: 2, borderRadius: 3 }}>
            <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{item.item_name}</Typography>
                        <Typography variant="body2" color="text.secondary">{item.category}</Typography>
                    </Box>
                    <Chip
                        label={`${item.total_variants} variants`}
                        size="small"
                        variant="outlined"
                    />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
                    <Typography variant="body2" color="text.secondary">Total Stock</Typography>
                    <Typography fontWeight="bold" color={item.total_stock > 0 ? "success.main" : "error.main"}>
                        {item.total_stock} Pieces
                    </Typography>
                </Stack>
            </CardContent>
            <CardActions sx={{ pt: 0 }}>
                <Button
                    size="small"
                    onClick={() => setExpanded(!expanded)}
                    endIcon={expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                >
                    {expanded ? "Hide Variants" : "Show Variants"}
                </Button>
            </CardActions>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Divider />
                <Box sx={{ p: 2 }}>
                    {variants.map(v => {
                        const hasDiscount = v.discount_price && Number(v.discount_price) > 0 && Number(v.discount_price) < Number(v.price);
                        const hasOverrides = (v.seller_prices && v.seller_prices.length > 0) ||
                            (v.customer_prices && v.customer_prices.length > 0) ||
                            Boolean(v.individual_price?.price);

                        return (
                            <VariantCard
                                key={v.id}
                                v={v}
                                hasDiscount={hasDiscount}
                                hasOverrides={hasOverrides}
                                highlighted={highlightedVariantId === v.id}
                                onEdit={() => setEditing(v)}
                            />
                        );
                    })}
                </Box>
            </Collapse>

            {editing && (
                <EditDrawer
                    variant={editing}
                    customers={customers}
                    sellers={sellers}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                />
            )}
        </Card>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination component using MUI Pagination + Inertia
// ─────────────────────────────────────────────────────────────────────────────
function InventoryPagination({ meta, links }: { meta: PaginationMeta; links: PaginationLink[] }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const handlePageChange = (event: React.ChangeEvent<unknown>, page: number) => {
        if (page === meta.current_page) return;
        // Find the link for that page number
        const link = links.find(l => l.label === String(page) && !l.active);
        if (link && link.url) {
            router.get(link.url, {}, { preserveState: true, preserveScroll: true });
        }
    };

    // If only one page, don't render
    if (meta.last_page <= 1) return null;

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
                count={meta.last_page}
                page={meta.current_page}
                onChange={handlePageChange}
                color="primary"
                size={isMobile ? "small" : "medium"}
                showFirstButton={!isMobile}
                showLastButton={!isMobile}
            />
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function StoreInventory({ store, inventory, customers = [], sellers = [] }: Props) {
    console.log("[StoreInventory] Rendering with store:", store?.name);
    console.log("[StoreInventory] RAW INVENTORY DUMP:", inventory);
    console.log("[StoreInventory] inventory type:", Array.isArray(inventory) ? 'array' : 'paginated');

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Normalize inventory data: if it's an array, wrap as paginated with single page
    let items: InventoryItem[] = [];
    let meta: PaginationMeta | null = null;
    let links: PaginationLink[] = [];

    if (Array.isArray(inventory)) {
        items = inventory;
        // Generate fake pagination meta for single page
        meta = {
            current_page: 1,
            from: 1,
            last_page: 1,
            per_page: items.length,
            to: items.length,
            total: items.length,
        };
        links = [
            { url: null, label: '&laquo; Previous', active: false },
            { url: '#', label: '1', active: true },
            { url: null, label: 'Next &raquo;', active: false },
        ];
        console.log("[StoreInventory] Inventory is an array, using single page");
    } else {
        // Assume it's PaginatedData from Laravel Resource or raw LengthAwarePaginator
        const paginated = inventory as any;
        items = paginated.data || [];
        meta = paginated.meta || (paginated.current_page !== undefined ? {
            current_page: paginated.current_page,
            from: paginated.from,
            last_page: paginated.last_page,
            per_page: paginated.per_page,
            to: paginated.to,
            total: paginated.total,
        } : null);
        links = (paginated.meta && paginated.meta.links) || paginated.links || [];
        console.log("[StoreInventory] Inventory is paginated, total items:", items.length, "meta:", meta);
    }

    return (
        <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: "100%", overflowX: "hidden" }}>
            <Head title={`${store?.name} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3} flexWrap="wrap">
                <Button
                    component={Link}
                    href={route("store.index")}
                    startIcon={<ArrowBackIcon />}
                    variant="outlined"
                >
                    Back
                </Button>
                <Box>
                    <Typography variant="h4" fontWeight={800}>{store?.name}</Typography>
                    {store?.location && (
                        <Typography variant="body2" color="text.secondary">{store.location}</Typography>
                    )}
                </Box>
                <Chip
                    label={store?.status}
                    color={store?.status === "active" ? "success" : "default"}
                    variant="outlined"
                    size="small"
                />
            </Stack>

            {items.length === 0 ? (
                <Alert severity="info">This store has no inventory yet.</Alert>
            ) : (
                <>
                    {/* Desktop/Tablet: Table view with horizontal scroll if needed */}
                    {!isMobile ? (
                        <TableContainer
                            component={Paper}
                            elevation={0}
                            sx={{ border: "1px solid #e0e0e0", borderRadius: 3, maxWidth: "100%", overflowX: 'auto' }}
                        >
                            <Table aria-label="store inventory">
                                <TableHead sx={{ bgcolor: "grey.50" }}>
                                    <TableRow>
                                        <TableCell />
                                        <TableCell sx={{ fontWeight: "bold" }}>Product Name</TableCell>
                                        <TableCell sx={{ fontWeight: "bold" }}>Category</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: "bold" }}>Variants</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: "bold" }}>Total Stock</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(item => (
                                        <DesktopRow
                                            key={item.item_id}
                                            item={item}
                                            customers={customers}
                                            sellers={sellers}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        // Mobile: Card view
                        <Box>
                            {items.map(item => (
                                <MobileCard
                                    key={item.item_id}
                                    item={item}
                                    customers={customers}
                                    sellers={sellers}
                                />
                            ))}
                        </Box>
                    )}

                    {/* Pagination */}
                    {meta && (
                        <InventoryPagination meta={meta} links={links} />
                    )}
                </>
            )}
        </Box>
    );
}

StoreInventory.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
