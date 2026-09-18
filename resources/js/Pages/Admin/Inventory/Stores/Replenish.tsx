// resources/js/Pages/Admin/Inventory/Stores/Replenish.tsx
import React, { useMemo, useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import axios from "axios";
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Stack, Chip,
    IconButton, Alert, Tabs, Tab, Snackbar, useMediaQuery,
    useTheme, Card, CardContent, Tooltip, Pagination,
} from "@mui/material";
import {
    ArrowBack as ArrowBackIcon,
    LocalShipping as LocalShippingIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Autorenew as AutorenewIcon,
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

interface TransferRow {
    id: number;
    status: "in_transit" | "queued" | "completed" | "cancelled";
    variant: VariantRef;
    qty: number;
    cartons: number;
    source: string;
    destination: string;
    requested_at: string;
    eta?: string | null;
    completed_at?: string | null;
    note?: string | null;
}

interface Props {
    store: { id: number; name: string; location?: string; status: string };
    transfers: TransferRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
    WHSEA: "Warehouse A",
    REMOTE: "Remote Hub",
    WHSEB: "Warehouse B",
    STORE: "Store Shelf",
};

const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

function StatusChip({ status }: { status: TransferRow["status"] }) {
    switch (status) {
        case "in_transit":
            return <Chip size="small" icon={<LocalShippingIcon sx={{ fontSize: 12 }} />}
                label="In Transit" color="info" sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        case "queued":
            return <Chip size="small" icon={<AutorenewIcon sx={{ fontSize: 12 }} />}
                label="Auto-Queued" color="warning"
                sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        case "completed":
            return <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 12 }} />}
                label="Received" color="success"
                sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
        case "cancelled":
            return <Chip size="small" icon={<CancelIcon sx={{ fontSize: 12 }} />}
                label="Cancelled" variant="outlined"
                sx={{ height: 22, fontSize: "0.65rem", fontWeight: 700 }} />;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Replenish({ store, transfers = [] }: Props) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const [tab, setTab] = useState<"in_transit" | "queued" | "completed" | "cancelled">("in_transit");
    const [toast, setToast] = useState<string | null>(null);
    const [busy, setBusy] = useState<number | null>(null);

    const byStatus = useMemo(() => {
        const buckets: Record<string, TransferRow[]> = {
            in_transit: [], queued: [], completed: [], cancelled: [],
        };
        transfers.forEach(t => { (buckets[t.status] ??= []).push(t); });
        return buckets;
    }, [transfers]);

    const counts = {
        in_transit: byStatus.in_transit.length,
        queued: byStatus.queued.length,
        completed: byStatus.completed.length,
        cancelled: byStatus.cancelled.length,
    };

    const rows = byStatus[tab] ?? [];

    const cancelTransfer = async (id: number) => {
        setBusy(id);
        try {
            await axios.patch(route("store-transfer.cancel", id));
            setToast(`Transfer #${id} cancelled`);
            router.reload({ only: ["transfers"] });
        } catch {
            setToast("Could not cancel — try again.");
        } finally {
            setBusy(null);
        }
    };

    const markReceived = async (id: number) => {
        setBusy(id);
        try {
            await axios.patch(route("store-transfer.receive", id));
            setToast(`Transfer #${id} marked received`);
            router.reload({ only: ["transfers"] });
        } catch {
            setToast("Could not update — try again.");
        } finally {
            setBusy(null);
        }
    };

    const fireNow = async (t: TransferRow) => {
        setBusy(t.id);
        try {
            await axios.patch(route("store-transfer.dispatch", t.id), {
                store_variant_id: t.variant.id,
                quantity: t.qty,
            });
            setToast("Transfer dispatched successfully");
            router.reload({ only: ["transfers"] });
        } catch (err) {
            console.error("Dispatch error:", err);
            setToast("Could not dispatch — try again.");
        } finally {
            setBusy(null);
        }
    };

    const TransferCard = ({ t }: { t: TransferRow }) => (
        <Card sx={{ mb: 1.5, borderRadius: 2 }}>
            <CardContent sx={{ pb: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                                #{t.id}
                            </Typography>
                            <StatusChip status={t.status} />
                        </Stack>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5, wordBreak: "break-word" }}>
                            {t.variant.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary"
                            sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                            {t.variant.sku}
                        </Typography>
                    </Box>
                </Stack>

                <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap" gap={1.5}>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Quantity</Typography>
                        <Typography variant="body2" fontWeight={700}>
                            {t.cartons} Ctn <Typography component="span" variant="caption"
                                color="text.secondary">({t.qty} pcs)</Typography>
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">From</Typography>
                        <Typography variant="body2" fontWeight={700}>
                            {SOURCE_LABEL[t.source] ?? t.source}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Requested</Typography>
                        <Typography variant="body2" fontWeight={700}>
                            {timeAgo(t.requested_at)}
                        </Typography>
                    </Box>
                    {t.eta && (
                        <Box>
                            <Typography variant="caption" color="text.secondary">ETA</Typography>
                            <Typography variant="body2" fontWeight={700}>{fmtTime(t.eta)}</Typography>
                        </Box>
                    )}
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    {t.status === "queued" && (
                        <>
                            <Button size="small" variant="contained" fullWidth
                                startIcon={<LocalShippingIcon sx={{ fontSize: 14 }} />}
                                disabled={busy === t.id}
                                onClick={() => fireNow(t)}>
                                Dispatch Now
                            </Button>
                            <Button size="small" color="inherit" fullWidth
                                disabled={busy === t.id}
                                onClick={() => cancelTransfer(t.id)}>
                                Cancel
                            </Button>
                        </>
                    )}
                    {t.status === "in_transit" && (
                        <>
                            <Button size="small" variant="contained" color="success" fullWidth
                                startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                disabled={busy === t.id}
                                onClick={() => markReceived(t.id)}>
                                Mark Received
                            </Button>
                            <Button size="small" color="inherit" fullWidth
                                disabled={busy === t.id}
                                onClick={() => cancelTransfer(t.id)}>
                                Cancel
                            </Button>
                        </>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: "100%" }}>
            <Head title={`${store?.name} — Replenishment`} />

            {/* Header */}
            <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap">
                <Button component={Link} href={route("store.show", store.id)}
                    startIcon={<ArrowBackIcon />} variant="outlined" size="small">
                    Back to Inventory
                </Button>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={800} noWrap>Replenishment</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {store?.name} • transfers, auto-requests & history
                    </Typography>
                </Box>
            </Stack>

            {/* KPI strip */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" }, gap: 1, mb: 2 }}>
                {[
                    { label: "In Transit", value: counts.in_transit, tone: "info.main", icon: <LocalShippingIcon sx={{ fontSize: 16 }} /> },
                    { label: "Auto-Queued", value: counts.queued, tone: "warning.main", icon: <AutorenewIcon sx={{ fontSize: 16 }} /> },
                    { label: "Received", value: counts.completed, tone: "success.main", icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
                    { label: "Cancelled", value: counts.cancelled, tone: "text.secondary", icon: <CancelIcon sx={{ fontSize: 16 }} /> },
                ].map(k => (
                    <Paper key={k.label} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary"
                                sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: "0.6rem" }}>
                                {k.label}
                            </Typography>
                            <Box sx={{ color: k.tone }}>{k.icon}</Box>
                        </Stack>
                        <Typography variant="h6" fontWeight={800} sx={{ color: k.tone }}>{k.value}</Typography>
                    </Paper>
                ))}
            </Box>

            {/* Tabs */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
                sx={{ mb: 2, minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, fontSize: "0.75rem", textTransform: "none", fontWeight: 700 } }}>
                <Tab value="in_transit" label={`In Transit (${counts.in_transit})`} />
                <Tab value="queued" label={`Auto-Queued (${counts.queued})`} />
                <Tab value="completed" label={`Received (${counts.completed})`} />
                <Tab value="cancelled" label={`Cancelled (${counts.cancelled})`} />
            </Tabs>

            {rows.length === 0 ? (
                <Alert severity="info">Nothing in this bucket yet.</Alert>
            ) : isMobile ? (
                <Box>{rows.map(t => <TransferCard key={t.id} t={t} />)}</Box>
            ) : (
                <TableContainer component={Paper} elevation={0}
                    sx={{ border: "1px solid #e0e0e0", borderRadius: 3 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: "grey.50" }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Variant</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Quantity</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>From</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Requested</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(t => (
                                <TableRow key={t.id} hover>
                                    <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>#{t.id}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{t.variant.label}</TableCell>
                                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>
                                        {t.variant.sku}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} alignItems="baseline">
                                            <Typography variant="body2" fontWeight={700}>
                                                {t.cartons} Ctn
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                ({t.qty} pcs)
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{SOURCE_LABEL[t.source] ?? t.source}</TableCell>
                                    <TableCell>
                                        <Tooltip title={fmtTime(t.requested_at)}>
                                            <Typography variant="caption">{timeAgo(t.requested_at)}</Typography>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell><StatusChip status={t.status} /></TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                            {t.status === "queued" && (
                                                <Tooltip title="Dispatch now">
                                                    <span>
                                                        <IconButton size="small" disabled={busy === t.id}
                                                            onClick={() => fireNow(t)}>
                                                            <LocalShippingIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                            {t.status === "in_transit" && (
                                                <Tooltip title="Mark received">
                                                    <span>
                                                        <IconButton size="small" color="success"
                                                            disabled={busy === t.id}
                                                            onClick={() => markReceived(t.id)}>
                                                            <CheckCircleIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                            {(t.status === "queued" || t.status === "in_transit") && (
                                                <Tooltip title="Cancel">
                                                    <span>
                                                        <IconButton size="small" color="error"
                                                            disabled={busy === t.id}
                                                            onClick={() => cancelTransfer(t.id)}>
                                                            <CancelIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Snackbar open={Boolean(toast)} autoHideDuration={2800} onClose={() => setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>
            </Snackbar>
        </Box>
    );
}

Replenish.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;