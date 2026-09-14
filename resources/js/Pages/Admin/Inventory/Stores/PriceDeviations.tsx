// resources/js/Pages/Admin/Inventory/Stores/PriceDeviations.tsx
import React, { useMemo, useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import axios from "axios";
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Stack, Chip,
    IconButton, Alert, Tabs, Tab, Snackbar, useMediaQuery,
    useTheme, Card, CardContent, Tooltip, TextField,
    InputAdornment,
} from "@mui/material";
import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    TrendingDown as TrendingDownIcon,
    Schedule as ScheduleIcon,
    Cancel as CancelIcon,
    Save as SaveIcon,
    Warning as WarningIcon,
} from "@mui/icons-material";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface VariantRef {
    id: number;
    sku: string;
    label: string;
    multiplier: number;
}

interface Deviation {
    id: number;
    variant: VariantRef;
    tier: "b2b" | "individual" | "customer" | "seller";
    subject?: string | null;
    price: number;
    discount_price: number;
    discount_ends_at: string;
    days_left?: number;
}

interface Props {
    store: { id: number; name: string; location?: string; status: string };
    deviations: Deviation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v: number | null | undefined) =>
    v != null ? `$${Number(v).toFixed(2)}` : "—";

const daysLeftFromIso = (iso: string) => {
    const end = new Date(iso).getTime();
    const diff = end - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const tierLabel = (t: Deviation["tier"]) =>
    t === "b2b" ? "B2B" : t === "individual" ? "Individual" : t === "customer" ? "Customer" : "Seller";

const tierColor = (t: Deviation["tier"]) =>
    t === "b2b" ? "info" : t === "individual" ? "success" : t === "customer" ? "primary" : "secondary";

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function PriceDeviations({ store, deviations = [] }: Props) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const [tab, setTab] = useState<"all" | "b2b" | "individual" | "customer" | "seller">("all");
    const [toast, setToast] = useState<string | null>(null);
    const [editing, setEditing] = useState<Deviation | null>(null);
    const [editPrice, setEditPrice] = useState("");
    const [editEnds, setEditEnds] = useState("");
    const [busy, setBusy] = useState<number | null>(null);

    const filtered = useMemo(() => {
        const base = tab === "all" ? deviations : deviations.filter(d => d.tier === tab);
        return [...base].sort((a, b) => {
            const da = a.days_left ?? daysLeftFromIso(a.discount_ends_at);
            const db = b.days_left ?? daysLeftFromIso(b.discount_ends_at);
            return da - db;
        });
    }, [deviations, tab]);

    const counts = useMemo(() => ({
        all: deviations.length,
        b2b: deviations.filter(d => d.tier === "b2b").length,
        individual: deviations.filter(d => d.tier === "individual").length,
        customer: deviations.filter(d => d.tier === "customer").length,
        seller: deviations.filter(d => d.tier === "seller").length,
    }), [deviations]);

    const openEdit = (d: Deviation) => {
        setEditing(d);
        setEditPrice(String(d.discount_price ?? ""));
        setEditEnds((d.discount_ends_at ?? "").substring(0, 10));
    };

    const save = async () => {
        if (!editing) return;
        setBusy(editing.id);
        try {
            await axios.patch(
                route("store-price-override.update", { source: editing.tier, id: editing.id }),
                {
                    discount_price: editPrice || null,
                    discount_ends_at: editEnds || null,
                }
            );
            setToast(`Updated — ${editing.variant.label}`);
            setEditing(null);
            router.reload({ only: ["deviations"] });
        } catch {
            setToast("Could not save — try again.");
        } finally {
            setBusy(null);
        }
    };

    const removeOverride = async (d: Deviation) => {
        setBusy(d.id);
        try {
            await axios.delete(
                route("store-price-override.destroy", { source: d.tier, id: d.id })
            );
            setToast(`Discount removed — ${d.variant.label}`);
            router.reload({ only: ["deviations"] });
        } catch {
            setToast("Could not remove — try again.");
        } finally {
            setBusy(null);
        }
    };

    const UrgencyChip = ({ days }: { days: number }) => {
        if (days < 0) {
            return <Chip size="small" color="error" icon={<WarningIcon sx={{ fontSize: 12 }} />}
                label={`Expired ${Math.abs(days)}d ago`}
                sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        }
        if (days <= 3) {
            return <Chip size="small" color="error" icon={<ScheduleIcon sx={{ fontSize: 12 }} />}
                label={`${days}d left`} sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        }
        if (days <= 14) {
            return <Chip size="small" color="warning"
                label={`${days}d left`} sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        }
        return <Chip size="small" variant="outlined"
            label={`${days}d left`} sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
    };

    const DeviationCard = ({ d }: { d: Deviation }) => {
        const days = d.days_left ?? daysLeftFromIso(d.discount_ends_at);
        const pct = d.price ? ((d.price - d.discount_price) / d.price) * 100 : 0;
        return (
            <Card sx={{ mb: 1.5, borderRadius: 2 }}>
                <CardContent sx={{ pb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                <Chip size="small" color={tierColor(d.tier) as any}
                                    label={tierLabel(d.tier)}
                                    sx={{ height: 20, fontSize: "0.62rem", fontWeight: 700 }} />
                                <UrgencyChip days={days} />
                            </Stack>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5, wordBreak: "break-word" }}>
                                {d.variant.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary"
                                sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                                {d.variant.sku}
                                {d.subject ? ` • ${d.subject}` : ""}
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap", gap: 1.5 }}>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Regular</Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                                {fmt(d.price)}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Discount</Typography>
                            <Typography variant="body2" fontWeight={700}
                                sx={{ fontFamily: "monospace", color: "error.main" }}>
                                {fmt(d.discount_price)}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Δ</Typography>
                            <Typography variant="body2" fontWeight={700} sx={{ fontFamily: "monospace" }}>
                                -{pct.toFixed(1)}%
                            </Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Ends</Typography>
                            <Typography variant="body2" fontWeight={700}>
                                {new Date(d.discount_ends_at).toLocaleDateString()}
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                        <Button size="small" variant="contained" fullWidth
                            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                            onClick={() => openEdit(d)}>
                            Extend / Edit
                        </Button>
                        <Button size="small" color="error" fullWidth
                            disabled={busy === d.id}
                            onClick={() => removeOverride(d)}>
                            Revert to Regular
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
        );
    };

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: "100%" }}>
            <Head title={`${store?.name} — Price Deviations`} />

            {/* Header */}
            <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap">
                <Button component={Link} href={route("store.show", store.id)}
                    startIcon={<ArrowBackIcon />} variant="outlined" size="small">
                    Back to Inventory
                </Button>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={800} noWrap>Price Deviations</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {store?.name} • discounts ending soon & reverted prices
                    </Typography>
                </Box>
            </Stack>

            <Alert severity="info" icon={<TrendingDownIcon />} sx={{ mb: 2, borderRadius: 2 }}>
                Variants below have an active <strong>discount_price</strong> that is about to expire.
                When the end date passes, the price reverts to the regular tier price automatically.
            </Alert>

            {/* Tier tabs */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
                sx={{ mb: 2, minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, fontSize: "0.75rem", textTransform: "none", fontWeight: 700 } }}>
                <Tab value="all" label={`All (${counts.all})`} />
                <Tab value="b2b" label={`Business (${counts.b2b})`} />
                <Tab value="individual" label={`Individual (${counts.individual})`} />
                <Tab value="customer" label={`Customer (${counts.customer})`} />
                <Tab value="seller" label={`Seller (${counts.seller})`} />
            </Tabs>

            {filtered.length === 0 ? (
                <Alert severity="success">No deviations — all discounts are healthy.</Alert>
            ) : isMobile ? (
                <Box>{filtered.map(d => <DeviationCard key={`${d.tier}-${d.id}`} d={d} />)}</Box>
            ) : (
                <TableContainer component={Paper} elevation={0}
                    sx={{ border: "1px solid #e0e0e0", borderRadius: 3 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: "grey.50" }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Variant</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Tier</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Subject</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Regular</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Discount</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Δ</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Ends</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Urgency</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(d => {
                                const days = d.days_left ?? daysLeftFromIso(d.discount_ends_at);
                                const pct = d.price ? ((d.price - d.discount_price) / d.price) * 100 : 0;
                                return (
                                    <TableRow key={`${d.tier}-${d.id}`} hover>
                                        <TableCell sx={{ fontWeight: 600 }}>{d.variant.label}</TableCell>
                                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>
                                            {d.variant.sku}
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" color={tierColor(d.tier) as any}
                                                label={tierLabel(d.tier)}
                                                sx={{ height: 20, fontSize: "0.62rem", fontWeight: 700 }} />
                                        </TableCell>
                                        <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                                            {d.subject ?? "—"}
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: "monospace" }}>{fmt(d.price)}</TableCell>
                                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 700, color: "error.main" }}>
                                            {fmt(d.discount_price)}
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: "monospace" }}>-{pct.toFixed(1)}%</TableCell>
                                        <TableCell>{new Date(d.discount_ends_at).toLocaleDateString()}</TableCell>
                                        <TableCell><UrgencyChip days={days} /></TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title="Extend / Edit">
                                                    <IconButton size="small" onClick={() => openEdit(d)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Revert to regular price">
                                                    <span>
                                                        <IconButton size="small" color="error"
                                                            disabled={busy === d.id}
                                                            onClick={() => removeOverride(d)}>
                                                            <CancelIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Edit dialog (inline paper) */}
            {editing && (
                <Paper elevation={6} sx={{
                    position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
                    p: 2, borderRadius: 3, zIndex: 1300, width: { xs: "calc(100% - 32px)", sm: 420 },
                    border: "1px solid #e0e0e0",
                }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Typography variant="subtitle2" fontWeight={700}>
                            Edit — {editing.variant.label}
                        </Typography>
                        <IconButton size="small" onClick={() => setEditing(null)}>
                            <CancelIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                    <Stack spacing={1.5}>
                        <TextField label="Discount Price" type="number" size="small" fullWidth
                            value={editPrice} onChange={e => setEditPrice(e.target.value)}
                            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                        <TextField label="Discount Ends At" type="date" size="small" fullWidth
                            value={editEnds} onChange={e => setEditEnds(e.target.value)}
                            InputLabelProps={{ shrink: true }} />
                        <Stack direction="row" spacing={1}>
                            <Button variant="contained" fullWidth
                                startIcon={<SaveIcon />} disabled={busy === editing.id}
                                onClick={save}>
                                Save
                            </Button>
                            <Button color="inherit" onClick={() => setEditing(null)}>Cancel</Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}

            <Snackbar open={Boolean(toast)} autoHideDuration={2800} onClose={() => setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>
            </Snackbar>
        </Box>
    );
}

PriceDeviations.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;