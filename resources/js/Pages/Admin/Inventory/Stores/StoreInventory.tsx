import React, { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Stack, Chip,
    IconButton, Collapse, Drawer, Divider, TextField, MenuItem,
    Select, FormControl, InputLabel, Tooltip, Alert, CircularProgress,
    Tabs, Tab, InputAdornment, Snackbar,
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface CustomerPrice {
    id: number;
    customer_id: number;
    customer_name: string;
    price: string | number;
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
    status: string;
    customer_prices: CustomerPrice[];
    seller_prices: SellerPrice[];
}

interface InventoryItem {
    item_id: number;
    item_name: string;
    category: string;
    total_variants: number;
    total_stock: number;
    variants: Variant[];
}

interface Person {
    id: number;
    first_name: string;
    last_name?: string;
}

interface Props {
    store: { id: number; name: string; location?: string; manager?: string; status: string };
    inventory: InventoryItem[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Toast Component
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
// Edit Drawer — one selected variant
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
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

    // ── Base price form ──────────────────────────────────────────────────────
    const [basePrice, setBasePrice] = useState(String(variant.price ?? ""));
    const [discountPrice, setDiscountPrice] = useState(String(variant.discount_price ?? ""));
    const [discountEndsAt, setDiscountEndsAt] = useState(variant.discount_ends_at?.substring(0, 10) ?? "");
    const [active, setActive] = useState(variant.active);

    // ── Local copies of price lists (for optimistic UI) ──────────────────────
    const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>(variant.customer_prices);
    const [sellerPrices, setSellerPrices] = useState<SellerPrice[]>(variant.seller_prices);

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
            price: cpPrice,
            discount_price: cpDiscount || null,
            discount_ends_at: cpEndsAt || null,
        });
        setCustomerPrices(prev => {
            const idx = prev.findIndex(cp => cp.customer_id === Number(cpCustomer));
            const row: CustomerPrice = {
                id: data.id,
                customer_id: data.customer_id,
                customer_name: data.customer?.first_name 
                    ? `${data.customer.first_name} ${data.customer.last_name ?? ''}`.trim()
                    : `Customer #${data.customer_id}`,
                price: data.price,
                discount_price: data.discount_price,
                discount_ends_at: data.discount_ends_at,
            };
            return idx >= 0 ? prev.map((cp, i) => i === idx ? row : cp) : [...prev, row];
        });
        setCpCustomer(""); setCpPrice(""); setCpDiscount(""); setCpEndsAt("");
    }, "Customer price saved successfully!");

    // Delete customer price
    const deleteCustomerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-customer-prices/${id}`);
        setCustomerPrices(prev => prev.filter(cp => cp.id !== id));
    }, "Customer price deleted successfully!");

    // Add / update seller price
    const addSellerPrice = () => wrap(async () => {
        const { data } = await axios.post(`/store-variants/${variant.id}/seller-prices`, {
            seller_id: spSeller,
            price: spPrice,
            discount_price: spDiscount || null,
            discount_ends_at: spEndsAt || null,
        });
        setSellerPrices(prev => {
            const idx = prev.findIndex(sp => sp.seller_id === Number(spSeller));
            const row: SellerPrice = {
                id: data.id,
                seller_id: data.seller_id,
                seller_name: data.seller?.first_name 
                    ? `${data.seller.first_name} ${data.seller.last_name ?? ''}`.trim()
                    : `Seller #${data.seller_id}`,
                price: data.price,
                discount_price: data.discount_price,
                discount_ends_at: data.discount_ends_at,
            };
            return idx >= 0 ? prev.map((sp, i) => i === idx ? row : sp) : [...prev, row];
        });
        setSpSeller(""); setSpPrice(""); setSpDiscount(""); setSpEndsAt("");
    }, "Seller price saved successfully!");

    // Delete seller price
    const deleteSellerPrice = (id: number) => wrap(async () => {
        await axios.delete(`/store-variant-seller-prices/${id}`);
        setSellerPrices(prev => prev.filter(sp => sp.id !== id));
    }, "Seller price deleted successfully!");

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
                        onChange={(_, v) => setTab(v)}
                        textColor="inherit"
                        TabIndicatorProps={{ style: { backgroundColor: "#fff" } }}
                        sx={{ mt: 1 }}
                    >
                        <Tab label="Base Price" sx={{ fontSize: 12 }} />
                        <Tab label="Customer Prices" sx={{ fontSize: 12 }} />
                        <Tab label="Seller Prices" sx={{ fontSize: 12 }} />
                    </Tabs>
                </Box>

                <Box sx={{ px: 3, py: 2, overflowY: "auto", flex: 1 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {/* ── TAB 0: Base Price ──────────────────────────────────────── */}
                    {tab === 0 && (
                        <Stack spacing={2.5} mt={1}>
                            <Typography variant="subtitle2" color="text.secondary">
                                Default price shown to all customers unless a specific price override exists.
                            </Typography>

                            <TextField
                                label="Base Price"
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
                                Save Base Price
                            </Button>
                        </Stack>
                    )}

                    {/* ── TAB 1: Customer Prices ─────────────────────────────────── */}
                    {tab === 1 && (
                        <Box mt={1}>
                            <Typography variant="subtitle2" color="text.secondary" mb={2}>
                                Per-customer price overrides for this variant in this store.
                            </Typography>

                            {customerPrices.length > 0 ? (
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
                                            {customerPrices.map(cp => (
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
                                    No customer-specific prices yet.
                                </Alert>
                            )}

                            <Divider sx={{ mb: 2 }} />
                            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                                Add / Update Customer Price
                            </Typography>

                            <Stack spacing={2}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Customer</InputLabel>
                                    <Select
                                        value={cpCustomer}
                                        label="Customer"
                                        onChange={e => setCpCustomer(String(e.target.value))}
                                    >
                                        {customers.map(c => (
                                            <MenuItem key={c.id} value={c.id}>
                                                {getPersonName(c)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Price"
                                    type="number"
                                    value={cpPrice}
                                    onChange={e => setCpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                />
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
                                    Save Customer Price
                                </Button>
                            </Stack>
                        </Box>
                    )}

                    {/* ── TAB 2: Seller Prices ───────────────────────────────────── */}
                    {tab === 2 && (
                        <Box mt={1}>
                            <Typography variant="subtitle2" color="text.secondary" mb={2}>
                                Per-seller price overrides for this variant in this store.
                            </Typography>

                            {sellerPrices.length > 0 ? (
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
                                            {sellerPrices.map(sp => (
                                                <TableRow key={sp.id} hover>
                                                    <TableCell>{sp.seller_name}</TableCell>
                                                    <TableCell>{fmt(sp.price)}</TableCell>
                                                    <TableCell>{fmt(sp.discount_price)}</TableCell>
                                                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>
                                                        {sp.discount_ends_at?.substring(0, 10) ?? "—"}
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
                                    No seller-specific prices yet.
                                </Alert>
                            )}

                            <Divider sx={{ mb: 2 }} />
                            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                                Add / Update Seller Price
                            </Typography>

                            <Stack spacing={2}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Seller</InputLabel>
                                    <Select
                                        value={spSeller}
                                        label="Seller"
                                        onChange={e => setSpSeller(String(e.target.value))}
                                    >
                                        {sellers.map(s => (
                                            <MenuItem key={s.id} value={s.id}>
                                                {getPersonName(s)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Price"
                                    type="number"
                                    value={spPrice}
                                    onChange={e => setSpPrice(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                    size="small"
                                    fullWidth
                                />
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
// Row — one inventory item row with collapsible variants
// ─────────────────────────────────────────────────────────────────────────────
function Row({
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

    const handleSaved = (updated: Variant) => {
        setVariants(prev => prev.map(v => v.id === updated.id ? updated : v));
        setEditing(updated);
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
                    <Chip label={`${item.total_variants} Variants`} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                    <Typography
                        fontWeight="bold"
                        color={item.total_stock > 0 ? "success.main" : "error.main"}
                    >
                        {item.total_stock} Units
                    </Typography>
                </TableCell>
            </TableRow>

            {/* Collapsible variant detail */}
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ m: 2, bgcolor: "action.hover", p: 2, borderRadius: 2 }}>
                            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                                Variants — {item.item_name}
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Base Price</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Discount</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Stock</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="center">Edit</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {variants.map(v => (
                                        <TableRow key={v.id} hover>
                                            <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                                                {v.sku}
                                            </TableCell>
                                            <TableCell>{v.label}</TableCell>
                                            <TableCell>{fmt(v.price)}</TableCell>
                                            <TableCell>{fmt(v.discount_price)}</TableCell>
                                            <TableCell>{v.stock}</TableCell>
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
                                    ))}
                                </TableBody>
                            </Table>
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
// Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function StoreInventory({ store, inventory = [], customers = [], sellers = [] }: Props) {
    const items = Array.isArray(inventory) ? inventory : [];

    return (
        <Box p={3}>
            <Head title={`${store?.name} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3}>
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
                <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{ border: "1px solid #e0e0e0", borderRadius: 3 }}
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
                                <Row
                                    key={item.item_id}
                                    item={item}
                                    customers={customers}
                                    sellers={sellers}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}

StoreInventory.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;