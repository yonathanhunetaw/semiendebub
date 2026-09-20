import React, { useState } from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Chip,
    LinearProgress,
    Button,
    Stack,
    Divider,
    Dialog,
    DialogContent,
    TextField,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import StoreIcon from "@mui/icons-material/Store";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import ReportIcon from "@mui/icons-material/Report";
import WarningIcon from "@mui/icons-material/Warning";
import InventoryIcon from "@mui/icons-material/Inventory";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import TimerIcon from "@mui/icons-material/Timer";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SyncIcon from "@mui/icons-material/Sync";
import VisibilityIcon from "@mui/icons-material/Visibility";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface Vehicle {
    id: string;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
    bay: string | null;
}

interface ManifestItem {
    id: number;
    name: string;
    sku: string;
    pack_label: string;
    status: "oos" | "low" | "regular";
    status_label: string;
    stock_qty: number | null;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg: number;
    location: string;
    icon: string;
}

interface Location {
    name: string;
    detail: string;
}

interface Props {
    transfer_id: number;
    reference: string;
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    slot: string;
    vehicle: Vehicle;
    manifest_items: ManifestItem[];
    total_cbm: number;
    total_kg: number;
    total_cartons: number;
}

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
const statusColors = {
    oos:     { chipColor: "error" as const },
    low:     { chipColor: "warning" as const },
    regular: { chipColor: "default" as const },
};

function ItemIcon({ icon }: { icon: string }) {
    if (icon === "report")  return <ReportIcon  sx={{ fontSize: 18 }} />;
    if (icon === "warning") return <WarningIcon sx={{ fontSize: 18 }} />;
    return <InventoryIcon sx={{ fontSize: 18 }} />;
}

/* ----------------------------------------------------------
 | Phase Stepper
 |----------------------------------------------------------*/
function PhaseStepper({ active }: { active: 1 | 2 | 3 }) {
    const steps = [
        { label: "Manifest", sublabel: active === 1 ? "Active" : "Verified", done: active > 1 },
        { label: "Review",   sublabel: active === 2 ? "Active" : active > 2 ? "Done" : "Pending", done: active > 2 },
        { label: "Dispatched", sublabel: active === 3 ? "Active" : "Pending", done: false },
    ];
    return (
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", bgcolor: "action.hover", border: "1px solid", borderColor: "divider", mb: 2 }}>
            <Stack direction="row" alignItems="center">
                {steps.map((step, i) => (
                    <React.Fragment key={step.label}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: step.done || i + 1 === active ? "primary.main" : "action.selected", color: step.done || i + 1 === active ? "primary.contrastText" : "text.secondary", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {step.done ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <Typography variant="caption" fontWeight={800} lineHeight={1}>{i + 1}</Typography>}
                            </Box>
                            <Box>
                                <Typography variant="caption" fontWeight={i + 1 === active ? 800 : 600} color={i + 1 === active ? "primary.main" : "text.secondary"} sx={{ display: "block", lineHeight: 1.1, fontSize: 11 }}>{step.label}</Typography>
                                <Typography variant="caption" color={i + 1 === active ? "primary.main" : "text.disabled"} sx={{ fontSize: 10, lineHeight: 1 }}>{step.sublabel}</Typography>
                            </Box>
                        </Stack>
                        {i < 2 && <Box sx={{ flex: 1, height: 2, mx: 1, bgcolor: i + 1 < active ? "primary.main" : "divider" }} />}
                    </React.Fragment>
                ))}
            </Stack>
        </Paper>
    );
}

/* ----------------------------------------------------------
 | SVG Radial Gauge
 |----------------------------------------------------------*/
function RadialGauge({ percent, color }: { percent: number; color: string }) {
    const circumference = 2 * Math.PI * 15.9155;
    const dash = (Math.min(percent, 100) / 100) * circumference;
    return (
        <Box sx={{ position: "relative", width: 112, height: 112, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3.8" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={color} strokeWidth="3.8" strokeDasharray={`${dash}, ${circumference}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
            <Box sx={{ position: "absolute", textAlign: "center" }}>
                <Typography variant="subtitle1" fontWeight={800} lineHeight={1}>{Math.min(percent, 100)}%</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textTransform: "uppercase" }}>CUBED</Typography>
            </Box>
        </Box>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishReview({
    transfer_id,
    reference,
    origin,
    destination,
    distance_km,
    scheduled_run,
    cutoff_label,
    slot,
    vehicle,
    manifest_items,
    total_cbm,
    total_kg,
    total_cartons,
}: Props) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [notes, setNotes]             = useState("");

    // Load state derived from telemetry
    const cbmPercent = Math.round((total_cbm / vehicle.max_cbm) * 100);
    const kgPercent  = Math.round((total_kg / vehicle.payload_kg) * 100);

    const loadState: "healthy" | "warning" | "over" =
        cbmPercent > 100 ? "over" : cbmPercent > 85 ? "warning" : "healthy";

    const gaugeColor =
        loadState === "over" ? "#ba1a1a" : loadState === "warning" ? "#814400" : "#004632";

    const handleDispatch = () => {
        router.post(route("admin.inventory.replenish.dispatch", transfer_id), { notes });
    };

    return (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
            <Head title="Review & Dispatch" />

            {/* ── Header ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <LocalShippingIcon color="primary" />
                        <Typography variant="h5" fontWeight={800}>Review &amp; Dispatch</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Confirm replenishment manifest and load balance before dock release.
                    </Typography>
                </Box>
                <Chip icon={<SyncAltIcon sx={{ fontSize: 14 }} />} label="ERP-SYNC: ACTIVE" color="primary" size="small" sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11 }} />
            </Stack>

            {/* ── Phase Stepper ── */}
            <PhaseStepper active={2} />

            {/* ── Validation Banner ── */}
            <Box mb={2}>
                {loadState === "healthy" && (
                    <Paper elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "success.light", bgcolor: "background.paper" }}>
                        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                            <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "success.light", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <CheckCircleIcon color="success" sx={{ fontSize: 20 }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="subtitle2" fontWeight={700}>Ready for Dispatch</Typography>
                                    <Chip label={`${cbmPercent}% Capacity`} size="small" color="success" sx={{ fontWeight: 700 }} />
                                </Stack>
                                <Typography variant="caption" color="text.secondary">All volumetric and weight thresholds within carrier limits ({total_cbm.toFixed(1)} / {vehicle.max_cbm} m³).</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                )}
                {loadState === "warning" && (
                    <Paper elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "warning.light", bgcolor: "warning.light" }}>
                        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                            <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "warning.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <WarningAmberIcon sx={{ color: "#fff", fontSize: 20 }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="subtitle2" fontWeight={700}>Near Capacity Notice</Typography>
                                    <Chip label={`${cbmPercent}% Capacity`} size="small" color="warning" sx={{ fontWeight: 700 }} />
                                </Stack>
                                <Typography variant="caption">Volume load at {cbmPercent}% ({total_cbm.toFixed(1)} / {vehicle.max_cbm} m³). Stacking density tolerance under {(vehicle.max_cbm - total_cbm).toFixed(1)} CBM.</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                )}
                {loadState === "over" && (
                    <Paper elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "error.light", bgcolor: "error.light" }}>
                        <Stack direction="row" alignItems="flex-start" spacing={1.5} mb={1.5}>
                            <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "error.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <ErrorIcon sx={{ color: "#fff", fontSize: 20 }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="subtitle2" fontWeight={700} color="error.dark">Over-Capacity Warning</Typography>
                                    <Chip label={`+${(total_cbm - vehicle.max_cbm).toFixed(1)} m³ EXCEEDED`} size="small" color="error" sx={{ fontWeight: 700 }} />
                                </Stack>
                                <Typography variant="caption" color="error.dark">Shipment exceeds maximum {vehicle.name} limit ({vehicle.max_cbm} m³). Return to manifest to reduce carton count.</Typography>
                            </Box>
                        </Stack>
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<ArrowBackIcon />}
                            size="small"
                            onClick={() => router.get(route("admin.inventory.replenish.show", transfer_id))}
                            sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 700 }}
                        >
                            Return to Manifest
                        </Button>
                    </Paper>
                )}
            </Box>

            {/* ── Replenishment Corridor Card ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>REPLENISHMENT CORRIDOR</Typography>
                    <Chip icon={<TimerIcon sx={{ fontSize: 13 }} />} label={cutoff_label} size="small" color="warning" sx={{ fontWeight: 700 }} />
                </Stack>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: "10px", p: 1.5, mb: 1.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10 }}>ORIGIN</Typography>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{origin.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{origin.detail}</Typography>
                    </Box>
                    <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                        <Typography variant="caption" color="primary.main" fontWeight={800} display="block">{distance_km} km</Typography>
                        <ArrowForwardIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10 }}>~38 min</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10 }}>DESTINATION</Typography>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{destination.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{destination.detail}</Typography>
                    </Box>
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <ScheduleIcon sx={{ fontSize: 16, color: "primary.main" }} />
                        <Typography variant="caption" color="text.secondary">Scheduled: <strong>{scheduled_run}</strong></Typography>
                    </Stack>
                    <Chip label={slot} size="small" variant="outlined" color="primary" sx={{ fontWeight: 700, fontSize: 11 }} />
                </Stack>
            </Paper>

            {/* ── Assigned Carrier Card ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 28, height: 28, borderRadius: "8px", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <LocalShippingIcon color="primary" sx={{ fontSize: 18 }} />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={700}>Assigned Carrier</Typography>
                    </Stack>
                    <Button startIcon={<SyncIcon sx={{ fontSize: 14 }} />} size="small" sx={{ textTransform: "none", fontWeight: 700, fontSize: 12 }}>Change vehicle</Button>
                </Stack>
                <Box sx={{ bgcolor: "action.hover", borderRadius: "10px", p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                            <Typography variant="subtitle2" fontWeight={700}>{vehicle.name}</Typography>
                            <Stack direction="row" alignItems="center" spacing={0.75} mt={0.5}>
                                <Chip label={vehicle.plate} size="small" sx={{ fontFamily: "monospace", fontWeight: 700 }} />
                                <Typography variant="caption" color="text.secondary">Fleet Unit #K-22</Typography>
                            </Stack>
                        </Box>
                        <Stack spacing={0.5} alignItems="flex-end">
                            <Chip label={`Max: ${vehicle.max_cbm} CBM`} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                            <Chip label={`Payload: ${vehicle.payload_kg.toLocaleString()} kg`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                        </Stack>
                    </Stack>
                </Box>
            </Paper>

            {/* ── Volumetric Load Telemetry ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 28, height: 28, borderRadius: "8px", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ViewInArIcon color="primary" sx={{ fontSize: 18 }} />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={700}>Load Telemetry</Typography>
                    </Stack>
                    <Chip
                        label={loadState === "healthy" ? `Optimal (${cbmPercent}%)` : loadState === "warning" ? `Caution (${cbmPercent}%)` : "Over-Capacity"}
                        size="small"
                        color={loadState === "over" ? "error" : loadState === "warning" ? "warning" : "success"}
                        sx={{ fontWeight: 700 }}
                    />
                </Stack>
                <Stack direction="row" alignItems="center" spacing={2.5} mb={1.5}>
                    <RadialGauge percent={cbmPercent} color={gaugeColor} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box mb={1.5}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Volume Utilization</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>{total_cbm.toFixed(1)} / {vehicle.max_cbm} m³</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={Math.min(cbmPercent, 100)} sx={{ height: 8, borderRadius: 4 }} color={loadState === "over" ? "error" : loadState === "warning" ? "warning" : "primary"} />
                            <Typography variant="caption" color={loadState === "over" ? "error.main" : "primary.main"} fontWeight={700} sx={{ mt: 0.5, display: "block" }}>
                                {loadState === "over" ? `EXCEEDED BY ${(total_cbm - vehicle.max_cbm).toFixed(1)} m³` : `${(vehicle.max_cbm - total_cbm).toFixed(1)} CBM Remaining Headroom`}
                            </Typography>
                        </Box>
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Gross Mass Load</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>{Math.round(total_kg).toLocaleString()} / {vehicle.payload_kg.toLocaleString()} kg</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={Math.min(kgPercent, 100)} sx={{ height: 6, borderRadius: 4 }} color={kgPercent > 90 ? "error" : "secondary"} />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>{Math.round(vehicle.payload_kg - total_kg).toLocaleString()} kg Remaining Capacity</Typography>
                        </Box>
                    </Box>
                </Stack>
                <Box sx={{ bgcolor: "action.hover", borderRadius: "10px", p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-around" textAlign="center">
                        {[
                            { label: "ALLOCATED SKUs", value: manifest_items.length },
                            { label: "TOTAL CARTONS",  value: total_cartons },
                            { label: "PALLET BAYS",    value: `${(total_cbm / 2.07).toFixed(1)} EQ` },
                        ].map((s) => (
                            <Box key={s.label}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, display: "block" }}>{s.label}</Typography>
                                <Typography variant="subtitle1" fontWeight={800} color={s.label === "PALLET BAYS" ? "primary.main" : "text.primary"}>{s.value}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            </Paper>

            {/* ── Read-only Manifest ── */}
            <Box mb={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                    <Box>
                        <Typography variant="subtitle1" fontWeight={700}>Replenishment Manifest</Typography>
                        <Typography variant="caption" color="text.secondary">{manifest_items.length} line items · verified against inventory velocity</Typography>
                    </Box>
                    <Button startIcon={<EditIcon sx={{ fontSize: 14 }} />} size="small" onClick={() => router.get(route("admin.inventory.replenish.show", transfer_id))} sx={{ textTransform: "none", fontWeight: 700, fontSize: 12 }}>Adjust</Button>
                </Stack>
                <Stack spacing={1.25}>
                    {manifest_items.map((item) => {
                        const cfg = statusColors[item.status];
                        return (
                            <Paper key={item.id} elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "divider" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} mb={1}>
                                    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                                        <Box sx={{ width: 38, height: 38, borderRadius: "10px", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <ItemIcon icon={item.icon} />
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={700} noWrap>{item.name}</Typography>
                                            <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25} flexWrap="wrap">
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 11 }}>{item.sku} • {item.pack_label}</Typography>
                                                <Chip
                                                    label={item.status === "oos" ? `${item.status_label} (0 Pcs)` : `${item.status_label} (${item.stock_qty} Pcs)`}
                                                    size="small" color={cfg.chipColor} sx={{ fontWeight: 700, fontSize: 10 }}
                                                />
                                                <Chip label={item.location} size="small" variant="outlined" sx={{ fontFamily: "monospace", fontSize: 10 }} />
                                            </Stack>
                                        </Box>
                                    </Stack>
                                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                        <Typography variant="subtitle2" fontWeight={800} color="primary.main">{item.quantity} {item.unit}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 11 }}>{item.cbm} CBM • {item.weight_kg.toLocaleString()} kg</Typography>
                                    </Box>
                                </Stack>
                            </Paper>
                        );
                    })}
                </Stack>

                {/* Manifest totals */}
                <Box sx={{ mt: 1, px: 1.5, py: 1, borderRadius: "10px", bgcolor: "action.hover", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 600 }}>Manifest Aggregate</Typography>
                    <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>{total_cartons} Ctns · {total_cbm.toFixed(1)} CBM · {Math.round(total_kg).toLocaleString()} kg</Typography>
                </Box>
            </Box>

            {/* ── Dispatch Notes ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25}>
                    <Typography variant="subtitle1" fontWeight={700}>Dispatch Notes <Typography component="span" variant="body2" color="text.secondary">(optional)</Typography></Typography>
                    <Typography variant="caption" color="text.secondary">{notes.length} / 280</Typography>
                </Stack>
                <TextField
                    fullWidth
                    multiline
                    rows={3}
                    variant="filled"
                    placeholder="Add handling instructions, dock contact, or driver notes…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 280))}
                    sx={{ "& .MuiFilledInput-root": { borderRadius: "10px", bgcolor: "action.hover" } }}
                    InputProps={{ disableUnderline: true }}
                />
                <Stack direction="row" alignItems="center" spacing={0.5} mt={1}>
                    <VisibilityIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="caption" color="text.disabled">Visible to the receiving store manager &amp; driver manifest terminal.</Typography>
                </Stack>
            </Paper>

            {/* ── Sticky Bottom Bar ── */}
            <Paper elevation={4} sx={{ position: "sticky", bottom: 16, borderRadius: "16px", p: 2, border: "1px solid", borderColor: "divider", backdropFilter: "blur(12px)", bgcolor: "background.paper", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box>
                    <Stack direction="row" alignItems="baseline" spacing={0.75}>
                        <Typography variant="h6" fontWeight={800} color="primary.main">{total_cbm.toFixed(1)} CBM</Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "text.disabled" }} />
                        <Typography variant="h6" fontWeight={700}>{manifest_items.length} SKUs</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{Math.round(total_kg).toLocaleString()} kg • {vehicle.name}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexShrink={0}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => router.get(route("admin.inventory.replenish.show", transfer_id))} sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Back</Button>
                    <Button
                        variant="contained"
                        endIcon={<ArrowForwardIcon />}
                        onClick={() => setConfirmOpen(true)}
                        disabled={loadState === "over"}
                        sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, px: 3 }}
                    >
                        Confirm &amp; Dispatch
                    </Button>
                </Stack>
            </Paper>

            {/* ── Confirm Dispatch Dialog ── */}
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} PaperProps={{ sx: { borderRadius: "20px", p: 1 } }} maxWidth="xs" fullWidth>
                <DialogContent>
                    <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", mb: 2 }}>
                        <LocalShippingIcon color="primary" sx={{ fontSize: 26 }} />
                    </Box>
                    <Typography variant="h6" fontWeight={800} mb={0.75}>Dispatch this shipment?</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        {total_cartons} cartons across {manifest_items.length} SKUs will be committed and scheduled for transit to <strong>{destination.name} — {destination.detail}</strong>.
                    </Typography>
                    <Paper elevation={0} sx={{ bgcolor: "action.hover", borderRadius: "12px", p: 2, mb: 2.5 }}>
                        {[
                            { label: "Assigned Carrier:", value: `${vehicle.name} (${vehicle.plate})` },
                            { label: "Loading Bay:", value: vehicle.bay ?? "TBD", primary: true },
                            { label: "Departure Window:", value: scheduled_run },
                        ].map((row) => (
                            <Stack key={row.label} direction="row" justifyContent="space-between" alignItems="center" py={0.5}>
                                <Typography variant="caption" color="text.secondary">{row.label}</Typography>
                                <Typography variant="caption" fontWeight={700} color={row.primary ? "primary.main" : "text.primary"} sx={{ fontFamily: "monospace" }}>{row.value}</Typography>
                            </Stack>
                        ))}
                    </Paper>
                    <Stack direction="row" spacing={1.5}>
                        <Button fullWidth variant="outlined" onClick={() => setConfirmOpen(false)} sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Cancel</Button>
                        <Button fullWidth variant="contained" onClick={handleDispatch} sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Confirm Dispatch</Button>
                    </Stack>
                </DialogContent>
            </Dialog>
        </Box>
    );
}

ReplenishReview.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
