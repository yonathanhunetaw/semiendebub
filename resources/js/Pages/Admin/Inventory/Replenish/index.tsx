import React, { useState } from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Chip,
    Divider,
    IconButton,
    LinearProgress,
    Button,
    Stack,
    Tooltip,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import StoreIcon from "@mui/icons-material/Store";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ScheduleIcon from "@mui/icons-material/Schedule";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import ReportIcon from "@mui/icons-material/Report";
import WarningIcon from "@mui/icons-material/Warning";
import InventoryIcon from "@mui/icons-material/Inventory";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import SyncAltIcon from "@mui/icons-material/SyncAlt";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface Vehicle {
    id: string;
    name: string;
    plate: string;
    icon: string;
    max_cbm: number;
    payload_kg: number;
    bay: string | null;
    is_primary: boolean;
}

interface ManifestItem {
    id: number;
    name: string;
    sku: string;
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
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    vehicles: Vehicle[];
    manifest_items: ManifestItem[];
}

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
const statusColors = {
    oos: {
        bg: "error.light",
        text: "error.dark",
        icon: <ReportIcon sx={{ fontSize: 20 }} />,
        chipColor: "error" as const,
    },
    low: {
        bg: "warning.light",
        text: "warning.dark",
        icon: <WarningIcon sx={{ fontSize: 20 }} />,
        chipColor: "warning" as const,
    },
    regular: {
        bg: "action.hover",
        text: "text.secondary",
        icon: <InventoryIcon sx={{ fontSize: 20 }} />,
        chipColor: "default" as const,
    },
};

function ItemIcon({ icon }: { icon: string }) {
    if (icon === "report") return <ReportIcon sx={{ fontSize: 20 }} />;
    if (icon === "warning") return <WarningIcon sx={{ fontSize: 20 }} />;
    return <InventoryIcon sx={{ fontSize: 20 }} />;
}

/* ----------------------------------------------------------
 | SVG Radial Gauge
 |----------------------------------------------------------*/
function RadialGauge({ percent }: { percent: number }) {
    const circumference = 2 * Math.PI * 15.9155;
    const dash = (percent / 100) * circumference;
    return (
        <Box sx={{ position: "relative", width: 96, height: 96, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.8"
                    style={{ color: "rgba(0,0,0,0.08)" }}
                />
                <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.8"
                    strokeDasharray={`${dash}, ${circumference}`}
                    strokeLinecap="round"
                    style={{ color: "inherit", transition: "stroke-dasharray 0.5s ease" }}
                />
            </svg>
            <Box sx={{ position: "absolute", textAlign: "center" }}>
                <Typography variant="subtitle2" fontWeight={800} lineHeight={1}>{percent}%</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textTransform: "uppercase" }}>Cubed</Typography>
            </Box>
        </Box>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({
    origin,
    destination,
    distance_km,
    scheduled_run,
    cutoff_label,
    vehicles,
    manifest_items,
}: Props) {
    const [selectedVehicle, setSelectedVehicle] = useState(
        vehicles.find((v) => v.is_primary)?.id ?? vehicles[0]?.id
    );
    const [quantities, setQuantities] = useState<Record<number, number>>(
        Object.fromEntries(manifest_items.map((i) => [i.id, i.quantity]))
    );

    const activeVehicle = vehicles.find((v) => v.id === selectedVehicle);

    // Compute telemetry from current quantities
    const totalCbm = manifest_items.reduce((sum, item) => {
        const ratio = quantities[item.id] / item.quantity;
        return sum + item.cbm * ratio;
    }, 0);
    const totalKg = manifest_items.reduce((sum, item) => {
        const ratio = quantities[item.id] / item.quantity;
        return sum + item.weight_kg * ratio;
    }, 0);
    const maxCbm = activeVehicle?.max_cbm ?? 14.5;
    const maxKg = activeVehicle?.payload_kg ?? 4200;
    const cbmPercent = Math.min(Math.round((totalCbm / maxCbm) * 100), 100);
    const kgPercent = Math.min(Math.round((totalKg / maxKg) * 100), 100);
    const totalCartons = Object.values(quantities).reduce((a, b) => a + b, 0);

    const handleQty = (id: number, delta: number) => {
        setQuantities((prev) => ({ ...prev, [id]: Math.max(0, prev[id] + delta) }));
    };

    const handleDispatch = () => {
        router.post(route("admin.inventory.replenish.store"), {
            vehicle_id: selectedVehicle,
            quantities,
        });
    };

    return (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
            <Head title="Replenish / Shipments" />

            {/* ── Page Header ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <LocalShippingIcon color="primary" />
                        <Typography variant="h5" fontWeight={800}>Replenish / Shipments</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Phase 1 / 3 — Manifest Configuration
                    </Typography>
                </Box>
                <Chip
                    icon={<SyncAltIcon sx={{ fontSize: 14 }} />}
                    label="ERP-SYNC: ACTIVE"
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}
                />
            </Stack>

            {/* ── Route Matrix Card ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="overline" color="text.secondary">Replenishment Corridor</Typography>
                    <Chip label="WH → Retail Store" size="small" color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                </Stack>

                {/* Origin → Destination */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: "10px", p: 1.5, mb: 1.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} mb={0.25}>
                            <HomeWorkIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>Origin Facility</Typography>
                        </Stack>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{origin.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{origin.detail}</Typography>
                    </Box>
                    <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                        <ArrowForwardIcon color="primary" />
                        <Typography variant="caption" color="text.secondary" display="block">{distance_km} km</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} mb={0.25}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>Target Unit</Typography>
                            <StoreIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                        </Stack>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{destination.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{destination.detail}</Typography>
                    </Box>
                </Box>

                {/* Scheduled Run */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ bgcolor: "action.hover", borderRadius: "10px", p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <ScheduleIcon sx={{ color: "primary.contrastText", fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Scheduled Run</Typography>
                            <Typography variant="subtitle2" fontWeight={700}>{scheduled_run}</Typography>
                        </Box>
                    </Stack>
                    <Chip label={cutoff_label} size="small" color="warning" sx={{ fontWeight: 700, flexShrink: 0 }} />
                </Stack>
            </Paper>

            {/* ── Route Protocol Notice ── */}
            <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", bgcolor: "action.hover", border: "1px solid", borderColor: "divider", mb: 2, display: "flex", gap: 1 }}>
                <Box color="primary.main" sx={{ flexShrink: 0, mt: "2px", fontSize: 18 }}>ℹ</Box>
                <Typography variant="caption" color="text.secondary">
                    <strong style={{ color: "inherit" }}>Route Protocol:</strong> Remote Warehouse → Store routes auto-assign 3PL transit; local transfer requires manual fleet allocation.
                </Typography>
            </Paper>

            {/* ── Vehicle Selection ── */}
            <Box mb={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <LocalShippingIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Dedicated Fleet Carrier</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 600 }}>
                        {vehicles.length} Available
                    </Typography>
                </Stack>

                <Stack spacing={1.5}>
                    {vehicles.map((v) => {
                        const isSelected = selectedVehicle === v.id;
                        return (
                            <Paper
                                key={v.id}
                                elevation={0}
                                onClick={() => setSelectedVehicle(v.id)}
                                sx={{
                                    p: 2,
                                    borderRadius: "16px",
                                    border: "2px solid",
                                    borderColor: isSelected ? "primary.main" : "divider",
                                    bgcolor: isSelected ? "action.selected" : "background.paper",
                                    cursor: "pointer",
                                    opacity: isSelected ? 1 : 0.75,
                                    transition: "all 0.2s ease",
                                    position: "relative",
                                    overflow: "hidden",
                                    "&:hover": { opacity: 1, borderColor: "primary.light" },
                                }}
                            >
                                {isSelected && (
                                    <Box sx={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 5, bgcolor: "primary.main" }} />
                                )}
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                                    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                                        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            {v.icon === "directions_car"
                                                ? <DirectionsCarIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 26 }} />
                                                : <LocalShippingIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 26 }} />
                                            }
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Stack direction="row" alignItems="center" spacing={0.75} mb={0.25}>
                                                <Typography variant="subtitle2" fontWeight={700} noWrap>{v.name}</Typography>
                                                {isSelected && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />}
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block" }}>
                                                Plate: {v.plate}
                                            </Typography>
                                            <Stack direction="row" spacing={0.75} mt={0.75} flexWrap="wrap">
                                                <Chip label={`Max: ${v.max_cbm} CBM`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                                <Chip label={`Payload: ${v.payload_kg.toLocaleString()} kg`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                            </Stack>
                                        </Box>
                                    </Stack>
                                    <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.5 }}>
                                        {isSelected
                                            ? <Box component="span" sx={{ color: "primary.contrastText", fontSize: 16, lineHeight: 1 }}>✓</Box>
                                            : <AddIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                                        }
                                    </Box>
                                </Stack>
                                {isSelected && v.bay && (
                                    <Box sx={{ mt: 1.5, px: 1.5, py: 0.5, bgcolor: "action.hover", borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Typography variant="caption" color="text.secondary">Bay Loading Status</Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "primary.main" }} />
                                            <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ fontFamily: "monospace" }}>
                                                {v.bay} RESERVED
                                            </Typography>
                                        </Stack>
                                    </Box>
                                )}
                            </Paper>
                        );
                    })}
                </Stack>
            </Box>

            {/* ── Volumetric Load Telemetry ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <ViewInArIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Volumetric Load Telemetry</Typography>
                    </Stack>
                    <Chip
                        label={`${cbmPercent <= 40 ? "Under" : cbmPercent <= 75 ? "Optimal" : "Near Capacity"} (${cbmPercent}%)`}
                        size="small"
                        color={cbmPercent > 85 ? "error" : cbmPercent > 60 ? "warning" : "success"}
                        sx={{ fontWeight: 700 }}
                    />
                </Stack>

                <Stack direction="row" alignItems="center" spacing={2.5}>
                    <Box color="primary.main">
                        <RadialGauge percent={cbmPercent} />
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box mb={1.5}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Volume Utilization</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>
                                    {totalCbm.toFixed(1)} / {maxCbm} m³
                                </Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={cbmPercent} sx={{ height: 8, borderRadius: 4 }} color={cbmPercent > 85 ? "error" : "primary"} />
                            <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ mt: 0.5, display: "block" }}>
                                {(maxCbm - totalCbm).toFixed(1)} CBM Remaining Headroom
                            </Typography>
                        </Box>
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Gross Mass Load</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>
                                    {Math.round(totalKg).toLocaleString()} / {maxKg.toLocaleString()} kg
                                </Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={kgPercent} sx={{ height: 6, borderRadius: 4 }} color={kgPercent > 90 ? "error" : "secondary"} />
                        </Box>
                    </Box>
                </Stack>

                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-around" textAlign="center">
                    {[
                        { label: "ALLOCATED SKUs", value: manifest_items.length },
                        { label: "TOTAL CARTONS", value: totalCartons },
                        { label: "PALLET BAYS", value: `${(totalCbm / 2.07).toFixed(1)} EQ` },
                    ].map((stat) => (
                        <Box key={stat.label}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 600, fontSize: 10 }}>{stat.label}</Typography>
                            <Typography variant="subtitle1" fontWeight={800}>{stat.value}</Typography>
                        </Box>
                    ))}
                </Stack>
            </Paper>

            {/* ── Replenishment Manifest ── */}
            <Box mb={3}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                    <Box>
                        <Typography variant="subtitle1" fontWeight={700}>Replenishment Manifest</Typography>
                        <Typography variant="caption" color="text.secondary">Calculated from inventory velocity</Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} size="small" sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 700 }}>
                        Add Items
                    </Button>
                </Stack>

                {/* Toolbar */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PriorityHighIcon color="error" sx={{ fontSize: 16 }} />}
                        sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: 12 }}
                    >
                        Priority: OOS First
                    </Button>
                    <Tooltip title="Reset all quantities to defaults">
                        <Button
                            size="small"
                            startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />}
                            color="error"
                            sx={{ textTransform: "none", fontSize: 12 }}
                            onClick={() => setQuantities(Object.fromEntries(manifest_items.map((i) => [i.id, i.quantity])))}
                        >
                            Reset Build
                        </Button>
                    </Tooltip>
                </Stack>

                {/* Item Cards */}
                <Stack spacing={1.5}>
                    {manifest_items.map((item) => {
                        const cfg = statusColors[item.status];
                        return (
                            <Paper key={item.id} elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} mb={1.5}>
                                    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                                        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: cfg.bg, color: cfg.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <ItemIcon icon={item.icon} />
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={700} noWrap>{item.name}</Typography>
                                            <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25} flexWrap="wrap">
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{item.sku}</Typography>
                                                <Chip
                                                    label={item.status === "oos" ? `${item.status_label} (0 Pcs)` : `${item.status_label} (${item.stock_qty} Pcs)`}
                                                    size="small"
                                                    color={cfg.chipColor}
                                                    sx={{ fontWeight: 700, fontSize: 10 }}
                                                />
                                            </Stack>
                                        </Box>
                                    </Stack>
                                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                        <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                                            {quantities[item.id]} {item.unit}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                            {(item.cbm * quantities[item.id] / item.quantity).toFixed(1)} CBM • {Math.round(item.weight_kg * quantities[item.id] / item.quantity).toLocaleString()} kg
                                        </Typography>
                                    </Box>
                                </Stack>

                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ bgcolor: "action.hover", borderRadius: "8px", px: 1.5, py: 0.75 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <WarehouseIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                        <Typography variant="caption" color="text.secondary">{item.location}</Typography>
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <IconButton size="small" onClick={() => handleQty(item.id, -1)} sx={{ width: 26, height: 26, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                                            <RemoveIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                        <Typography variant="caption" fontWeight={800} sx={{ minWidth: 24, textAlign: "center", fontFamily: "monospace" }}>
                                            {quantities[item.id]}
                                        </Typography>
                                        <IconButton size="small" onClick={() => handleQty(item.id, 1)} sx={{ width: 26, height: 26, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                                            <AddIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </Stack>
                                </Stack>
                            </Paper>
                        );
                    })}
                </Stack>
            </Box>

            {/* ── Sticky Execution Bar ── */}
            <Paper
                elevation={4}
                sx={{
                    position: "sticky",
                    bottom: 16,
                    borderRadius: "16px",
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    backdropFilter: "blur(12px)",
                    bgcolor: "background.paper",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 2,
                }}
            >
                <Box>
                    <Stack direction="row" alignItems="baseline" spacing={0.75}>
                        <Typography variant="h6" fontWeight={800} color="primary.main">{totalCbm.toFixed(1)} CBM</Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "text.disabled" }} />
                        <Typography variant="h6" fontWeight={700}>{manifest_items.length} SKUs</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                        {Math.round(totalKg).toLocaleString()} kg • {activeVehicle?.name ?? "No vehicle"}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    onClick={handleDispatch}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, px: 3, py: 1.25, flexShrink: 0 }}
                >
                    Review &amp; Dispatch
                </Button>
            </Paper>
        </Box>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
