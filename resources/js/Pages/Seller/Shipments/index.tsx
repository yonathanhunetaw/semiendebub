import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Chip,
    Stack,
    Button,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    IconButton,
    Tooltip,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import StoreIcon from "@mui/icons-material/Store";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TimerIcon from "@mui/icons-material/Timer";
import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BuildIcon from "@mui/icons-material/Build";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface ScheduledTransfer {
    id: number;
    reference: string;
    status: "scheduled" | "pending" | "overdue";
    origin: { name: string; detail: string };
    destination: { name: string; detail: string };
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    sku_count: number;
    total_cartons: number;
    vehicle_name: string;
    vehicle_plate: string;
    slot: string;
}

interface Props {
    scheduled_transfers: ScheduledTransfer[];
}

/* ----------------------------------------------------------
 | Status config
 |----------------------------------------------------------*/
const statusConfig = {
    scheduled: {
        label: "Scheduled",
        color: "success" as const,
        icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
    },
    pending: {
        label: "Pending Manifest",
        color: "warning" as const,
        icon: <WarningAmberIcon sx={{ fontSize: 16 }} />,
    },
    overdue: {
        label: "Overdue",
        color: "error" as const,
        icon: <ErrorIcon sx={{ fontSize: 16 }} />,
    },
};

/* ----------------------------------------------------------
 | DEMO facility / unit options (replace with API data)
 |----------------------------------------------------------*/
const FACILITIES = [
    { value: "central-hub", label: "Central Hub — Kality Logistics Center" },
    { value: "piazza-hub",  label: "Piazza Hub — Piazza Terminal 01" },
    { value: "bole-hub",    label: "Bole Hub — Bole Logistics Center" },
];

const UNITS = [
    { value: "main-store",   label: "Main Store — Merkato Terminal 01" },
    { value: "branch-store", label: "Branch Store — Piazza Terminal 02" },
    { value: "bole-store",   label: "Bole Store — Bole Terminal 03" },
];

/* ----------------------------------------------------------
 | Edit Route Dialog
 |----------------------------------------------------------*/
interface EditRouteDialogProps {
    open: boolean;
    transfer: ScheduledTransfer;
    onClose: () => void;
    onSave: (origin: { name: string; detail: string }, destination: { name: string; detail: string }) => void;
}

function EditRouteDialog({ open, transfer, onClose, onSave }: EditRouteDialogProps) {
    const [originVal, setOriginVal] = useState(
        FACILITIES.find((f) => transfer.origin.name.startsWith(f.label.split("—")[0].trim()))?.value ?? FACILITIES[0].value
    );
    const [destVal, setDestVal] = useState(
        UNITS.find((u) => transfer.destination.name.startsWith(u.label.split("—")[0].trim()))?.value ?? UNITS[0].value
    );

    const handleSave = () => {
        const originOpt = FACILITIES.find((f) => f.value === originVal)!;
        const destOpt   = UNITS.find((u) => u.value === destVal)!;
        const [oName, oDetail] = originOpt.label.split(" — ");
        const [dName, dDetail] = destOpt.label.split(" — ");
        onSave({ name: oName.trim(), detail: oDetail?.trim() ?? "" }, { name: dName.trim(), detail: dDetail?.trim() ?? "" });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Edit Route — {transfer.reference}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={2.5} mt={0.5}>
                    <TextField
                        select
                        label="Origin Facility"
                        value={originVal}
                        onChange={(e) => setOriginVal(e.target.value)}
                        size="small"
                        fullWidth
                        InputProps={{ startAdornment: <HomeWorkIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {FACILITIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                    </TextField>
                    <TextField
                        select
                        label="Target Unit"
                        value={destVal}
                        onChange={(e) => setDestVal(e.target.value)}
                        size="small"
                        fullWidth
                        InputProps={{ startAdornment: <StoreIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: "10px", textTransform: "none" }}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Save Route</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ----------------------------------------------------------
 | Add Shipment Dialog
 |----------------------------------------------------------*/
interface AddShipmentDialogProps {
    open: boolean;
    onClose: () => void;
}

function AddShipmentDialog({ open, onClose }: AddShipmentDialogProps) {
    const [origin, setOrigin] = useState(FACILITIES[0].value);
    const [dest, setDest]     = useState(UNITS[0].value);
    const [schedDate, setSchedDate] = useState("");
    const [schedTime, setSchedTime] = useState("08:00");

    const handleAdd = () => {
        // TODO: POST to seller.shipments.store (or a create endpoint) with form data
        alert(`Shipment request submitted!\nOrigin: ${origin}\nTarget: ${dest}\nScheduled: ${schedDate} ${schedTime}`);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <LocalShippingIcon color="primary" />
                    <span>New Shipment</span>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={2.5} mt={0.5}>
                    <TextField
                        select
                        label="Origin Facility"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        size="small"
                        fullWidth
                        InputProps={{ startAdornment: <HomeWorkIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {FACILITIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                    </TextField>
                    <TextField
                        select
                        label="Target Unit"
                        value={dest}
                        onChange={(e) => setDest(e.target.value)}
                        size="small"
                        fullWidth
                        InputProps={{ startAdornment: <StoreIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                    </TextField>
                    <Stack direction="row" spacing={1.5}>
                        <TextField
                            label="Scheduled Date"
                            type="date"
                            value={schedDate}
                            onChange={(e) => setSchedDate(e.target.value)}
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="Time"
                            type="time"
                            value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)}
                            size="small"
                            sx={{ width: 120 }}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: "10px", textTransform: "none" }}>Cancel</Button>
                <Button onClick={handleAdd} variant="contained" sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>
                    Add Shipment
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ----------------------------------------------------------
 | Transfer Selection Card
 |----------------------------------------------------------*/
function TransferCard({ t, onEditRoute }: { t: ScheduledTransfer; onEditRoute: (t: ScheduledTransfer) => void }) {
    const cfg = statusConfig[t.status];

    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                borderRadius: "16px",
                border: "1px solid",
                borderColor: t.status === "overdue" ? "error.light" : "divider",
                bgcolor: "background.paper",
            }}
        >
            {/* Top row */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            borderRadius: "10px",
                            bgcolor: "action.hover",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <LocalShippingIcon color="primary" sx={{ fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700}>{t.origin.name} → {t.destination.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{t.reference}</Typography>
                    </Box>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Chip icon={cfg.icon} label={cfg.label} size="small" color={cfg.color} sx={{ fontWeight: 700 }} />
                    <Tooltip title="Edit origin / target">
                        <IconButton size="small" onClick={() => onEditRoute(t)} sx={{ ml: 0.25 }}>
                            <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>

            {/* Route strip */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    bgcolor: "action.hover",
                    borderRadius: "10px",
                    p: 1.25,
                    mb: 1.5,
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.5} mb={0.25}>
                        <HomeWorkIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase" }}>Origin</Typography>
                    </Stack>
                    <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{t.origin.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{t.origin.detail}</Typography>
                </Box>
                <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                    <ArrowForwardIcon color="primary" sx={{ fontSize: 18 }} />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10 }}>{t.distance_km} km</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} mb={0.25}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase" }}>Target</Typography>
                        <StoreIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                    </Stack>
                    <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{t.destination.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{t.destination.detail}</Typography>
                </Box>
            </Box>

            {/* Meta row */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                    <ScheduleIcon sx={{ fontSize: 15, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>{t.scheduled_run}</Typography>
                </Stack>
                <Chip
                    icon={<TimerIcon sx={{ fontSize: 13 }} />}
                    label={t.cutoff_label}
                    size="small"
                    color={t.status === "overdue" ? "error" : "warning"}
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: 10 }}
                />
            </Stack>

            <Divider sx={{ mb: 1.5 }} />

            {/* Stats + action */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1.5}>
                    {[
                        { label: "SKUs", value: t.sku_count },
                        { label: "Cartons", value: t.total_cartons },
                        { label: t.slot, value: t.vehicle_plate },
                    ].map((s) => (
                        <Box key={s.label} sx={{ textAlign: "center" }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", display: "block" }}>{s.label}</Typography>
                            <Typography variant="caption" fontWeight={700} sx={{ fontFamily: "monospace" }}>{s.value}</Typography>
                        </Box>
                    ))}
                </Stack>
                <Button
                    component={Link}
                    href={route("seller.shipments.show", t.id)}
                    variant="contained"
                    size="small"
                    startIcon={<BuildIcon sx={{ fontSize: 15 }} />}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, fontSize: 12 }}
                >
                    Build Manifest
                </Button>
            </Stack>
        </Paper>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ScheduledTransfer | null>(null);

    // Local state so edits are reflected without a page reload
    const [transfers, setTransfers] = useState<ScheduledTransfer[]>(scheduled_transfers);

    const handleSaveRoute = (
        origin: { name: string; detail: string },
        destination: { name: string; detail: string }
    ) => {
        if (!editTarget) return;
        setTransfers((prev) =>
            prev.map((t) => (t.id === editTarget.id ? { ...t, origin, destination } : t))
        );
        setEditTarget(null);
    };

    return (
        <Box sx={{ px: 2, pt: 2 }}>
            <Head title="Shipments — Scheduled Runs" />

            {/* ── Header ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <LocalShippingIcon color="primary" />
                        <Typography variant="h5" fontWeight={800}>Shipments</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Select a scheduled corridor to start manifest configuration.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setAddOpen(true)}
                        sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}
                    >
                        Add Shipment
                    </Button>
                    <Chip
                        icon={<SyncAltIcon sx={{ fontSize: 14 }} />}
                        label="ERP-SYNC: ACTIVE"
                        color="primary"
                        size="small"
                        sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}
                    />
                </Stack>
            </Stack>

            {/* ── Status filter chips ── */}
            <Stack direction="row" spacing={1} mb={2.5} flexWrap="wrap">
                {[
                    { label: `All (${transfers.length})`, active: true },
                    { label: "Scheduled", active: false },
                    { label: "Pending", active: false },
                    { label: "Overdue", active: false },
                ].map((chip) => (
                    <Chip
                        key={chip.label}
                        label={chip.label}
                        size="small"
                        variant={chip.active ? "filled" : "outlined"}
                        color={chip.active ? "primary" : "default"}
                        sx={{ fontWeight: chip.active ? 700 : 500, cursor: "pointer" }}
                    />
                ))}
            </Stack>

            {/* ── Transfer list ── */}
            <Stack spacing={1.5}>
                {transfers.map((t) => (
                    <TransferCard key={t.id} t={t} onEditRoute={setEditTarget} />
                ))}
            </Stack>

            {/* ── Dialogs ── */}
            <AddShipmentDialog open={addOpen} onClose={() => setAddOpen(false)} />
            {editTarget && (
                <EditRouteDialog
                    open={!!editTarget}
                    transfer={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSave={handleSaveRoute}
                />
            )}
        </Box>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
