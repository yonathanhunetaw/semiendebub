import React, { useMemo, useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Stack, Chip,
    IconButton, Collapse, Drawer, Divider, TextField, MenuItem,
    Select, FormControl, InputLabel, Tooltip, Alert, CircularProgress,
    Tabs, Tab, InputAdornment, Snackbar, Pagination, useMediaQuery,
    useTheme, Card, CardContent, Slider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import MicIcon from "@mui/icons-material/Mic";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import RuleSettingsIcon from "@mui/icons-material/Rule";
import StyleIcon from "@mui/icons-material/Style";
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
    min_reorder?: number;
    target_cap?: number;
    incoming_transfer?: { qty: number; from?: string } | null;
}

interface InventoryItem {
    item_id: number;
    item_name: string;
    category: string;
    starting_price: number;
    total_variants: number;
    total_stock: number;
    remote_total_stock: number;
    warehouse_a_stock?: number;
    warehouse_b_stock?: number;
    variants: Variant[];
}

interface Person {
    id: number;
    first_name: string;
    last_name?: string;
    tin_number?: string | null;
}

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
    inventory: PaginatedData<InventoryItem> | InventoryItem[];
    customers: Person[];
    sellers: Person[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v: string | number | null | undefined) =>
    v != null && v !== "" ? `$${Number(v).toFixed(2)}` : "—";

const getPersonName = (person: Person) =>
    person.last_name ? `${person.first_name} ${person.last_name}` : person.first_name;

const defaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
};

const discountFromDefault = (defaultPrice: string, price: string) => {
    const defaultValue = Number(defaultPrice);
    const priceValue = Number(price);
    if (!defaultValue || !Number.isFinite(priceValue)) return "Set a price to see the discount.";
    return `${Math.max(0, ((defaultValue - priceValue) / defaultValue) * 100).toFixed(1)}% ${
        priceValue <= defaultValue ? "below" : "above"
    } the default price.`;
};

const includingVat = (price: string | number | null | undefined) =>
    price == null || price === "" ? "" : (Number(price) * 1.15).toFixed(2);

function variantTierSummary(v: Variant) {
    const businessDefault = Number(v.price ?? 0);
    const individualDefault = Number(v.individual_price?.price ?? v.price ?? 0);

    const sellerBusiness = v.seller_prices.find(sp => sp.business)?.business ?? null;
    const sellerIndividual = v.seller_prices.find(sp => sp.individual)?.individual ?? null;

    const custBusiness = v.customer_prices.find(cp => !cp.tin_number);
    const custIndividual = v.customer_prices.find(cp => Boolean(cp.tin_number));

    const pick = (override: PriceTier | CustomerPrice | null, fallback: number) => {
        if (!override) return { price: fallback, list: null as number | null };
        const overridePrice = Number(override.price ?? fallback);
        const overrideDiscount = override.discount_price != null ? Number(override.discount_price) : null;
        if (overrideDiscount != null && overrideDiscount < overridePrice) {
            return { price: overrideDiscount, list: overridePrice };
        }
        return { price: overridePrice, list: null };
    };

    const businessBase = businessDefault;
    const businessCustomer = pick(custBusiness ?? null, businessDefault);
    const businessSeller = pick(sellerBusiness, businessDefault);

    const individualBase = individualDefault;
    const individualCustomer = pick(custIndividual ?? null, individualDefault);
    const individualSeller = pick(sellerIndividual, individualDefault);

    return {
        business: { base: businessBase, customer: businessCustomer, seller: businessSeller },
        individual: { base: individualBase, customer: individualCustomer, seller: individualSeller },
    };
}

function decomposeStock(stock: number, multiplier: number) {
    const perBox = Math.max(1, multiplier || 12);
    const perCarton = perBox * 10;
    const cartons = Math.floor(stock / perCarton);
    const afterCartons = stock - cartons * perCarton;
    const boxes = Math.floor(afterCartons / perBox);
    const pieces = afterCartons - boxes * perBox;
    return { cartons, boxes, pieces, perBox, perCarton };
}

type PkgMode = "pieces" | "boxes" | "cartons";

const packagingGroupKey = (label: string) => {
    const parts = label.split("/").map(s => s.trim());
    return parts.length > 1 ? parts.slice(0, -1).join(" / ") : label;
};

const COLOR_MAP: Record<string, string> = {
    gray: "#9ca3af", grey: "#9ca3af", silver: "#c0c0c0",
    white: "#e5e7eb", black: "#1f2937", charcoal: "#374151",
    red: "#ef4444", crimson: "#dc143c", maroon: "#7f1d1d",
    rose: "#f43f5e", pink: "#ec4899", coral: "#ff6b6b", salmon: "#fa8072",
    orange: "#f97316", amber: "#f59e0b", yellow: "#eab308",
    gold: "#d4af37", cream: "#fdf6c3", beige: "#d4b896",
    green: "#22c55e", lime: "#84cc16", olive: "#65a30d",
    teal: "#14b8a6", mint: "#6ee7b7", sage: "#87a878",
    blue: "#3b82f6", navy: "#1e3a5f", sky: "#0ea5e9",
    cyan: "#06b6d4", indigo: "#6366f1", cobalt: "#0047ab",
    purple: "#a855f7", violet: "#7c3aed", lavender: "#c4b5fd",
    magenta: "#d946ef", fuchsia: "#e879f9",
    brown: "#78350f", tan: "#c8a97e", khaki: "#c3b091",
    caramel: "#c68642", chocolate: "#7b3f00",
};

const variantAccent = (label: string) => {
    const colorName = label.split("/")[0].trim().toLowerCase();
    if (COLOR_MAP[colorName]) return COLOR_MAP[colorName];
    for (const [key, hex] of Object.entries(COLOR_MAP)) {
        if (colorName.includes(key)) return hex;
    }
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

export type StockLocationMode = "store" | "remote" | "both";

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ open, message, severity, onClose }: {
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
    onClose: () => void;
}) {
    return (
        <Snackbar open={open} autoHideDuration={3000} onClose={onClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
            <Alert onClose={onClose} severity={severity} sx={{ width: "100%" }}>{message}</Alert>
        </Snackbar>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditDrawer
// ─────────────────────────────────────────────────────────────────────────────
function EditDrawer({
    variant, customers, sellers, onClose, onSaved,
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

    const [basePrice, setBasePrice] = useState(String(variant.price ?? ""));
    const [discountPrice, setDiscountPrice] = useState(String(variant.discount_price ?? ""));
    const [discountEndsAt, setDiscountEndsAt] = useState(variant.discount_ends_at?.substring(0, 10) ?? "");
    const [active, setActive] = useState(variant.active);

    const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>(variant.customer_prices);
    const [sellerPrices, setSellerPrices] = useState<SellerPrice[]>(variant.seller_prices);

    const [indPrice, setIndPrice] = useState(String(variant.individual_price?.price ?? includingVat(variant.price)));
    const [indDiscount, setIndDiscount] = useState(String(variant.individual_price?.discount_price ?? includingVat(variant.discount_price)));
    const [indEndsAt, setIndEndsAt] = useState(variant.discount_ends_at?.substring(0, 10) ?? "");
    const [indActive, setIndActive] = useState(variant.individual_price?.active ?? true);
    const [individualPrice, setIndividualPrice] = useState<IndividualPrice | null>(variant.individual_price ?? null);

    const [cpCustomer, setCpCustomer] = useState("");
    const [cpPrice, setCpPrice] = useState("");
    const [cpDiscount, setCpDiscount] = useState("");
    const [cpEndsAt, setCpEndsAt] = useState("");

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

    const showToast = (message: string, severity: "success" | "error") =>
        setToast({ open: true, message, severity });

    const wrap = async (fn: () => Promise<void>, successMessage?: string) => {
        setSaving(true);
        setError(null);
        try {
            await fn();
            if (successMessage) showToast(successMessage, "success");
        } catch (e: any) {
            const errorMsg = e?.response?.data?.message ?? "Something went wrong.";
            setError(errorMsg);
            showToast(errorMsg, "error");
        } finally {
            setSaving(false);
        }
    };

    const saveBase = () => wrap(async () => {
        const { data } = await axios.patch(`/store-variants/${variant.id}`, {
            price: basePrice, discount_price: discountPrice || null,
            discount_ends_at: discountEndsAt || null, active,
        });
        if (data.variant) onSaved(data.variant);
        else onSaved({ ...variant, price: basePrice, discount_price: discountPrice || null,
            discount_ends_at: discountEndsAt || null, active, customer_prices: customerPrices, seller_prices: sellerPrices });
    }, "Base price saved successfully!");

    const addCustomerPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/customer-prices`, {
            customer_id: cpCustomer, customer_type: customerType, price: cpPrice,
            discount_price: cpDiscount || null, discount_ends_at: cpEndsAt || null,
        });
        const row: CustomerPrice = {
            id: data.id, customer_id: data.customer_id,
            customer_name: data.customer?.first_name
                ? `${data.customer.first_name} ${data.customer.last_name ?? ""}`.trim()
                : `Customer #${data.customer_id}`,
            tin_number: data.customer?.tin_number ?? null,
            customer_type: data.customer?.tin_number ? "individual" : "business",
            price: data.pricing_matrix?.price ?? data.price ?? 0,
            individual_price: null, business_price: null,
            discount_price: data.pricing_matrix?.discount_price ?? data.discount_price,
            discount_ends_at: data.pricing_matrix?.discount_ends_at ?? data.discount_ends_at,
        };
        const index = customerPrices.findIndex(p => p.customer_id === Number(cpCustomer));
        const next = index >= 0 ? customerPrices.map((p, i) => (i === index ? row : p)) : [...customerPrices, row];
        setCustomerPrices(next);
        onSaved({ ...variant, customer_prices: next, seller_prices: sellerPrices, individual_price: individualPrice });
        setCpCustomer(""); setCpPrice(""); setCpDiscount(""); setCpEndsAt("");
    }, "Customer price saved successfully!");

    const deleteCustomerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-customer-prices/${id}`);
        const next = customerPrices.filter(cp => cp.id !== id);
        setCustomerPrices(next);
        onSaved({ ...variant, customer_prices: next, seller_prices: sellerPrices, individual_price: individualPrice });
    }, "Customer price deleted successfully!");

    const addSellerPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/seller-prices`, {
            seller_id: spSeller, customer_type: customerType, price: spPrice,
            discount_price: spDiscount || null, discount_ends_at: spEndsAt || null,
        });
        const row: SellerPrice = {
            id: data.id, seller_id: data.seller_id,
            seller_name: data.seller?.first_name
                ? `${data.seller.first_name} ${data.seller.last_name ?? ""}`.trim()
                : `Seller #${data.seller_id}`,
            price: data.pricing_matrix?.business?.price ?? data.pricing_matrix?.price ?? data.price,
            discount_price: data.pricing_matrix?.business?.discount_price ?? data.pricing_matrix?.discount_price ?? data.discount_price,
            discount_ends_at: data.pricing_matrix?.business?.discount_ends_at ?? data.pricing_matrix?.discount_ends_at ?? data.discount_ends_at,
            business: data.pricing_matrix?.business ?? (customerType === "business" ? data.pricing_matrix : null),
            individual: data.pricing_matrix?.individual ?? (customerType === "individual" ? data.pricing_matrix : null),
        };
        const index = sellerPrices.findIndex(p => p.seller_id === Number(spSeller));
        const next = index >= 0 ? sellerPrices.map((p, i) => (i === index ? row : p)) : [...sellerPrices, row];
        setSellerPrices(next);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: next, individual_price: individualPrice });
        setSpSeller(""); setSpPrice(""); setSpDiscount(""); setSpEndsAt("");
    }, "Seller price saved successfully!");

    const deleteSellerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-seller-prices/${id}`, { data: { customer_type: customerType } });
        const next = sellerPrices
            .map(sp => (sp.id !== id ? sp : { ...sp, [customerType]: null }))
            .filter(sp => sp.business || sp.individual || sp.id !== id);
        setSellerPrices(next);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: next, individual_price: individualPrice });
    }, "Seller price deleted successfully!");

    const saveIndividualPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/individual-price`, {
            price: indPrice, discount_price: indDiscount || null,
            discount_ends_at: indEndsAt || null, active: indActive,
        });
        setIndividualPrice(data);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: sellerPrices, individual_price: data });
    }, "Individual price saved successfully!");

    const clearIndividualPrice = () => wrap(async () => {
        await axios.delete(`/store-variant-individual-prices/${variant.id}`);
        setIndividualPrice(null); setIndPrice(""); setIndDiscount(""); setIndEndsAt(""); setIndActive(true);
        onSaved({ ...variant, customer_prices: customerPrices, seller_prices: sellerPrices, individual_price: null });
    }, "Individual price cleared!");

    return (
        <>
            <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, p: 0 } }}>
                <Box sx={{ px: 3, py: 2, bgcolor: "grey.900", color: "white" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                            <Typography variant="h6" fontWeight={700}>{variant.label}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.6 }}>{variant.sku}</Typography>
                        </Box>
                        <IconButton onClick={onClose} sx={{ color: "white" }} size="small"><CloseIcon /></IconButton>
                    </Stack>
                    <Tabs value={tab}
                        onChange={(_, v) => { setTab(v); setPricingSection("default"); }}
                        textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: "#fff" } }} sx={{ mt: 1 }}>
                        <Tab label="Business" sx={{ fontSize: 12 }} />
                        <Tab label="Individual" sx={{ fontSize: 12 }} />
                    </Tabs>
                </Box>

                <Box sx={{ px: 3, py: 2, overflowY: "auto", flex: 1 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Tabs value={pricingSection} onChange={(_, s) => setPricingSection(s)} variant="fullWidth"
                        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
                        <Tab value="default" label="Default Price" sx={{ fontSize: 12 }} />
                        <Tab value="customer" label="Customer Price" sx={{ fontSize: 12 }} />
                        <Tab value="seller" label="Seller Price" sx={{ fontSize: 12 }} />
                    </Tabs>

                    {tab === 0 && pricingSection === "default" && (
                        <Stack spacing={2.5} mt={1}>
                            <Typography variant="subtitle2" color="text.secondary">
                                Default business price for this active store variant. Individual prices are configured in the Individual tab.
                            </Typography>
                            <TextField label="Default Business Price" type="number" value={basePrice}
                                onChange={e => setBasePrice(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth size="small" />
                            <TextField label="Discount Price" type="number" value={discountPrice}
                                onChange={e => setDiscountPrice(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth size="small" helperText="Leave blank for no discount" />
                            <TextField label="Discount Ends At" type="date" value={discountEndsAt}
                                onChange={e => setDiscountEndsAt(e.target.value)}
                                InputLabelProps={{ shrink: true }} fullWidth size="small" />
                            <FormControl size="small" fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={active ? "active" : "inactive"} label="Status"
                                    onChange={e => setActive(e.target.value === "active")}>
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                            <Button variant="contained"
                                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                                onClick={saveBase} disabled={saving}>
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
                                <TextField label="Individual Price" type="number" value={indPrice}
                                    onChange={e => setIndPrice(e.target.value)} size="small" fullWidth
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                                <TextField label="Individual Discount Price" type="number" value={indDiscount}
                                    onChange={e => setIndDiscount(e.target.value)} size="small" fullWidth
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                                <TextField label="Discount Ends At" type="date" value={indEndsAt}
                                    InputLabelProps={{ shrink: true }} size="small" fullWidth disabled
                                    helperText="Matches the Default Business Price discount expiry." />
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Status</InputLabel>
                                    <Select value={indActive ? "active" : "inactive"} label="Status"
                                        onChange={e => setIndActive(e.target.value === "active")}>
                                        <MenuItem value="active">Active</MenuItem>
                                        <MenuItem value="inactive">Inactive</MenuItem>
                                    </Select>
                                </FormControl>
                                <Stack direction="row" spacing={1}>
                                    <Button variant="contained" onClick={saveIndividualPrice} disabled={saving || !indPrice}>
                                        Save Default Individual Price
                                    </Button>
                                    {individualPrice && (
                                        <Button color="inherit" onClick={clearIndividualPrice} disabled={saving}>Clear</Button>
                                    )}
                                </Stack>
                            </Stack>
                        </Paper>
                    )}

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
                                                            <IconButton size="small" color="error"
                                                                onClick={() => deleteCustomerPrice(cp.id)}>
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
                                    <Select value={cpCustomer} label="Customer"
                                        onChange={e => {
                                            setCpCustomer(String(e.target.value));
                                            setCpPrice(defaultTierPrice);
                                            setCpDiscount("");
                                            setCpEndsAt(defaultExpiryDate());
                                        }}>
                                        {eligibleCustomers.map(c => (
                                            <MenuItem key={c.id} value={c.id}>{getPersonName(c)}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField label={`${customerType === "business" ? "Business" : "Individual"} Customer Price`}
                                    type="number" value={cpPrice} onChange={e => setCpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small" fullWidth />
                                <Typography variant="caption" color="text.secondary">
                                    Discount from the default: {discountFromDefault(defaultTierPrice, cpPrice)}
                                </Typography>
                                <TextField label="Discount Price" type="number" value={cpDiscount}
                                    onChange={e => setCpDiscount(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small" fullWidth helperText="Leave blank for no discount" />
                                <TextField label="Discount Ends At" type="date" value={cpEndsAt}
                                    onChange={e => setCpEndsAt(e.target.value)} InputLabelProps={{ shrink: true }}
                                    size="small" fullWidth />
                                <Button variant="contained"
                                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                                    onClick={addCustomerPrice} disabled={saving || !cpCustomer || !cpPrice}>
                                    Save {customerType === "business" ? "Business" : "Individual"} Price
                                </Button>
                            </Stack>
                        </Box>
                    )}

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
                                                            <IconButton size="small" color="error"
                                                                onClick={() => deleteSellerPrice(sp.id)}>
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
                                    <Select value={spSeller} label="Seller"
                                        onChange={e => {
                                            setSpSeller(String(e.target.value));
                                            setSpPrice(defaultTierPrice);
                                            setSpDiscount("");
                                            setSpEndsAt(defaultExpiryDate());
                                        }}>
                                        {sellers.map(s => <MenuItem key={s.id} value={s.id}>{getPersonName(s)}</MenuItem>)}
                                    </Select>
                                </FormControl>
                                <TextField label={`${customerType === "business" ? "Business" : "Individual"} Seller Price`}
                                    type="number" value={spPrice} onChange={e => setSpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small" fullWidth />
                                <Typography variant="caption" color="text.secondary">
                                    Discount from the default: {discountFromDefault(defaultTierPrice, spPrice)}
                                </Typography>
                                <TextField label="Discount Price" type="number" value={spDiscount}
                                    onChange={e => setSpDiscount(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small" fullWidth helperText="Leave blank for no discount" />
                                <TextField label="Discount Ends At" type="date" value={spEndsAt}
                                    onChange={e => setSpEndsAt(e.target.value)} InputLabelProps={{ shrink: true }}
                                    size="small" fullWidth />
                                <Button variant="contained"
                                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                                    onClick={addSellerPrice} disabled={saving || !spSeller || !spPrice}>
                                    Save Seller Price
                                </Button>
                            </Stack>
                        </Box>
                    )}
                </Box>

                <Toast open={toast.open} message={toast.message} severity={toast.severity}
                    onClose={() => setToast(prev => ({ ...prev, open: false }))} />
            </Drawer>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// StockBreakdownPanel
// ─────────────────────────────────────────────────────────────────────────────
type StockLocationKey = "store" | "remote" | "whseA" | "whseB" | "all";

function StockBreakdownPanel({ item, variants }: { item: InventoryItem; variants: Variant[] }) {
    const [location, setLocation] = useState<StockLocationKey>("store");
    const [pkgMode, setPkgMode] = useState<PkgMode>("cartons");

    const perBox = variants[0]?.multiplier ?? 12;
    const perCarton = perBox * 10;

    const storeStock = item.total_stock;
    const remoteStock = item.remote_total_stock;
    const whseAStock = item.warehouse_a_stock ?? 0;
    const whseBStock = item.warehouse_b_stock ?? 0;
    const allStock = storeStock + remoteStock + whseAStock + whseBStock;

    const stockByLoc: Record<StockLocationKey, number> = {
        store: storeStock, remote: remoteStock,
        whseA: whseAStock, whseB: whseBStock,
        all: allStock,
    };
    const current = stockByLoc[location];

    const fullCartons = Math.floor(current / perCarton);
    const remAfterCartons = current % perCarton;
    const boxesInRem = Math.floor(remAfterCartons / perBox);
    const loosePcs = remAfterCartons % perBox;
    const fullBoxes = Math.floor(current / perBox);
    const looseFromBoxes = current % perBox;

    const bulkPcs = fullCartons * perCarton;
    const sealedPcs = boxesInRem * perBox;
    const bulkPct = current > 0 ? Math.round((bulkPcs / current) * 100) : 0;
    const sealedPct = current > 0 ? Math.round((sealedPcs / current) * 100) : 0;
    const loosePct = current > 0 ? Math.max(0, 100 - bulkPct - sealedPct) : 0;

    const heading =
        pkgMode === "cartons"
            ? `${fullCartons} Carton${fullCartons === 1 ? "" : "s"}, ${boxesInRem} Box${boxesInRem === 1 ? "" : "es"}, ${loosePcs} Piece${loosePcs === 1 ? "" : "s"}`
            : pkgMode === "boxes"
                ? `${fullBoxes} Box${fullBoxes === 1 ? "" : "es"}, ${looseFromBoxes} Piece${looseFromBoxes === 1 ? "" : "s"}`
                : `${current} Total Loose Units`;

    const math =
        pkgMode === "cartons"
            ? `${fullCartons} × ${perCarton} + ${boxesInRem} × ${perBox} + ${loosePcs} = ${current} pcs total`
            : pkgMode === "boxes"
                ? `${fullBoxes} × ${perBox} + ${looseFromBoxes} = ${current} pcs total`
                : `Granular count: ${current} individual units`;

    const locations: { key: StockLocationKey; label: string; count: number; tone: string }[] = [
        { key: "store", label: "Store Shelf", count: storeStock, tone: "success.main" },
        { key: "remote", label: "Remote Whse", count: remoteStock, tone: "info.main" },
        { key: "whseA", label: "Warehouse A", count: whseAStock, tone: "primary.main" },
        { key: "whseB", label: "Warehouse B", count: whseBStock, tone: "grey.500" },
        { key: "all", label: "All Locations", count: allStock, tone: "grey.900" },
    ];

    const NodeCard = ({ label, count, tone }: { label: string; count: number; tone: string }) => {
        const d = decomposeStock(count, perBox);
        return (
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2,
                borderLeft: "3px solid", borderLeftColor: tone }}>
                <Typography variant="caption" fontWeight={700} display="block">{label}</Typography>
                <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2, mt: 0.25 }}>
                    {count}
                    <Typography component="span" variant="caption"
                        color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>pcs</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary"
                    sx={{ fontFamily: "monospace", fontSize: "0.62rem" }}>
                    {d.cartons} Ctn • {d.boxes} Bx • {d.pieces} Pcs
                </Typography>
            </Paper>
        );
    };

    return (
        <Stack spacing={1.75}>
            <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary"
                        sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                        Select Location
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {locations.filter(l => l.count > 0).length} Locations Active
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: 0.5,
                    "&::-webkit-scrollbar": { display: "none" } }}>
                    {locations.map(l => {
                        const active = location === l.key;
                        return (
                            <Paper key={l.key} variant="outlined" onClick={() => setLocation(l.key)}
                                sx={{
                                    flex: "0 0 auto", px: 1.25, py: 0.75, borderRadius: 2,
                                    cursor: "pointer", minWidth: 92,
                                    bgcolor: active ? "grey.900" : "background.paper",
                                    color: active ? "#fff" : "text.primary",
                                    borderColor: active ? "grey.900" : "divider",
                                }}>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Box sx={{ width: 6, height: 6, borderRadius: "50%",
                                        bgcolor: active ? "#fff" : l.tone }} />
                                    <Typography variant="caption"
                                        sx={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
                                            color: active ? "rgba(255,255,255,0.75)" : "text.secondary" }}>
                                        {l.label}
                                    </Typography>
                                </Stack>
                                <Typography sx={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.85rem", mt: 0.25 }}>
                                    {l.count}
                                    <Typography component="span"
                                        sx={{ fontSize: "0.6rem", fontWeight: 400, ml: 0.5,
                                            color: active ? "rgba(255,255,255,0.6)" : "text.secondary" }}>
                                        pcs
                                    </Typography>
                                </Typography>
                            </Paper>
                        );
                    })}
                </Stack>
            </Box>

            <Box sx={{ bgcolor: "grey.100", p: 0.5, borderRadius: 2, display: "flex", gap: 0.5 }}>
                {(["cartons", "boxes", "pieces"] as PkgMode[]).map(m => {
                    const active = pkgMode === m;
                    const label = m === "cartons" ? `Cartons (${perCarton}s)`
                        : m === "boxes" ? `Boxes (${perBox}s)` : "Pieces (Pcs)";
                    return (
                        <Button key={m} fullWidth size="small" disableElevation
                            onClick={() => setPkgMode(m)}
                            variant={active ? "contained" : "text"}
                            sx={{
                                py: 0.5, fontSize: "0.7rem", textTransform: "none", fontWeight: 700,
                                bgcolor: active ? "background.paper" : "transparent",
                                color: active ? "text.primary" : "text.secondary",
                                "&:hover": { bgcolor: active ? "background.paper" : "grey.200" },
                            }}>
                            {label}
                        </Button>
                    );
                })}
            </Box>

            <Paper elevation={0} sx={{ p: 1.75, borderRadius: 3,
                background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.04))",
                border: "1px solid rgba(59,130,246,0.15)" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Chip size="small"
                            label={locations.find(l => l.key === location)?.label.toUpperCase()}
                            sx={{ height: 20, fontSize: "0.6rem", fontWeight: 800,
                                bgcolor: "primary.100", color: "primary.700" }} />
                        <Typography sx={{ fontWeight: 800, fontSize: "1.1rem", mt: 0.75, lineHeight: 1.25 }}>
                            {heading}
                        </Typography>
                    </Box>
                    <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.main",
                        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", ml: 1 }}>
                        <Inventory2Icon sx={{ fontSize: 18 }} />
                    </Box>
                </Stack>

                <Paper variant="outlined" sx={{ mt: 1.25, px: 1, py: 0.5, display: "inline-block",
                    bgcolor: "rgba(255,255,255,0.7)" }}>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                        {math}
                    </Typography>
                </Paper>

                <Box sx={{ mt: 1.25 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Storage Hierarchy Composition
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                            {current} Pieces
                        </Typography>
                    </Stack>
                    <Box sx={{ height: 10, width: "100%", bgcolor: "grey.200", borderRadius: 999,
                        overflow: "hidden", display: "flex" }}>
                        <Box sx={{ width: `${bulkPct}%`, bgcolor: "grey.900", transition: "width .3s" }} />
                        <Box sx={{ width: `${sealedPct}%`, bgcolor: "primary.main", transition: "width .3s" }} />
                        <Box sx={{ width: `${loosePct}%`, bgcolor: "success.main", transition: "width .3s" }} />
                    </Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "grey.900" }} />
                            <Typography variant="caption" color="text.secondary">Bulk Ctn ({bulkPct}%)</Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />
                            <Typography variant="caption" color="text.secondary">Sealed Bx ({sealedPct}%)</Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />
                            <Typography variant="caption" color="text.secondary">Loose Pcs ({loosePct}%)</Typography>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="caption" fontWeight={700}
                        sx={{ textTransform: "uppercase", letterSpacing: "0.04em", color: "text.secondary" }}>
                        Physical Distribution
                    </Typography>
                    <Typography variant="caption" color="primary.main" fontWeight={600}>
                        Auto-synced across nodes
                    </Typography>
                </Stack>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    <NodeCard label="Store Shelf" count={storeStock} tone="success.main" />
                    <NodeCard label="Remote Whse" count={remoteStock} tone="info.main" />

                    <Paper variant="outlined" sx={{ gridColumn: "1 / -1", p: 1.25, borderRadius: 2,
                        bgcolor: "grey.50", borderLeft: "3px solid", borderLeftColor: "info.main" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" fontWeight={700}>Combined Store + Remote</Typography>
                            <Chip size="small" color="info" variant="outlined"
                                label="Active Network" sx={{ height: 18, fontSize: "0.6rem" }} />
                        </Stack>
                        <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
                            {storeStock + remoteStock}
                            <Typography component="span" variant="caption"
                                color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>
                                pcs active in network
                            </Typography>
                        </Typography>
                        {(() => {
                            const d = decomposeStock(storeStock + remoteStock, perBox);
                            return (
                                <Typography variant="caption" color="text.secondary"
                                    sx={{ fontFamily: "monospace", fontSize: "0.62rem" }}>
                                    {d.cartons} Ctn • {d.boxes} Bx • {d.pieces} Pcs
                                </Typography>
                            );
                        })()}
                    </Paper>

                    <NodeCard label="Warehouse A" count={whseAStock} tone="primary.main" />
                    <NodeCard label="Warehouse B" count={whseBStock} tone="grey.500" />

                    <Paper variant="outlined" sx={{ gridColumn: "1 / -1", p: 1.25, borderRadius: 2,
                        bgcolor: "grey.50", borderLeft: "3px solid", borderLeftColor: "success.main" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" fontWeight={700}>Combined (All Nodes)</Typography>
                            <Chip size="small" color="success" variant="outlined"
                                label="Total Buffer" sx={{ height: 18, fontSize: "0.6rem" }} />
                        </Stack>
                        <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
                            {allStock}
                            <Typography component="span" variant="caption"
                                color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>
                                pcs across network
                            </Typography>
                        </Typography>
                        {(() => {
                            const d = decomposeStock(allStock, perBox);
                            return (
                                <Typography variant="caption" color="text.secondary"
                                    sx={{ fontFamily: "monospace", fontSize: "0.62rem" }}>
                                    {d.cartons} Ctn • {d.boxes} Bx • {d.pieces} Pcs
                                </Typography>
                            );
                        })()}
                    </Paper>
                </Box>
            </Paper>
        </Stack>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReplenishmentPanel — biggest packaging only
// ─────────────────────────────────────────────────────────────────────────────
type RuleState = { minPcs: number; maxPcs: number; autoBatchCartons: number; source: string };

function ReplenishmentPanel({ variants }: { variants: Variant[] }) {
    const replenishVariants = useMemo(() => {
        const groups = new Map<string, Variant>();
        for (const v of variants) {
            const key = packagingGroupKey(v.label);
            const existing = groups.get(key);
            if (!existing || v.multiplier > existing.multiplier) {
                groups.set(key, v);
            }
        }
        return Array.from(groups.values());
    }, [variants]);

    const [rules, setRules] = useState<Record<number, RuleState>>(() =>
        replenishVariants.reduce((acc, v) => {
            const perBox = v.multiplier || 12;
            const perCarton = perBox * 10;
            acc[v.id] = {
                minPcs: v.min_reorder ?? perCarton * 2,
                maxPcs: v.target_cap ?? perCarton * 10,
                autoBatchCartons: 1,
                source: "whseA",
            };
            return acc;
        }, {} as Record<number, RuleState>)
    );
    const [toast, setToast] = useState<string | null>(null);

    const update = (id: number, patch: Partial<RuleState>) =>
        setRules(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

    const lowCount = replenishVariants.filter(v => v.stock < (rules[v.id]?.minPcs ?? 0)).length;

    return (
        <Stack spacing={1.5}>
            <Alert severity={lowCount > 0 ? "warning" : "info"}
                icon={<RuleSettingsIcon />} sx={{ borderRadius: 2 }}>
                {lowCount > 0
                    ? `${lowCount} variant group${lowCount === 1 ? "" : "s"} below the minimum reorder threshold — auto-transfer will fire on next sync.`
                    : "All variant groups are above their minimum reorder thresholds."}
            </Alert>

            {replenishVariants.map(v => {
                const r = rules[v.id];
                const perBox = v.multiplier || 12;
                const perCarton = perBox * 10;
                const low = v.stock < r.minPcs;
                const incoming = v.incoming_transfer ?? null;

                const currentD = decomposeStock(v.stock, perBox);
                const minCtn = Math.max(1, Math.round(r.minPcs / perCarton));
                const maxCtn = Math.max(minCtn + 1, Math.round(r.maxPcs / perCarton));
                const autoBatchPcs = r.autoBatchCartons * perCarton;
                const autoBatchFromMax = Math.max(1, Math.ceil(Math.max(0, r.maxPcs - v.stock) / perCarton));
                const willAutoFire = low && !incoming;

                return (
                    <Paper key={v.id} variant="outlined" sx={{
                        p: 1.5, borderRadius: 2,
                        ...(low ? { borderColor: "error.main", bgcolor: "error.50" } : {}),
                    }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Box sx={{ width: 10, height: 10, borderRadius: "50%",
                                    bgcolor: variantAccent(v.label) }} />
                                <Box>
                                    <Typography variant="subtitle2" fontWeight={700}>
                                        {packagingGroupKey(v.label)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                                        {v.sku} • {perCarton} pcs / Ctn
                                    </Typography>
                                </Box>
                            </Stack>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                {incoming && (
                                    <Chip size="small" color="info" variant="filled" label="In Transit"
                                        sx={{ height: 20, fontSize: "0.62rem", fontWeight: 700 }} />
                                )}
                                <Chip size="small" color={low ? "error" : "success"} variant="outlined"
                                    label={low ? `Low (${v.stock} pcs)` : `Healthy (${v.stock} pcs)`}
                                    sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                            </Stack>
                        </Stack>

                        <Paper variant="outlined" sx={{ mt: 1, p: 1, bgcolor: "white", borderRadius: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                    Current Store Stock
                                </Typography>
                                <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                                    {v.stock} pcs
                                </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary"
                                sx={{ fontFamily: "monospace", fontSize: "0.65rem" }}>
                                {currentD.cartons} Ctn • {currentD.boxes} Bx • {currentD.pieces} Pcs
                            </Typography>
                        </Paper>

                        {incoming && (
                            <Alert severity="info" icon={<LocalShippingIcon />}
                                sx={{ mt: 1, borderRadius: 1.5, py: 0.25 }}>
                                <Typography variant="caption" fontWeight={700}>
                                    Transfer en route: {incoming.qty} pcs
                                    {incoming.from ? ` from ${incoming.from}` : ""}
                                </Typography>
                            </Alert>
                        )}

                        <Box sx={{ mt: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="caption" fontWeight={600}>
                                    Min Stock (Reorder Point)
                                </Typography>
                                <Chip size="small" label={`${minCtn} Ctn`}
                                    sx={{ height: 20, fontFamily: "monospace", fontSize: "0.65rem",
                                        fontWeight: 700, bgcolor: "grey.100" }} />
                            </Stack>
                            <Slider size="small" value={minCtn} min={1} max={Math.max(2, maxCtn - 1)} step={1}
                                onChange={(_, val) => update(v.id, { minPcs: (val as number) * perCarton })}
                                valueLabelDisplay="auto"
                                valueLabelFormat={(val) => `${val} Ctn`}
                                sx={{ mt: 0.5 }} />
                        </Box>

                        <Box sx={{ mt: 1 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="caption" fontWeight={600}>
                                    Max Store Capacity
                                </Typography>
                                <Chip size="small" label={`${maxCtn} Ctn`}
                                    color="primary" variant="outlined"
                                    sx={{ height: 20, fontFamily: "monospace", fontSize: "0.65rem", fontWeight: 700 }} />
                            </Stack>
                            <Slider size="small" value={maxCtn} min={minCtn + 1} max={100} step={1}
                                onChange={(_, val) => update(v.id, { maxPcs: (val as number) * perCarton })}
                                valueLabelDisplay="auto"
                                valueLabelFormat={(val) => `${val} Ctn`}
                                sx={{ mt: 0.5 }} />
                        </Box>

                        <Paper variant="outlined" sx={{ mt: 1.25, p: 1, borderRadius: 1.5, bgcolor: "grey.50" }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="caption" fontWeight={700} display="block">
                                        Auto Transfer Batch Size
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.62rem" }}>
                                        Fires when stock &lt; min • in Cartons
                                    </Typography>
                                </Box>
                                <TextField
                                    type="number" size="small"
                                    value={r.autoBatchCartons}
                                    onChange={e => update(v.id, {
                                        autoBatchCartons: Math.max(1, Number(e.target.value) || 1),
                                    })}
                                    inputProps={{ min: 1, max: 50,
                                        style: { width: 48, textAlign: "center", fontFamily: "monospace", fontWeight: 700 } }}
                                    InputProps={{ endAdornment: <InputAdornment position="end">Ctn</InputAdornment> }}
                                    sx={{ width: 100 }}
                                />
                            </Stack>
                            <Typography variant="caption" color="text.secondary"
                                sx={{ fontFamily: "monospace", fontSize: "0.62rem", mt: 0.5, display: "block" }}>
                                = {autoBatchPcs} pcs ({r.autoBatchCartons} Ctn) • Fill-to-max would be {autoBatchFromMax} Ctn
                            </Typography>
                        </Paper>

                        {willAutoFire && (
                            <Alert severity="error" icon={<LocalShippingIcon />}
                                sx={{ mt: 1.25, borderRadius: 1.5, py: 0.25 }}>
                                <Typography variant="caption" fontWeight={700}>
                                    Auto-Transfer will fire: {r.autoBatchCartons} Ctn ({autoBatchPcs} pcs) from {r.source.toUpperCase()}
                                </Typography>
                            </Alert>
                        )}

                        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} alignItems="center">
                            <FormControl size="small" sx={{ flex: 1 }}>
                                <InputLabel>Primary Source</InputLabel>
                                <Select value={r.source} label="Primary Source"
                                    onChange={e => update(v.id, { source: e.target.value })}>
                                    <MenuItem value="whseA">Warehouse A (Central Hub)</MenuItem>
                                    <MenuItem value="remote">Remote Hub</MenuItem>
                                    <MenuItem value="whseB">Warehouse B (Overflow)</MenuItem>
                                </Select>
                            </FormControl>
                            <Button size="small" variant="contained"
                                disabled={Boolean(incoming)}
                                startIcon={<LocalShippingIcon sx={{ fontSize: 14 }} />}
                                onClick={() =>
                                    setToast(`Transfer requested — ${v.label}: ${autoBatchPcs} pcs (${r.autoBatchCartons} Ctn) from ${r.source.toUpperCase()}`)
                                }>
                                {incoming ? "In Transit" : "Request Transfer"}
                            </Button>
                        </Stack>
                    </Paper>
                );
            })}

            <Snackbar open={Boolean(toast)} autoHideDuration={2800} onClose={() => setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>
            </Snackbar>
        </Stack>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// StitchVariantCard
// ─────────────────────────────────────────────────────────────────────────────
function StitchVariantCard({ v, highlighted, onEdit }: {
    v: Variant;
    highlighted: boolean;
    onEdit: () => void;
}) {
    const [open, setOpen] = useState(false);
    const tiers = variantTierSummary(v);

    const inStock = v.active && v.stock > 0;
    const lowStock = inStock && v.stock < 25;
    const statusLabel = !v.active ? "Inactive"
        : lowStock ? `Low Stock (${v.stock})`
            : inStock ? "In Stock" : "Out of Stock";
    const statusTone = !v.active ? "default" : lowStock ? "warning" : inStock ? "success" : "error";

    const businessCustomers = v.customer_prices.filter(cp =>
        cp.customer_type === "business" || (!cp.customer_type && !cp.tin_number)
    );
    const individualCustomers = v.customer_prices.filter(cp =>
        cp.customer_type === "individual" || (!cp.customer_type && cp.tin_number)
    );
    const businessSellers = v.seller_prices.filter(sp => sp.business);
    const individualSellers = v.seller_prices.filter(sp => sp.individual);

    const renderOverrideList = (
        entries: { name: string; price: string | number; discount: string | number | null }[]
    ) => {
        if (entries.length === 0) {
            return <Typography variant="caption" color="text.disabled">—</Typography>;
        }
        return (
            <Stack spacing={0.25} alignItems="flex-end">
                {entries.map((e, i) => {
                    const discountNum = e.discount != null ? Number(e.discount) : null;
                    const priceNum = Number(e.price);
                    const showStrike = discountNum != null && discountNum < priceNum;
                    return (
                        <Typography key={i} variant="caption"
                            sx={{ fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>
                            <Box component="span" sx={{ fontWeight: 500, color: "text.secondary", mr: 0.5 }}>
                                {e.name}
                            </Box>
                            {fmt(showStrike ? discountNum : priceNum)}
                            {showStrike && (
                                <Box component="span" sx={{ textDecoration: "line-through",
                                    color: "text.disabled", ml: 0.5, fontWeight: 400 }}>
                                    {fmt(priceNum)}
                                </Box>
                            )}
                        </Typography>
                    );
                })}
            </Stack>
        );
    };

    return (
        <Paper id={`variant-${v.id}`} variant="outlined"
            sx={{
                mb: 1.5, borderRadius: 2, overflow: "hidden",
                ...(highlighted ? { animation: `${bounce} 0.6s ease-in-out 3`, borderColor: "primary.main" } : {}),
            }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"
                onClick={() => setOpen(o => !o)}
                sx={{ px: 1.5, py: 1.25, cursor: "pointer", userSelect: "none",
                    "&:hover": { bgcolor: "action.hover" } }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: "50%", flex: "0 0 auto",
                        bgcolor: variantAccent(v.label), boxShadow: `0 0 0 3px ${variantAccent(v.label)}22` }} />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ wordBreak: "break-word" }}>
                            {v.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary"
                            sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                            {v.sku}
                        </Typography>
                    </Box>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label={statusLabel} size="small"
                        color={statusTone as any}
                        variant={statusTone === "default" ? "outlined" : "filled"}
                        sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }} />
                    {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                </Stack>
            </Stack>

            <Collapse in={open} timeout="auto" unmountOnExit>
                <Divider />
                <Stack spacing={1.25} sx={{ p: 1.5 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: "grey.50" }}>
                            <Typography variant="caption"
                                sx={{ fontWeight: 800, letterSpacing: "0.05em", color: "info.dark",
                                    textTransform: "uppercase", fontSize: "0.6rem" }}>
                                Business (B2B)
                            </Typography>
                            <Stack spacing={0.5} mt={0.5}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary">Base:</Typography>
                                    <Typography variant="caption"
                                        sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                                        {fmt(tiers.business.base)}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ flexShrink: 0 }}>Customer:</Typography>
                                    <Box sx={{ ml: 1, minWidth: 0, flex: 1, textAlign: "right" }}>
                                        {renderOverrideList(businessCustomers.map(cp => ({
                                            name: cp.customer_name,
                                            price: cp.price,
                                            discount: cp.discount_price,
                                        })))}
                                    </Box>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ flexShrink: 0 }}>Seller:</Typography>
                                    <Box sx={{ ml: 1, minWidth: 0, flex: 1, textAlign: "right" }}>
                                        {renderOverrideList(businessSellers.map(sp => ({
                                            name: sp.seller_name,
                                            price: sp.business?.price ?? sp.price,
                                            discount: sp.business?.discount_price ?? sp.discount_price,
                                        })))}
                                    </Box>
                                </Stack>
                            </Stack>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1, bgcolor: "grey.50" }}>
                            <Typography variant="caption"
                                sx={{ fontWeight: 800, letterSpacing: "0.05em", color: "primary.main",
                                    textTransform: "uppercase", fontSize: "0.6rem" }}>
                                Individual (DTC)
                            </Typography>
                            <Stack spacing={0.5} mt={0.5}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary">Base:</Typography>
                                    <Typography variant="caption"
                                        sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                                        {fmt(tiers.individual.base)}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ flexShrink: 0 }}>Customer:</Typography>
                                    <Box sx={{ ml: 1, minWidth: 0, flex: 1, textAlign: "right" }}>
                                        {renderOverrideList(individualCustomers.map(cp => ({
                                            name: cp.customer_name,
                                            price: cp.price,
                                            discount: cp.discount_price,
                                        })))}
                                    </Box>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ flexShrink: 0 }}>Seller:</Typography>
                                    <Box sx={{ ml: 1, minWidth: 0, flex: 1, textAlign: "right" }}>
                                        {renderOverrideList(individualSellers.map(sp => ({
                                            name: sp.seller_name,
                                            price: sp.individual?.price ?? sp.price,
                                            discount: sp.individual?.discount_price ?? sp.discount_price,
                                        })))}
                                    </Box>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Box>

                    <Button variant="outlined" size="small" startIcon={<EditIcon />}
                        onClick={e => { e.stopPropagation(); onEdit(); }}
                        sx={{ alignSelf: "flex-end" }}>
                        Edit Prices &amp; Rules
                    </Button>
                </Stack>
            </Collapse>
        </Paper>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// StitchProductCard
// ─────────────────────────────────────────────────────────────────────────────
function StitchProductCard({ item, customers, sellers }: {
    item: InventoryItem; customers: Person[]; sellers: Person[];
}) {
    const [expanded, setExpanded] = useState(false);
    const [tab, setTab] = useState<"stock" | "replenish" | "variants">("stock");
    const [editing, setEditing] = useState<Variant | null>(null);
    const [variants, setVariants] = useState<Variant[]>(item.variants);
    const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);

    const stockAggregate = useMemo(() => {
        let cartons = 0, boxes = 0, pieces = 0, perBoxTotal = 0;
        variants.forEach(v => {
            const d = decomposeStock(v.stock, v.multiplier);
            cartons += d.cartons;
            boxes += d.boxes;
            pieces += d.pieces;
            perBoxTotal += d.perBox;
        });
        const avgPerBox = variants.length ? Math.round(perBoxTotal / variants.length) : 12;
        return { cartons, boxes, pieces, perBox: avgPerBox, perCarton: avgPerBox * 10 };
    }, [variants]);

    const lowStockVariants = variants.filter(v =>
        v.active && v.stock < (v.min_reorder ?? v.multiplier * 5)
    ).length;
    const hasLow = lowStockVariants > 0;

    const handleSaved = (updated: Variant) => {
        setVariants(prev => prev.map(v => (v.id === updated.id ? updated : v)));
        setEditing(null);
        setExpanded(true);
        setHighlightedVariantId(updated.id);
        window.setTimeout(() => {
            document.getElementById(`variant-${updated.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        window.setTimeout(() => { setHighlightedVariantId(null); router.reload(); }, 1900);
    };

    return (
        <Card sx={{ mb: 2, borderRadius: 3, overflow: "visible" }}>
            <CardContent sx={{ pb: 1 }}>
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box sx={{ position: "relative", width: 72, height: 72, borderRadius: 2, flex: "0 0 auto",
                        bgcolor: "grey.100", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Inventory2Icon sx={{ color: "grey.400", fontSize: 32 }} />
                        <Chip label={item.category} size="small"
                            sx={{ position: "absolute", bottom: 4, right: 4, height: 18, fontSize: "0.6rem",
                                bgcolor: "rgba(15,23,42,0.85)", color: "#fff" }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Chip label={`SKU-${item.item_id}`} size="small"
                                sx={{ height: 20, fontSize: "0.65rem", fontFamily: "monospace",
                                    bgcolor: "grey.100", color: "text.secondary" }} />
                            <Chip size="small" variant="outlined"
                                label={hasLow ? `${lowStockVariants} low` : "In-Stock"}
                                color={hasLow ? "error" : "success"}
                                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                        </Stack>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.5, wordBreak: "break-word" }}>
                            {item.item_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            {item.category} • {item.total_variants} variants
                        </Typography>
                        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 0.75, flexWrap: "wrap" }}>
                            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1 }}>
                                {item.total_stock}
                            </Typography>
                            <Typography variant="caption" color="text.secondary"
                                sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Pcs Total
                            </Typography>
                            <Chip size="small"
                                label={`${stockAggregate.cartons} Ctns • ${stockAggregate.boxes} Bx • ${stockAggregate.pieces} Pcs`}
                                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600, bgcolor: "grey.100" }} />
                        </Stack>
                    </Box>
                </Stack>
            </CardContent>

            <Box sx={{ px: 2, pb: 1.5 }}>
                <Button fullWidth variant="text"
                    onClick={() => setExpanded(e => !e)}
                    sx={{
                        justifyContent: "space-between", px: 1.5, py: 1, borderRadius: 2,
                        bgcolor: "grey.50", textTransform: "none", color: "text.primary",
                        "&:hover": { bgcolor: "grey.100" },
                    }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <RuleSettingsIcon fontSize="small" sx={{ color: "primary.main" }} />
                        <Typography variant="body2" fontWeight={600}>
                            Stock Rules, Breakdown & {item.total_variants} Variants
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                            {expanded ? "Expanded" : "Collapsed"}
                        </Typography>
                        {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </Stack>
                </Button>
            </Box>

            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Divider />
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"
                        scrollButtons="auto" sx={{ minHeight: 36, mb: 2,
                            "& .MuiTab-root": { minHeight: 36, py: 0.5, fontSize: "0.72rem", textTransform: "none" } }}>
                        <Tab value="stock" icon={<Inventory2Icon sx={{ fontSize: 16 }} />}
                            iconPosition="start" label="Active Stock & Packaging" />
                        <Tab value="replenish" icon={<RuleSettingsIcon sx={{ fontSize: 16 }} />}
                            iconPosition="start"
                            label={
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <span>Replenishment Rules</span>
                                    {hasLow && (
                                        <Chip size="small" color="error" label={`${lowStockVariants} Low`}
                                            sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700 }} />
                                    )}
                                </Stack>
                            } />
                        <Tab value="variants" icon={<StyleIcon sx={{ fontSize: 16 }} />}
                            iconPosition="start" label={`SKU Variants (${item.total_variants})`} />
                    </Tabs>

                    {tab === "stock" && <StockBreakdownPanel item={item} variants={variants} />}
                    {tab === "replenish" && <ReplenishmentPanel variants={variants} />}
                    {tab === "variants" && (
                        <Stack spacing={1.25}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" px={0.5}>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                    <StyleIcon fontSize="small" sx={{ color: "primary.main" }} />
                                    <Typography variant="subtitle2" fontWeight={700}>
                                        Individual SKU Variants ({variants.length})
                                    </Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    B2B &amp; DTC Tier Pricing
                                </Typography>
                            </Stack>
                            {variants.map(v => (
                                <StitchVariantCard key={v.id} v={v}
                                    highlighted={highlightedVariantId === v.id}
                                    onEdit={() => setEditing(v)} />
                            ))}
                        </Stack>
                    )}
                </Box>
            </Collapse>

            {editing && (
                <EditDrawer variant={editing} customers={customers} sellers={sellers}
                    onClose={() => setEditing(null)} onSaved={handleSaved} />
            )}
        </Card>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────
function InventoryPagination({ meta, links }: { meta: PaginationMeta; links: PaginationLink[] }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const handlePageChange = (_e: React.ChangeEvent<unknown>, page: number) => {
        if (page === meta.current_page) return;
        const link = links.find(l => l.label === String(page) && !l.active);
        if (link && link.url) {
            router.get(link.url, {}, { preserveState: true, preserveScroll: true });
        }
    };

    if (meta.last_page <= 1) return null;

    return (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <Pagination count={meta.last_page} page={meta.current_page} onChange={handlePageChange}
                color="primary" size={isMobile ? "small" : "medium"}
                showFirstButton={!isMobile} showLastButton={!isMobile} />
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog top bar
// ─────────────────────────────────────────────────────────────────────────────
function CatalogTopBar({ store, items, onSearch, search }: {
    store: Props["store"];
    items: InventoryItem[];
    search: string;
    onSearch: (v: string) => void;
}) {
    const [scanOpen, setScanOpen] = useState(false);

    const totalSKUs = items.reduce((s, i) => s + i.total_variants, 0);
    const activeItems = items.reduce((s, i) => s + i.variants.filter(v => v.active).length, 0);
    const inStockCount = items.filter(i => i.total_stock > 0).length;
    const inStockRate = items.length ? ((inStockCount / items.length) * 100).toFixed(1) : "0.0";
    const reorderDue = items.filter(i => i.total_stock < 50).length;

    return (
        <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Paper variant="outlined" sx={{ flex: 1, display: "flex", alignItems: "center",
                    px: 1.25, py: 0.75, borderRadius: 2 }}>
                    <SearchIcon fontSize="small" sx={{ color: "text.secondary", mr: 1 }} />
                    <Box component="input"
                        value={search}
                        onChange={e => onSearch((e.target as HTMLInputElement).value)}
                        placeholder="Search SKU, name, or scan barcode..."
                        sx={{ border: "none", outline: "none", flex: 1, fontSize: "0.85rem",
                            bgcolor: "transparent", fontFamily: "inherit" }} />
                    <IconButton size="small"><MicIcon fontSize="small" /></IconButton>
                </Paper>
                <IconButton color="primary" onClick={() => setScanOpen(true)}
                    sx={{ bgcolor: "primary.main", color: "primary.contrastText",
                        "&:hover": { bgcolor: "primary.dark" }, width: 44, height: 44, borderRadius: 2 }}>
                    <QrCodeScannerIcon />
                </IconButton>
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5,
                "&::-webkit-scrollbar": { display: "none" } }}>
                <Chip label={`All Items (${items.length})`} size="small"
                    color="primary" variant="filled"
                    onClick={() => router.visit(route("store.show", store.id))} />
                <Chip label={`Active Items (${activeItems})`} size="small" variant="outlined"
                    onClick={() => router.visit(route("store.show", store.id))} />
                <Chip label={`Needs Replenish (${reorderDue})`} size="small"
                    color="warning" variant="outlined"
                    onClick={() => router.visit(route("store.replenish", store.id))} />
                <Chip label="Price Deviations" size="small"
                    color="error" variant="outlined"
                    onClick={() => router.visit(route("store.deviations", store.id))} />
                <Chip label={`Location: ${store?.name ?? "Store"}`} size="small" variant="outlined" />
            </Stack>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mb: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: "0.6rem" }}>
                            Active Units
                        </Typography>
                        <Inventory2Icon sx={{ fontSize: 14, color: "primary.main" }} />
                    </Stack>
                    <Typography variant="h6" fontWeight={800}>{activeItems}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {totalSKUs} total catalog SKUs
                    </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: "0.6rem" }}>
                            In-Stock Rate
                        </Typography>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />
                    </Stack>
                    <Typography variant="h6" fontWeight={800}>{inStockRate}%</Typography>
                    <Typography variant="caption" color="success.main">Optimal health</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: "0.6rem" }}>
                            Reorder Due
                        </Typography>
                        <Typography sx={{ fontSize: 14, color: "error.main", fontWeight: 800 }}>!</Typography>
                    </Stack>
                    <Typography variant="h6" fontWeight={800} color="error.main">{reorderDue}</Typography>
                    <Typography variant="caption" color="text.secondary">Below threshold</Typography>
                </Paper>
            </Box>

            <Snackbar open={scanOpen} autoHideDuration={2600} onClose={() => setScanOpen(false)}
                anchorOrigin={{ vertical: "top", horizontal: "center" }}>
                <Alert severity="info" onClose={() => setScanOpen(false)} icon={<QrCodeScannerIcon />}>
                    Barcode scanner ready — align barcode with the reader.
                </Alert>
            </Snackbar>
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function StoreInventory({ store, inventory, customers = [], sellers = [] }: Props) {
    const [search, setSearch] = useState("");

    let items: InventoryItem[] = [];
    let meta: PaginationMeta | null = null;
    let links: PaginationLink[] = [];

    if (Array.isArray(inventory)) {
        items = inventory;
        meta = { current_page: 1, from: 1, last_page: 1, per_page: items.length, to: items.length, total: items.length };
        links = [
            { url: null, label: "&laquo; Previous", active: false },
            { url: "#", label: "1", active: true },
            { url: null, label: "Next &raquo;", active: false },
        ];
    } else {
        const paginated = inventory as any;
        items = paginated.data || [];
        meta = paginated.meta || (paginated.current_page !== undefined ? {
            current_page: paginated.current_page, from: paginated.from, last_page: paginated.last_page,
            per_page: paginated.per_page, to: paginated.to, total: paginated.total,
        } : null);
        links = (paginated.meta && paginated.meta.links) || paginated.links || [];
    }

    const filteredItems = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.trim().toLowerCase();
        return items.filter(i =>
            i.item_name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q) ||
            i.variants.some(v => v.sku.toLowerCase().includes(q) || v.label.toLowerCase().includes(q))
        );
    }, [items, search]);

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: "100%", overflowX: "hidden" }}>
            <Head title={`${store?.name} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap">
                <Button component={Link} href={route("store.index")}
                    startIcon={<ArrowBackIcon />} variant="outlined" size="small">
                    Back
                </Button>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={800} noWrap>{store?.name}</Typography>
                    {store?.location && (
                        <Typography variant="caption" color="text.secondary">{store.location}</Typography>
                    )}
                </Box>
                <Chip label={store?.status} color={store?.status === "active" ? "success" : "default"}
                    variant="outlined" size="small" />
            </Stack>

            <CatalogTopBar store={store} items={items} search={search} onSearch={setSearch} />

            {filteredItems.length === 0 ? (
                <Alert severity="info">
                    {search ? "No inventory matches your search." : "This store has no inventory yet."}
                </Alert>
            ) : (
                <>
                    {/* Same Stitch cards on every breakpoint */}
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
                        {filteredItems.map(item => (
                            <StitchProductCard key={item.item_id} item={item}
                                customers={customers} sellers={sellers} />
                        ))}
                    </Box>

                    {meta && <InventoryPagination meta={meta} links={links} />}
                </>
            )}
        </Box>
    );
}

StoreInventory.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;