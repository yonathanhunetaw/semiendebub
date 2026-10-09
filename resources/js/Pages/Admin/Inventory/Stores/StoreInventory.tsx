import React, { useMemo, useState } from "react";
import StitchProductDetails from './StitchProductDetails';
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
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import RuleSettingsIcon from "@mui/icons-material/Rule";
import StyleIcon from "@mui/icons-material/Style";
import StorefrontIcon from "@mui/icons-material/Storefront";
import StoreIcon from "@mui/icons-material/Store";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import PublicIcon from "@mui/icons-material/Public";
import InventoryIcon from "@mui/icons-material/Inventory";
import ArchiveIcon from "@mui/icons-material/Archive";
import ExtensionIcon from "@mui/icons-material/Extension";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import axios from "axios";
import Scene from "@/Components/Visual/scenes";
import { ChipGroup } from "@/Components/Seller/AddToCartSheet";
import InventoryDetailList from "@/Components/Seller/InventoryDetailList";
import { sellerPrice } from "@/Components/Seller/sellerUi";
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

export interface Variant {
    id: number;
    sku: string;
    label: string;
    /** The label's parts, sent on the item page for the variant picture. */
    color?: string | null;
    size?: string | null;
    pack?: string | null;
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

/** One of a store's stock-bearing places, as StoreLocationStockService reports it. */
export interface StockLocation {
    /** `shelf`, `store_room` or `remote_warehouse`. */
    key: string;
    label: string;
    /** Pieces. */
    stock: number;
    /** True when the figure is the remainder of another, not its own ledger. */
    derived: boolean;
    /**
     * The same figure spoken in this item's own packaging, already in the mode
     * this location is read in — the shelf in its smallest unit ("47 Packets"),
     * everywhere else biggest first ("30 Cartons · 17 Pieces").
     *
     * Formatted server-side by App\Services\Inventory\PackagingLadder, so every
     * screen says the same thing about the same stock.
     */
    display?: string;
    display_mode?: "breakdown" | "smallest";
    units?: { unit: string; count: number; pieces: number }[];
}

export interface InventoryItem {
    item_id: number;
    item_name: string;
    /** The item's first picture, for the phone view's cards. */
    image_url?: string | null;
    category: string;
    starting_price: number;
    total_variants: number;
    total_stock: number;
    remote_total_stock: number;
    /**
     * Store Shelf / Store Room / Remote Warehouse, from the server.
     *
     * Optional because the replenish and deviations screens render this panel
     * from payloads that do not carry it; `storeFallbackLocations` covers them.
     */
    locations?: StockLocation[];
    variants: Variant[];
}

export interface Person {
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

/** A place under the store: its shelf, floor or Remote Hub. */
interface StoreSite {
    id: number;
    name: string;
    code: string;
    kind: string;
    units: number;
}

type StoreFilter = "all" | "active" | "low" | "out";

/** Whole-store figures (StoreController::storeHealth), not just this page. */
interface StoreSummary {
    items: number;
    active: number;
    low: number;
    out: number;
    in_stock_rate: number | null;
    active_variants: number;
    total_variants: number;
    monitored_variants: number;
}

interface Props {
    store: { id: number; name: string; location?: string; manager?: string; status: string };
    filter?: StoreFilter;
    summary?: StoreSummary;
    locations?: StoreSite[];
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

export function decomposeStock(stock: number, multiplier: number) {
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

/**
 * Swatch per product color name ("navy" -> navy). These are the product's own
 * colors, not theme colors, so they stay fixed in every module and mode; the
 * fallbacks are a fixed categorical set for labels that name no color.
 */
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
export function EditDrawer({
    variant, customers, sellers, onClose, onSaved,
}: {
    variant: Variant;
    customers: Person[];
    sellers: Person[];
    onClose: () => void;
    onSaved: (updated: Variant) => void;
}) {
    const sheet = useMediaQuery(useTheme().breakpoints.down("md"));
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
            {/* A side panel on wide screens; on a phone it slides up from the bottom like the seller's sheets. */}
            <Drawer anchor={sheet ? "bottom" : "right"} open onClose={onClose}
                PaperProps={{ sx: sheet
                    ? { maxHeight: "92vh", borderTopLeftRadius: 20, borderTopRightRadius: 20, p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }
                    : { width: { xs: "100%", sm: 520 }, p: 0 } }}>
                {sheet && <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "rgb(var(--inverse-on-surface) / 0.5)", position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 1 }} />}
                <Box sx={{ px: 3, py: 2, bgcolor: "rgb(var(--inverse-surface))", color: "rgb(var(--inverse-on-surface))" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                            <Typography variant="h6" fontWeight={700}>{variant.label}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.6 }}>{variant.sku}</Typography>
                        </Box>
                        <IconButton onClick={onClose} sx={{ color: "rgb(var(--inverse-on-surface))" }} size="small"><CloseIcon /></IconButton>
                    </Stack>
                    <Tabs value={tab}
                        onChange={(_, v) => { setTab(v); setPricingSection("default"); }}
                        textColor="inherit"
                        sx={{ mt: 1, "& .MuiTabs-indicator": { bgcolor: "rgb(var(--inverse-on-surface))" } }}>
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
                                        <TableHead sx={{ bgcolor: "rgb(var(--surface-container-low))" }}>
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
                                        <TableHead sx={{ bgcolor: "rgb(var(--surface-container-low))" }}>
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
/**
 * Places a replenishment run can pull from.
 *
 * Kept in step with the location keys the server sends. The list previously
 * offered "Warehouse A (Central Hub)" and "Warehouse B (Overflow)", neither of
 * which corresponds to anything in the schema.
 */
const REPLENISH_SOURCES: { value: string; label: string }[] = [
    { value: "store_room", label: "Store Room (shelf fill)" },
    { value: "remote_warehouse", label: "Remote Hub" },
];

/** The readable name of a replenishment source, for toasts and hints. */
const sourceLabel = (value: string): string =>
    REPLENISH_SOURCES.find(s => s.value === value)?.label ?? value;

/**
 * A store reports stock at three places, and the server names them.
 *
 * These keys used to include "whseA" and "whseB", whose figures came from
 * `item.warehouse_a_stock` / `warehouse_b_stock` — props no controller has
 * ever sent, so both pills permanently read 0. Shelf and store room were worse
 * than absent: they were `total * 0.25` and the remainder, computed here, so
 * the split on screen was arithmetic rather than a record of where anything
 * was. Both now come from StoreLocationStockService.
 */
type StockLocationKey = "shelf" | "store_room" | "remote_warehouse";

/**
 * Locations for a payload that predates the server-side breakdown.
 *
 * The replenish and deviations screens reuse this panel with item payloads
 * that carry only the two totals. They get the two totals, honestly labelled,
 * rather than a shelf figure invented from a percentage.
 */
function storeFallbackLocations(item: InventoryItem): StockLocation[] {
    // No ladder is available on these payloads, so the figures stay in pieces.
    return [
        {
            key: "store_room",
            label: "In Store",
            stock: item.total_stock,
            derived: false,
            display: `${item.total_stock.toLocaleString()} pcs`,
        },
        {
            key: "remote_warehouse",
            label: "Remote Hub",
            stock: item.remote_total_stock,
            derived: false,
            display: `${item.remote_total_stock.toLocaleString()} pcs`,
        },
    ];
}

export function StockBreakdownPanel({ item, variants }: { item: InventoryItem; variants: Variant[] }) {
    const locations = item.locations?.length ? item.locations : storeFallbackLocations(item);

    // Multi-select: everything inside the store itself, which is what an admin
    // opening the panel is looking at. Off-site stock is opt-in.
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(locations.filter((l) => l.key !== "remote_warehouse").map((l) => l.key)),
    );
    const [pkgMode, setPkgMode] = useState<PkgMode>("pieces");

    // Replenishment rules state inside the card
    const perBox = variants[0]?.multiplier ?? 12;
    const perCarton = perBox * 10;

    const [minCtn, setMinCtn] = useState<number>(2);
    const [maxCtn, setMaxCtn] = useState<number>(10);
    const [autoBatchCartons, setAutoBatchCartons] = useState<number>(1);
    const [source, setSource] = useState<string>("remote_warehouse");
    const [toast, setToast] = useState<string | null>(null);

    // Stock counts, all from the server.
    const stockByLoc: Record<string, number> = Object.fromEntries(
        locations.map((l) => [l.key, l.stock]),
    );

    const allKeys = locations.map((l) => l.key);
    const isAllSelected = allKeys.every((k) => selected.has(k));

    /*
     * Store Room is the store total minus the shelf, so adding the two gives
     * the store's own holding exactly once. Remote Warehouse is a separate
     * ledger on top of it.
     */
    const allStock = locations.reduce((sum, l) => sum + l.stock, 0);

    const current = Array.from(selected).reduce((sum, key) => sum + (stockByLoc[key] ?? 0), 0);

    const toggleLocation = (key: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                if (next.size > 1) next.delete(key);
            } else {
                next.add(key);
            }
            // A shelf on its own is counted in pieces — that is how it is
            // picked. Anything else is counted in cartons.
            if (next.size === 1) {
                setPkgMode(next.has("shelf") ? "pieces" : "cartons");
            }
            return next;
        });
    };

    const selectPreset = (keys: string[]) => {
        setSelected(new Set(keys));
        setPkgMode(keys.length === 1 && keys[0] === "shelf" ? "pieces" : "cartons");
    };

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

    /** Tone and icon per location key, so the server sends figures, not styling. */
    const LOCATION_STYLE: Record<string, { tone: string; icon: React.ReactNode }> = {
        shelf: { tone: "success.main", icon: <StorefrontIcon sx={{ fontSize: 13 }} /> },
        store_room: { tone: "info.main", icon: <StoreIcon sx={{ fontSize: 13 }} /> },
        remote_warehouse: { tone: "primary.main", icon: <WarehouseIcon sx={{ fontSize: 13 }} /> },
    };

    const pillLocations: {
        key: string;
        label: string;
        count: number;
        /** Server-formatted, in this location's own reading order. */
        display: string;
        tone: string;
        icon: React.ReactNode;
    }[] = [
        ...locations.map((l) => ({
            key: l.key,
            label: l.label,
            count: l.stock,
            display: l.display ?? `${l.stock.toLocaleString()} pcs`,
            tone: LOCATION_STYLE[l.key]?.tone ?? "text.secondary",
            icon: LOCATION_STYLE[l.key]?.icon ?? <CloudQueueIcon sx={{ fontSize: 13 }} />,
        })),
        {
            key: "all",
            label: "All Locations",
            count: allStock,
            display: `${allStock.toLocaleString()} pcs`,
            tone: "text.primary",
            icon: <PublicIcon sx={{ fontSize: 13 }} />,
        },
    ];

    const selectedLabels = pillLocations
        .filter(l => l.key !== "all" && selected.has(l.key))
        .map(l => l.label)
        .join(" + ");

    const minPcs = minCtn * perCarton;
    const maxPcs = maxCtn * perCarton;
    const reorderPercent = Math.min(100, Math.round((minCtn / maxCtn) * 100));
    const fillPercent = Math.min(100, Math.round((current / maxPcs) * 100));
    const isLow = current < minPcs;
    const autoBatchPcs = autoBatchCartons * perCarton;

    return (
        <Stack spacing={1.75}>
            {/* Toast feedback */}
            {toast && (
                <Alert severity="success" onClose={() => setToast(null)} sx={{ borderRadius: 2 }}>
                    {toast}
                </Alert>
            )}

            {/* 1. Location Selection Pills (Store Shelf -> Store -> Remote -> Warehouse A -> Warehouse B) */}
            <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary"
                        sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                        Select Location (Tap to Filter / Combine)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {selected.size} Selected
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: 0.5,
                    "&::-webkit-scrollbar": { display: "none" } }}>
                    {pillLocations.map(l => {
                        const active = l.key === "all" ? isAllSelected : selected.has(l.key);
                        return (
                            <Paper key={l.key} variant="outlined"
                                onClick={() => {
                                    if (l.key === "all") {
                                        selectPreset(isAllSelected ? [allKeys[0]] : allKeys);
                                    } else {
                                        toggleLocation(l.key);
                                    }
                                }}
                                sx={{
                                    flex: "0 0 auto", px: 1.25, py: 0.75, borderRadius: 2,
                                    cursor: "pointer", minWidth: 92,
                                    bgcolor: active ? "rgb(var(--inverse-surface))" : "background.paper",
                                    color: active ? "rgb(var(--inverse-on-surface))" : "text.primary",
                                    borderColor: active ? "rgb(var(--inverse-surface))" : "divider",
                                    transition: "all 0.15s",
                                }}>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Box sx={{ color: active ? "rgb(var(--inverse-on-surface))" : l.tone, display: "flex", alignItems: "center" }}>
                                        {l.icon}
                                    </Box>
                                    <Typography variant="caption"
                                        sx={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
                                            color: active ? "rgb(var(--inverse-on-surface) / 0.9)" : "text.secondary" }}>
                                        {l.label}
                                    </Typography>
                                </Stack>
                                {/*
                                  The figure in this location's own units. A shelf
                                  reads "47 Packets", a store room "30 Cartons ·
                                  17 Pieces" — the piece count stays underneath so
                                  the two are reconcilable.
                                */}
                                <Typography sx={{ fontWeight: 800, fontSize: "0.78rem", mt: 0.25, lineHeight: 1.2 }}>
                                    {l.display}
                                </Typography>
                                <Typography
                                    sx={{ fontFamily: "monospace", fontSize: "0.6rem", fontWeight: 400,
                                        color: active ? "rgb(var(--inverse-on-surface) / 0.6)" : "text.secondary" }}>
                                    {l.count.toLocaleString()} pcs
                                </Typography>
                            </Paper>
                        );
                    })}
                </Stack>
            </Box>

            {/* 2. Packaging Mode Selector */}
            <Box sx={{ bgcolor: "rgb(var(--surface-container))", p: 0.5, borderRadius: 2, display: "flex", gap: 0.5 }}>
                {(["cartons", "boxes", "pieces"] as PkgMode[]).map(m => {
                    const active = pkgMode === m;
                    const icon = m === "cartons" ? <InventoryIcon sx={{ fontSize: 14 }} />
                        : m === "boxes" ? <ArchiveIcon sx={{ fontSize: 14 }} />
                        : <ExtensionIcon sx={{ fontSize: 14 }} />;
                    const label = m === "cartons" ? `Cartons (${perCarton}s)`
                        : m === "boxes" ? `Boxes (${perBox}s)` : "Pieces (Pcs)";
                    return (
                        <Button key={m} fullWidth size="small" disableElevation
                            onClick={() => setPkgMode(m)}
                            startIcon={icon}
                            variant={active ? "contained" : "text"}
                            sx={{
                                py: 0.5, fontSize: "0.7rem", textTransform: "none", fontWeight: 700,
                                bgcolor: active ? "background.paper" : "transparent",
                                color: active ? "text.primary" : "text.secondary",
                                "&:hover": { bgcolor: active ? "background.paper" : "rgb(var(--surface-container-high))" },
                            }}>
                            {label}
                        </Button>
                    );
                })}
            </Box>

            {/* 3. Single Unified Card: Location Breakdown + Composition + Trigger Bar + Replenishment Rules */}
            <Paper elevation={0} sx={{ p: 2, borderRadius: 3,
                background: "linear-gradient(135deg, rgb(var(--primary) / 0.08), rgb(var(--primary) / 0.04))",
                border: "1px solid rgb(var(--primary) / 0.18)" }}>
                
                {/* Location Header & Icon */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Chip size="small"
                            label={(selectedLabels || "No Location Selected").toUpperCase()}
                            sx={{ height: 20, fontSize: "0.6rem", fontWeight: 800,
                                bgcolor: "rgb(var(--primary-container))", color: "rgb(var(--on-primary-container))", maxWidth: "100%" }} />
                        <Typography sx={{ fontWeight: 800, fontSize: "1.2rem", mt: 0.75, lineHeight: 1.25 }}>
                            {heading}
                        </Typography>
                    </Box>
                    <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "primary.main",
                        color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", ml: 1, flexShrink: 0 }}>
                        <Inventory2Icon sx={{ fontSize: 20 }} />
                    </Box>
                </Stack>

                {/* Math Formula Box */}
                <Paper variant="outlined" sx={{ mt: 1.25, px: 1.25, py: 0.5, display: "inline-block",
                    bgcolor: "rgb(var(--surface-container-lowest) / 0.7)" }}>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary", fontWeight: 600 }}>
                        {math}
                    </Typography>
                </Paper>

                {/* Storage Hierarchy Composition */}
                <Box sx={{ mt: 2 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Storage Hierarchy Composition
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                            {current} Pieces
                        </Typography>
                    </Stack>
                    <Box sx={{ height: 10, width: "100%", bgcolor: "rgb(var(--surface-container-high))", borderRadius: 999,
                        overflow: "hidden", display: "flex" }}>
                        <Box sx={{ width: `${bulkPct}%`, bgcolor: "text.primary", transition: "width .3s" }} />
                        <Box sx={{ width: `${sealedPct}%`, bgcolor: "primary.main", transition: "width .3s" }} />
                        <Box sx={{ width: `${loosePct}%`, bgcolor: "success.main", transition: "width .3s" }} />
                    </Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "text.primary" }} />
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

                {/* ── Capacity & Next Replenishment Trigger Bar with Vertical Marker Line ── */}
                <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px dashed rgb(var(--primary) / 0.2)" }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}
                            sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Capacity &amp; Next Replenishment Trigger
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700,
                            color: isLow ? "error.main" : "success.main" }}>
                            {isLow ? `⚠️ Trigger Active (Below ${minCtn} Ctn)` : "✓ Stock Capacity Healthy"}
                        </Typography>
                    </Stack>

                    {/* Progress Bar Container with Vertical Refill Line Marker */}
                    <Box sx={{ position: "relative", height: 14, width: "100%", bgcolor: "rgb(var(--surface-container-high))", borderRadius: 999 }}>
                        {/* Fill Level */}
                        <Box sx={{
                            height: "100%",
                            width: `${fillPercent}%`,
                            bgcolor: isLow ? "error.main" : "primary.main",
                            borderRadius: 999,
                            transition: "width .3s",
                        }} />

                        {/* Vertical Refill Point Line Indicator */}
                        <Box sx={{
                            position: "absolute",
                            top: -3,
                            bottom: -3,
                            left: `${reorderPercent}%`,
                            width: "3px",
                            bgcolor: "warning.main",
                            borderRadius: "2px",
                            zIndex: 3,
                            boxShadow: "0 0 6px rgb(var(--warning) / 0.9)",
                        }} />
                    </Box>

                    {/* Legend */}
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: isLow ? "error.main" : "primary.main" }} />
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                Stock Fill ({fillPercent}%)
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 3, height: 10, bgcolor: "warning.main", borderRadius: 1 }} />
                            <Typography variant="caption" color="warning.main" fontWeight={700}>
                                Reorder Point (${minCtn} Ctn Line)
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "rgb(var(--outline))" }} />
                            <Typography variant="caption" color="text.secondary">
                                Max Cap (${maxCtn} Ctn)
                            </Typography>
                        </Stack>
                    </Stack>
                </Box>

                {/* ── Embedded Replenishment Rules ── */}
                <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2.5, bgcolor: "rgb(var(--surface-container-lowest) / 0.85)" }}>
                    <Typography variant="caption" fontWeight={800} color="primary.main"
                        sx={{ textTransform: "uppercase", letterSpacing: "0.05em", mb: 1, display: "block" }}>
                        Replenishment Rules &amp; Thresholds
                    </Typography>

                    {/* Min Stock Slider */}
                    <Box sx={{ mt: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <TrendingDownIcon sx={{ fontSize: 14, color: "warning.main" }} />
                                <Typography variant="caption" fontWeight={600}>
                                    Min Stock (Reorder Point)
                                </Typography>
                            </Stack>
                            <Chip size="small" label={`${minCtn} Ctn (${minPcs} pcs)`}
                                sx={{ height: 20, fontFamily: "monospace", fontSize: "0.65rem",
                                    fontWeight: 700, bgcolor: "rgb(var(--surface-container))" }} />
                        </Stack>
                        <Slider size="small" value={minCtn} min={1} max={Math.min(9, maxCtn - 1)} step={1}
                            onChange={(_, val) => setMinCtn(val as number)}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(val) => `${val} Ctn`}
                            sx={{ mt: 0.5 }} />
                    </Box>

                    {/* Max Store Capacity Slider */}
                    <Box sx={{ mt: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <VerticalAlignTopIcon sx={{ fontSize: 14, color: "primary.main" }} />
                                <Typography variant="caption" fontWeight={600}>
                                    Max Store Capacity
                                </Typography>
                            </Stack>
                            <Chip size="small" label={`${maxCtn} Ctn (${maxPcs} pcs)`}
                                color="primary" variant="outlined"
                                sx={{ height: 20, fontFamily: "monospace", fontSize: "0.65rem", fontWeight: 700 }} />
                        </Stack>
                        <Slider size="small" value={maxCtn} min={Math.min(minCtn + 1, 10)} max={10} step={1}
                            onChange={(_, val) => setMaxCtn(val as number)}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(val) => `${val} Ctn`}
                            sx={{ mt: 0.5 }} />
                    </Box>

                    {/* Auto Transfer Batch Size */}
                    <Paper variant="outlined" sx={{ mt: 1.25, p: 1, borderRadius: 1.5, bgcolor: "rgb(var(--surface-container-low))" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" fontWeight={700} display="block">
                                    Auto Transfer Batch Size
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.62rem" }}>
                                    Fires when stock &lt; min reorder point
                                </Typography>
                            </Box>
                            <TextField
                                type="number" size="small"
                                value={autoBatchCartons}
                                onChange={e => setAutoBatchCartons(Math.max(1, Number(e.target.value) || 1))}
                                inputProps={{ min: 1, max: 50,
                                    style: { width: 48, textAlign: "center", fontFamily: "monospace", fontWeight: 700 } }}
                                InputProps={{ endAdornment: <InputAdornment position="end">Ctn</InputAdornment> }}
                                sx={{ width: 100 }}
                            />
                        </Stack>
                        <Typography variant="caption" color="text.secondary"
                            sx={{ fontFamily: "monospace", fontSize: "0.62rem", mt: 0.5, display: "block" }}>
                            = {autoBatchPcs} pcs ({autoBatchCartons} Ctn)
                        </Typography>
                    </Paper>

                    {isLow && (
                        <Alert severity="error" icon={<LocalShippingIcon />}
                            sx={{ mt: 1.25, borderRadius: 1.5, py: 0.25 }}>
                            <Typography variant="caption" fontWeight={700}>
                                Auto-Transfer Triggered: {autoBatchCartons} Ctn ({autoBatchPcs} pcs) from {sourceLabel(source)}
                            </Typography>
                        </Alert>
                    )}

                    {/* Source & Action button */}
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
                        <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel>Primary Source</InputLabel>
                            <Select value={source} label="Primary Source"
                                onChange={e => setSource(e.target.value)}>
                                {REPLENISH_SOURCES.map(s => (
                                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button size="small" variant="contained"
                            startIcon={<LocalShippingIcon sx={{ fontSize: 14 }} />}
                            onClick={() =>
                                setToast(`Transfer requested — ${selectedLabels}: ${autoBatchPcs} pcs (${autoBatchCartons} Ctn) from ${sourceLabel(source)}`)
                            }>
                            Request Transfer
                        </Button>
                    </Stack>
                </Paper>
            </Paper>
        </Stack>
    );
}
// ─────────────────────────────────────────────────────────────────────────────
// ReplenishmentPanel — biggest packaging only
// ─────────────────────────────────────────────────────────────────────────────
type RuleState = { minPcs: number; maxPcs: number; autoBatchCartons: number; source: string };

export function ReplenishmentPanel({ variants }: { variants: Variant[] }) {
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
                source: "remote_warehouse",
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
                const minCtn = Math.max(1, Math.min(9, Math.round(r.minPcs / perCarton)));
                const maxCtn = Math.max(minCtn + 1, Math.min(10, Math.round(r.maxPcs / perCarton)));
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

                        <Paper variant="outlined" sx={{ mt: 1, p: 1, bgcolor: "background.paper", borderRadius: 1.5 }}>
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
                                        fontWeight: 700, bgcolor: "rgb(var(--surface-container))" }} />
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
                            <Slider size="small" value={maxCtn} min={Math.min(minCtn + 1, 10)} max={10} step={1}
                                onChange={(_, val) => update(v.id, { maxPcs: (val as number) * perCarton })}
                                valueLabelDisplay="auto"
                                valueLabelFormat={(val) => `${val} Ctn`}
                                sx={{ mt: 0.5 }} />
                        </Box>

                        <Paper variant="outlined" sx={{ mt: 1.25, p: 1, borderRadius: 1.5, bgcolor: "rgb(var(--surface-container-low))" }}>
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
                                    Auto-Transfer will fire: {r.autoBatchCartons} Ctn ({autoBatchPcs} pcs) from {sourceLabel(r.source)}
                                </Typography>
                            </Alert>
                        )}

                        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} alignItems="center">
                            <FormControl size="small" sx={{ flex: 1 }}>
                                <InputLabel>Primary Source</InputLabel>
                                <Select value={r.source} label="Primary Source"
                                    onChange={e => update(v.id, { source: e.target.value })}>
                                    {REPLENISH_SOURCES.map(s => (
                                        <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Button size="small" variant="contained"
                                disabled={Boolean(incoming)}
                                startIcon={<LocalShippingIcon sx={{ fontSize: 14 }} />}
                                onClick={() =>
                                    setToast(`Transfer requested — ${v.label}: ${autoBatchPcs} pcs (${r.autoBatchCartons} Ctn) from ${sourceLabel(r.source)}`)
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
export function StitchVariantCard({ v, highlighted, onEdit }: {
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
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: "rgb(var(--surface-container-low))" }}>
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

                        <Paper variant="outlined" sx={{ p: 1, bgcolor: "rgb(var(--surface-container-low))" }}>
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
function StitchProductCard({ store, item, customers, sellers }: {
    store: { id: number; name: string; }; item: InventoryItem; customers: Person[]; sellers: Person[];
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
                        bgcolor: "rgb(var(--surface-container))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Inventory2Icon sx={{ color: "rgb(var(--outline))", fontSize: 32 }} />
                        <Chip label={item.category} size="small"
                            sx={{ position: "absolute", bottom: 4, right: 4, height: 18, fontSize: "0.6rem",
                                bgcolor: "rgb(var(--inverse-surface) / 0.85)", color: "rgb(var(--inverse-on-surface))" }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Chip label={`SKU-${item.item_id}`} size="small"
                                sx={{ height: 20, fontSize: "0.65rem", fontFamily: "monospace",
                                    bgcolor: "rgb(var(--surface-container))", color: "text.secondary" }} />
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
                                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600, bgcolor: "rgb(var(--surface-container))" }} />
                        </Stack>
                    </Box>
                </Stack>
            </CardContent>

            <Box sx={{ px: 2, pb: 1.5 }}>
                <Button fullWidth variant="text"
                    onClick={() => router.visit(route("store.item.variants", { store: store.id, item: item.item_id }))}
                    sx={{
                        justifyContent: "space-between", px: 1.5, py: 1, borderRadius: 2,
                        bgcolor: "rgb(var(--surface-container-low))", textTransform: "none", color: "text.primary",
                        "&:hover": { bgcolor: "rgb(var(--surface-container))" },
                    }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <RuleSettingsIcon fontSize="small" sx={{ color: "primary.main" }} />
                        {/* <Typography variant="body2" fontWeight={600}>
                            Stock Rules, Breakdown & {item.total_variants} Variants
                        </Typography> */}
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="primary.main" fontWeight={600}>
                            Manage
                        </Typography>
                        <KeyboardArrowRightIcon fontSize="small" sx={{ color: "primary.main" }} />
                    </Stack>
                </Button>
            </Box>

            

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
// ─────────────────────────────────────────────────────────────────────────────
// Phone view: the seller's cards and bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
const etb = (v: string | number | null | undefined) =>
    v == null || v === "" ? "—" : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

/** A discount that is set and has not ended. */
const discountRuns = (price: unknown, endsAt: string | null | undefined) =>
    price != null && price !== "" && (!endsAt || new Date(endsAt).getTime() >= Date.now() - 86_400_000);

function stockPill(item: InventoryItem): { label: string; color: "success" | "warning" | "error" } {
    if (item.total_stock <= 0) return { label: "Out of stock", color: "error" };
    const low = item.variants.filter(v => v.active && v.stock < (v.min_reorder ?? v.multiplier * 5)).length;
    return low > 0 ? { label: `${low} low`, color: "warning" } : { label: "In stock", color: "success" };
}

/** One catalogue card, as the seller app draws it: picture first, then name and price. */
function MobileItemCard({ item, onOpen }: { item: InventoryItem; onOpen: () => void }) {
    const [broken, setBroken] = useState(!item.image_url);
    const pill = stockPill(item);
    const onSale = item.variants.some(v => v.active && discountRuns(v.discount_price, v.discount_ends_at));

    return (
        <Paper component="button" type="button" onClick={onOpen} variant="outlined"
            sx={{ p: 0, textAlign: "left", borderRadius: 4, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column",
                bgcolor: "background.paper", color: "text.primary", font: "inherit", width: "100%",
                transition: "transform .15s, box-shadow .15s", "&:active": { transform: "scale(.98)" }, "&:hover": { boxShadow: 3 } }}>
            <Box sx={{ position: "relative", width: "100%", aspectRatio: "1 / 1", bgcolor: "action.hover", display: "grid", placeItems: "center" }}>
                {broken ? (
                    <Scene kind="parcel" size={56} />
                ) : (
                    <Box component="img" src={item.image_url ?? undefined} alt={item.item_name} loading="lazy" onError={() => setBroken(true)}
                        sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <Chip size="small" color={pill.color} label={pill.label}
                    sx={{ position: "absolute", top: 8, left: 8, height: 22, fontSize: "0.65rem", fontWeight: 800 }} />
                {onSale && (
                    <Chip size="small" color="error" variant="filled" label="Sale"
                        sx={{ position: "absolute", top: 8, right: 8, height: 22, fontSize: "0.65rem", fontWeight: 800 }} />
                )}
            </Box>
            <Box sx={{ p: 1.25, display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" noWrap>{item.category}</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.5em" }}>
                    {item.item_name}
                </Typography>
                <Typography sx={{ fontWeight: 800, color: "primary.main", fontSize: "0.9rem" }}>
                    <Box component="span" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.7rem" }}>from </Box>
                    {etb(item.starting_price)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {item.total_variants} variant{item.total_variants === 1 ? "" : "s"} · {item.total_stock.toLocaleString()} pcs
                </Typography>
            </Box>
        </Paper>
    );
}

type PickField = "color" | "size" | "pack";

const PICK_FIELDS: Array<{ field: PickField; label: string }> = [
    { field: "color", label: "Color" },
    { field: "size", label: "Size" },
    { field: "pack", label: "Pack" },
];

const uniq = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter((v): v is string => !!v)));

const shortDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

/** A price, its discount (struck original) and when the discount ends. */
function PriceLine({ price, discount, endsAt, emphasis = false }: {
    price: string | number | null | undefined; discount?: string | number | null; endsAt?: string | null; emphasis?: boolean;
}) {
    const sale = discountRuns(discount, endsAt);

    return (
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: emphasis ? 16 : 14, color: sale ? "error.main" : "text.primary", whiteSpace: "nowrap" }}>
                {etb(sale ? discount : price)}
            </Typography>
            {sale && (
                <Typography variant="caption" sx={{ display: "block", color: "text.disabled", textDecoration: "line-through", lineHeight: 1.2 }}>
                    {etb(price)}
                </Typography>
            )}
            {sale && endsAt && (
                <Typography variant="caption" sx={{ display: "block", color: "warning.main", fontWeight: 700, lineHeight: 1.2 }}>
                    until {shortDate(endsAt)}
                </Typography>
            )}
        </Box>
    );
}

/** One group of prices on the selected variant, in the seller's list style. */
function PriceGroup({ title, caption, count, children }: { title: string; caption: string; count?: number; children: React.ReactNode }) {
    return (
        <Box sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.75, py: 1.25, bgcolor: "rgb(var(--surface-container-low))" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{title}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>{caption}</Typography>
                </Box>
                {count !== undefined && <Chip size="small" label={count} color={count > 0 ? "primary" : "default"} sx={{ fontWeight: 800, height: 22 }} />}
            </Stack>
            <Box sx={{ "& > *:not(:last-child)": { borderBottom: "1px solid", borderColor: "divider" } }}>{children}</Box>
        </Box>
    );
}

function PriceRow({ who, sub, children }: { who: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1.75, py: 1.25 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>{who}</Typography>
                {sub && <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>{sub}</Typography>}
            </Box>
            {children}
        </Stack>
    );
}

/**
 * The item's variants in the seller's add-to-cart sheet: picture and price on
 * top, Color / Size / Pack chips to pick a variant, then every price that
 * applies to it (business, individual, per customer, per seller) and its stock.
 * Where the seller has "Add to Cart", the admin has "Edit price".
 */
function VariantSheet({ store, item, customers, sellers, onClose }: {
    store: Props["store"]; item: InventoryItem; customers: Person[]; sellers: Person[]; onClose: () => void;
}) {
    const [variants, setVariants] = useState<Variant[]>(item.variants);
    const [selectedId, setSelectedId] = useState<number>(() => (item.variants.find(v => v.active) ?? item.variants[0])?.id);
    const [editing, setEditing] = useState<Variant | null>(null);
    const v = variants.find(x => x.id === selectedId) ?? variants[0];

    // Pick by colour / size / pack when the variants carry them, else by label.
    const fields = PICK_FIELDS.filter(({ field }) => uniq(variants.map(x => x[field])).length > 0);
    const choose = (field: PickField, value: string) => {
        const match = variants.find(x => x[field] === value && fields.every(f => f.field === field || !v?.[f.field] || x[f.field] === v[f.field]))
            ?? variants.find(x => x[field] === value);
        if (match) setSelectedId(match.id);
    };
    const reachable = (field: PickField, value: string) =>
        variants.some(x => x[field] === value && fields.every(f => f.field === field || !v?.[f.field] || x[f.field] === v[f.field]));

    const saved = (updated: Variant) => {
        setVariants(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)));
        setEditing(null);
        router.reload({ only: ["inventory", "summary"] });
    };

    if (!v) return null;

    const individual = v.individual_price;
    const selling = (v as Variant & { final_price?: number | string | null }).final_price ?? (discountRuns(v.discount_price, v.discount_ends_at) ? v.discount_price : v.price);
    const stockPieces = v.stock * (v.multiplier || 1);
    const businessCustomers = v.customer_prices.filter(cp => (cp.customer_type ?? (cp.tin_number ? "individual" : "business")) === "business");
    const individualCustomers = v.customer_prices.filter(cp => !businessCustomers.includes(cp));

    return (
        <>
            <Drawer anchor="bottom" open onClose={onClose}
                PaperProps={{ sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, width: "min(100%, 480px)", mx: "auto", maxHeight: "90dvh",
                    display: "flex", flexDirection: "column", pb: "env(safe-area-inset-bottom)", overflow: "hidden", bgcolor: "background.paper" } }}>
                {/* Header: picture + price + close, as in the seller sheet. */}
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, p: 2, pb: 1.5, bgcolor: "rgb(var(--primary-container) / 0.6)", position: "relative" }}>
                    <Box sx={{ width: 88, height: 88, flexShrink: 0, borderRadius: 2, overflow: "hidden", bgcolor: "rgb(var(--surface-bright))", boxShadow: 3, mb: -2, display: "grid", placeItems: "center" }}>
                        {item.image_url
                            ? <Box component="img" src={item.image_url} alt={item.item_name} sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            : <Scene kind="parcel" size={56} />}
                    </Box>
                    <Box sx={{ flex: 1, pb: 2, minWidth: 0 }}>
                        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ flexWrap: "wrap" }}>
                            <Typography sx={{ fontWeight: 800, color: "error.main", fontSize: 22, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                                {sellerPrice(Number(selling))}
                            </Typography>
                            <Chip size="small" label={v.active ? "On sale here" : "Switched off"} color={v.active ? "success" : "default"}
                                sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />
                        </Stack>
                        {discountRuns(v.discount_price, v.discount_ends_at) && (
                            <Typography variant="caption" sx={{ color: "text.disabled", textDecoration: "line-through" }}>{sellerPrice(Number(v.price))}</Typography>
                        )}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }} noWrap>
                            {item.item_name} · {[v.color, v.size, v.pack].filter(Boolean).join(" · ") || v.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>{v.sku}</Typography>
                    </Box>
                    <IconButton onClick={onClose} size="small" aria-label="Close"
                        sx={{ position: "absolute", top: 10, right: 10, bgcolor: "rgb(var(--on-surface) / 0.06)", "&:hover": { bgcolor: "rgb(var(--on-surface) / 0.12)" } }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                <Box sx={{ overflowY: "auto", flex: 1 }}>
                    <Stack spacing={2.5} sx={{ p: 2, pt: 3 }}>
                        {/* Pick the variant the way a seller does. */}
                        {fields.length > 0 ? fields.map(({ field, label }) => (
                            <ChipGroup key={field} label={label}
                                options={uniq(variants.map(x => x[field])).filter(option => reachable(field, option) || v[field] === option)}
                                selected={v[field] ?? ""} onSelect={value => choose(field, value)} />
                        )) : (
                            <ChipGroup label="Variant" options={variants.map(x => x.label)} selected={v.label}
                                onSelect={label => { const match = variants.find(x => x.label === label); if (match) setSelectedId(match.id); }} />
                        )}

                        {/* Every price that applies to this variant. */}
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 1.25 }}>Prices applied</Typography>
                            <Stack spacing={1.25}>
                                <PriceGroup title="Business" caption="Default price for customers with no TIN">
                                    <PriceRow who="Everyone" sub={discountRuns(v.discount_price, v.discount_ends_at) ? "Discount running" : "No discount"}>
                                        <PriceLine price={v.price} discount={v.discount_price} endsAt={v.discount_ends_at} emphasis />
                                    </PriceRow>
                                    {businessCustomers.map(cp => (
                                        <PriceRow key={cp.id} who={cp.customer_name} sub="Customer price">
                                            <PriceLine price={cp.price} discount={cp.discount_price} endsAt={cp.discount_ends_at} />
                                        </PriceRow>
                                    ))}
                                </PriceGroup>

                                <PriceGroup title="Individual" caption="Customers with a TIN, VAT included">
                                    <PriceRow who="Everyone" sub={individual ? (individual.active ? "Set for this variant" : "Set, but switched off") : "Business price + VAT"}>
                                        <PriceLine price={individual?.price ?? includingVat(v.price)} discount={individual?.discount_price ?? null} endsAt={individual?.discount_ends_at ?? null} emphasis />
                                    </PriceRow>
                                    {individualCustomers.map(cp => (
                                        <PriceRow key={cp.id} who={cp.customer_name} sub="Customer price">
                                            <PriceLine price={cp.individual_price ?? cp.price} discount={cp.discount_price} endsAt={cp.discount_ends_at} />
                                        </PriceRow>
                                    ))}
                                </PriceGroup>

                                <PriceGroup title="Customer prices" caption="Agreed with one customer" count={v.customer_prices.length}>
                                    {v.customer_prices.length === 0
                                        ? <PriceRow who={<Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>None set</Box>}>{null}</PriceRow>
                                        : v.customer_prices.map(cp => (
                                            <PriceRow key={cp.id} who={cp.customer_name} sub={(cp.customer_type ?? (cp.tin_number ? "individual" : "business")) === "individual" ? "Individual" : "Business"}>
                                                <PriceLine price={cp.price} discount={cp.discount_price} endsAt={cp.discount_ends_at} />
                                            </PriceRow>
                                        ))}
                                </PriceGroup>

                                <PriceGroup title="Seller prices" caption="What one seller may sell at" count={v.seller_prices.length}>
                                    {v.seller_prices.length === 0
                                        ? <PriceRow who={<Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>None set</Box>}>{null}</PriceRow>
                                        : v.seller_prices.map(sp => (
                                            <PriceRow key={sp.id} who={sp.seller_name || "Seller"} sub={sp.individual ? `Individual: ${etb(sp.individual.discount_price ?? sp.individual.price)}` : "Business"}>
                                                <PriceLine price={sp.business?.price ?? sp.price} discount={sp.business?.discount_price ?? sp.discount_price} endsAt={sp.business?.discount_ends_at ?? sp.discount_ends_at} />
                                            </PriceRow>
                                        ))}
                                </PriceGroup>
                            </Stack>
                        </Box>

                        <InventoryDetailList inStock={stockPieces > 0} stockCount={stockPieces} />

                        <Button component={Link} href={route("store.item.variants", { store: store.id, item: item.item_id })}
                            variant="text" endIcon={<KeyboardArrowRightIcon />} sx={{ alignSelf: "flex-start" }}>
                            Stock, rules and replenishment
                        </Button>
                    </Stack>
                </Box>

                {/* Sticky footer: the seller's "Add to Cart" is the admin's "Edit price". */}
                <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, pb: "calc(16px + env(safe-area-inset-bottom))" }}>
                    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>Selling at</Typography>
                        <Typography sx={{ fontWeight: 800, color: "primary.main", fontSize: 16 }}>{sellerPrice(Number(selling))}</Typography>
                    </Box>
                    <Button onClick={() => setEditing(v)} variant="contained" startIcon={<EditIcon />}
                        sx={{ height: 56, px: 3, borderRadius: 99, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", "&:active": { transform: "scale(0.95)" }, boxShadow: "0 8px 20px rgb(var(--primary) / 0.2)" }}>
                        Edit price
                    </Button>
                </Box>
            </Drawer>
            {editing && (
                <EditDrawer variant={editing} customers={customers} sellers={sellers} onClose={() => setEditing(null)} onSaved={saved} />
            )}
        </>
    );
}

const FILTER_CHIPS: Array<{ value: StoreFilter; label: string; color: "primary" | "success" | "warning" | "error" }> = [
    { value: "all", label: "All items", color: "primary" },
    { value: "active", label: "Active", color: "success" },
    { value: "low", label: "Below min level", color: "warning" },
    { value: "out", label: "Out of stock", color: "error" },
];

/**
 * Search, the filters and three whole-store tiles. The filters run on the
 * server (`?filter=`), so they cover every item, not just this page.
 * Replenish and Price deviations are tabs above, not chips here.
 */
function CatalogTopBar({ store, summary, filter, onSearch, search }: {
    store: Props["store"];
    summary: StoreSummary;
    filter: StoreFilter;
    search: string;
    onSearch: (v: string) => void;
}) {
    const [scanOpen, setScanOpen] = useState(false);

    const countFor = (value: StoreFilter): number =>
        value === "all" ? summary.items : value === "active" ? summary.active : value === "low" ? summary.low : summary.out;

    const setFilter = (value: StoreFilter) =>
        router.get(route("store.show", store.id), value === "all" ? {} : { filter: value }, { preserveScroll: true, preserveState: true });

    const tile = { p: 1.25, borderRadius: 2 } as const;
    const tileLabel = { textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: "0.6rem" } as const;

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
                            bgcolor: "transparent", fontFamily: "inherit", color: "text.primary" }} />
                </Paper>
                <IconButton color="primary" onClick={() => setScanOpen(true)} aria-label="Scan barcode"
                    sx={{ bgcolor: "primary.main", color: "primary.contrastText",
                        "&:hover": { bgcolor: "primary.dark" }, width: 44, height: 44, borderRadius: 2 }}>
                    <QrCodeScannerIcon />
                </IconButton>
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5,
                "&::-webkit-scrollbar": { display: "none" } }}>
                {FILTER_CHIPS.map(chip => {
                    const selected = filter === chip.value;
                    return (
                        <Chip key={chip.value} size="small"
                            label={`${chip.label} (${countFor(chip.value)})`}
                            color={chip.color}
                            variant={selected ? "filled" : "outlined"}
                            onClick={selected ? undefined : () => setFilter(chip.value)}
                            sx={{ fontWeight: 700 }} />
                    );
                })}
            </Stack>

            {/* Two across on a phone (the third spans the row), three from sm. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1, mb: 1.5,
                "& > :last-of-type": { gridColumn: { xs: "1 / -1", sm: "auto" } } }}>
                <Paper variant="outlined" sx={tile}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary" sx={tileLabel}>Active variants</Typography>
                        <Inventory2Icon sx={{ fontSize: 14, color: "primary.main" }} />
                    </Stack>
                    <Typography variant="h6" fontWeight={800}>{summary.active_variants.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        of {summary.total_variants.toLocaleString()} carried here
                    </Typography>
                </Paper>
                <Paper variant="outlined" sx={tile}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary" sx={tileLabel}>In stock</Typography>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: summary.out > 0 ? "warning.main" : "success.main" }} />
                    </Stack>
                    <Typography variant="h6" fontWeight={800}>
                        {summary.in_stock_rate === null ? "—" : `${summary.in_stock_rate}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {summary.out > 0 ? `${summary.out} item${summary.out === 1 ? "" : "s"} out of stock` : "Every item has stock"}
                    </Typography>
                </Paper>
                <Paper variant="outlined" sx={tile}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary" sx={tileLabel}>Below min level</Typography>
                        <Typography sx={{ fontSize: 14, color: summary.low > 0 ? "error.main" : "text.secondary", fontWeight: 800 }}>!</Typography>
                    </Stack>
                    <Typography variant="h6" fontWeight={800} color={summary.low > 0 ? "error.main" : "text.primary"}>{summary.low}</Typography>
                    {summary.monitored_variants > 0 ? (
                        <Typography variant="caption" color="text.secondary">
                            {summary.monitored_variants} variant{summary.monitored_variants === 1 ? "" : "s"} have a min level
                        </Typography>
                    ) : (
                        <Typography variant="caption" component={Link} href={route("admin.inventory.capacity.index", { store_id: store.id })}
                            sx={{ color: "primary.main" }}>
                            No min levels set — Capacity
                        </Typography>
                    )}
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
const EMPTY_SUMMARY: StoreSummary = { items: 0, active: 0, low: 0, out: 0, in_stock_rate: null, active_variants: 0, total_variants: 0, monitored_variants: 0 };

export default function StoreInventory({ store, filter = "all", summary = EMPTY_SUMMARY, locations = [], inventory, customers = [], sellers = [] }: Props) {
    const [search, setSearch] = useState("");
    const phone = useMediaQuery(useTheme().breakpoints.down("md"));
    const [openItem, setOpenItem] = useState<InventoryItem | null>(null);

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
        // No horizontal padding on a phone: the layout already supplies the
        // gutter, and a second one here is what made this page need zooming out.
        <Box sx={{ px: { xs: 0, sm: 2, md: 3 }, py: { xs: 1, sm: 2, md: 3 }, maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
            <Head title={`${store?.name} Inventory`} />

            {/* The store's name and the tabs are above (SectionTabs). */}
            <Stack direction="row" spacing={1} alignItems="center" mb={2} flexWrap="wrap">
                <Chip label={store?.status} color={store?.status === "active" ? "success" : "default"}
                    variant="outlined" size="small" />
                {store?.location && (
                    <Typography variant="caption" color="text.secondary">{store.location}</Typography>
                )}
            </Stack>

            {locations.length > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: `repeat(${Math.min(locations.length, 3)}, minmax(0, 1fr))` }, gap: 1.5, mb: 2 }}>
                    {locations.map(site => (
                        <Paper key={site.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary"
                                sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                                {site.name}
                            </Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.2 }}>
                                {site.units.toLocaleString()} units
                            </Typography>
                            <Typography sx={{ fontFamily: "monospace", fontSize: "0.65rem", color: "text.secondary" }}>
                                {site.code}
                            </Typography>
                        </Paper>
                    ))}
                </Box>
            )}

            <CatalogTopBar store={store} summary={summary} filter={filter} search={search} onSearch={setSearch} />

            {filteredItems.length === 0 ? (
                <Alert severity="info">
                    {search
                        ? "No inventory matches your search."
                        : filter !== "all"
                            ? "No items match this filter."
                            : "This store has no inventory yet."}
                </Alert>
            ) : (
                <>
                    {phone ? (
                        /* Phone and tablet: the seller's picture cards; a tap opens the variant sheet. */
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
                            {filteredItems.map(item => (
                                <MobileItemCard key={item.item_id} item={item} onOpen={() => setOpenItem(item)} />
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
                            {filteredItems.map(item => (
                                <StitchProductCard key={item.item_id} store={store} item={item}
                                    customers={customers} sellers={sellers} />
                            ))}
                        </Box>
                    )}
                    {openItem && (
                        <VariantSheet key={openItem.item_id} store={store} item={openItem} customers={customers} sellers={sellers} onClose={() => setOpenItem(null)} />
                    )}

                    {meta && <InventoryPagination meta={meta} links={links} />}
                </>
            )}
        </Box>
    );
}

StoreInventory.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;