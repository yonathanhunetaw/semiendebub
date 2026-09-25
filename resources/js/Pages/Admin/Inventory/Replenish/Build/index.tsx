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
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    MenuItem,
    Checkbox,
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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import EditIcon from "@mui/icons-material/Edit";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonIcon from "@mui/icons-material/Person";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

import PartyDetailDialog from "@/Components/Admin/Inventory/Replenish/PartyDetailDialog";
import type { PartyAgreementsMap, PartyKey } from "@/types/adminReplenish";

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
    pack_label: string;
    status: "oos" | "low" | "regular" | "sold";
    status_label: string;
    stock_qty: number | null;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg: number;
    location: string;
    icon: string;
    target_dest?: "store" | "remote_warehouse";
    added_by?: {
        type: "auto" | "manual";
        name?: string;
        reason: string;
    };
}

interface TimeWindow {
    id: number;
    date: string;
    time: string;
}

interface Location {
    name: string;
    detail: string;
}

interface Props {
    transfer_id: number;
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    vehicles: Vehicle[];
    manifest_items: ManifestItem[];
}

/* ----------------------------------------------------------
 | Shared options (replace with real API data)
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

const AVAILABLE_SKUS: ManifestItem[] = [
    { id: 301, name: "Ballpoint Pens Box", sku: "SKU-301", pack_label: "Box/12", status: "low", status_label: "LOW STOCK", stock_qty: 8, quantity: 20, unit: "Bx", cbm: 0.4, weight_kg: 80, location: "Aisle C-02", icon: "warning", target_dest: "store", added_by: { type: "auto", reason: "Replenish algorithm" } },
    { id: 302, name: "Correction Fluid 12pk", sku: "SKU-302", pack_label: "Pack/12", status: "regular", status_label: "REGULAR", stock_qty: 30, quantity: 30, unit: "Pk", cbm: 0.3, weight_kg: 60, location: "Aisle C-03", icon: "inventory", target_dest: "remote_warehouse", added_by: { type: "manual", name: "Admin", reason: "Store request" } },
    { id: 303, name: "Stapler Set", sku: "SKU-303", pack_label: "Set/6", status: "oos", status_label: "CRITICAL OOS", stock_qty: 0, quantity: 15, unit: "Pcs", cbm: 0.5, weight_kg: 90, location: "Aisle A-01", icon: "report", target_dest: "store", added_by: { type: "auto", reason: "Zero stock" } },
];

const DEFAULT_TIME_WINDOWS: TimeWindow[] = [
    { id: 1, date: "2024-10-25", time: "08:30" },
    { id: 2, date: "2024-10-25", time: "17:00" },
    { id: 3, date: "2024-10-26", time: "08:30" },
    { id: 4, date: "2024-10-26", time: "17:00" },
];

const SIBLING_TRANSFERS = [
    { id: 2, label: "RPL-2024-00872 → Branch Store" },
    { id: 3, label: "RPL-2024-00873 → Bole Store" },
];

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
const statusColors = {
    oos: { bg: "error.light", text: "error.dark", chipColor: "error" as const },
    low: { bg: "warning.light", text: "warning.dark", chipColor: "warning" as const },
    regular: { bg: "action.hover", text: "text.secondary", chipColor: "default" as const },
    sold: { bg: "info.light", text: "info.dark", chipColor: "info" as const },
};

function ItemIcon({ icon }: { icon: string }) {
    if (icon === "report") return <ReportIcon sx={{ fontSize: 20 }} />;
    if (icon === "warning") return <WarningIcon sx={{ fontSize: 20 }} />;
    return <InventoryIcon sx={{ fontSize: 20 }} />;
}

/* ----------------------------------------------------------
 | Phase Stepper
 |----------------------------------------------------------*/
function PhaseStepper({ active }: { active: 1 | 2 | 3 }) {
    const steps = [
        { label: "Manifest", sublabel: active === 1 ? "Active" : "Verified", done: active > 1 },
        { label: "Review", sublabel: active === 2 ? "Active" : active > 2 ? "Done" : "Pending", done: active > 2 },
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
function RadialGauge({ percent }: { percent: number }) {
    const circumference = 2 * Math.PI * 15.9155;
    const dash = (Math.min(percent, 100) / 100) * circumference;
    return (
        <Box sx={{ position: "relative", width: 96, height: 96, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.8" style={{ color: "rgba(0,0,0,0.08)" }} />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.8" strokeDasharray={`${dash}, ${circumference}`} strokeLinecap="round" style={{ color: "inherit", transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
            <Box sx={{ position: "absolute", textAlign: "center" }}>
                <Typography variant="subtitle2" fontWeight={800} lineHeight={1}>{Math.min(percent, 100)}%</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textTransform: "uppercase" }}>Cubed</Typography>
            </Box>
        </Box>
    );
}

/* ----------------------------------------------------------
 | Edit Route Dialog
 |----------------------------------------------------------*/
function EditRouteDialog({ open, originName, destName, onClose, onSave }: {
    open: boolean; originName: string; destName: string;
    onClose: () => void; onSave: (o: Location, d: Location) => void;
}) {
    const [originVal, setOriginVal] = useState(
        FACILITIES.find((f) => originName.startsWith(f.label.split("—")[0].trim()))?.value ?? FACILITIES[0].value
    );
    const [destVal, setDestVal] = useState(
        UNITS.find((u) => destName.startsWith(u.label.split("—")[0].trim()))?.value ?? UNITS[0].value
    );
    const handleSave = () => {
        const oOpt = FACILITIES.find((f) => f.value === originVal)!;
        const dOpt = UNITS.find((u) => u.value === destVal)!;
        const [oName, oDetail] = oOpt.label.split(" — ");
        const [dName, dDetail] = dOpt.label.split(" — ");
        onSave({ name: oName.trim(), detail: oDetail?.trim() ?? "" }, { name: dName.trim(), detail: dDetail?.trim() ?? "" });
    };
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Edit Route</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={2.5} mt={0.5}>
                    <TextField select label="Origin Facility" value={originVal} onChange={(e) => setOriginVal(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <HomeWorkIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}>
                        {FACILITIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                    </TextField>
                    <TextField select label="Target Unit" value={destVal} onChange={(e) => setDestVal(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <StoreIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}>
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
 | Add Items Dialog
 |----------------------------------------------------------*/
function AddItemsDialog({ open, existingIds, onClose, onAdd }: {
    open: boolean; existingIds: number[];
    onClose: () => void; onAdd: (items: ManifestItem[]) => void;
}) {
    const available = AVAILABLE_SKUS.filter((s) => !existingIds.includes(s.id));
    const [selected, setSelected] = useState<Record<number, { unit: string; dest: "store" | "remote_warehouse" }>>({});

    const toggle = (item: ManifestItem) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (next[item.id]) delete next[item.id];
            else next[item.id] = { unit: "Box", dest: item.target_dest ?? "store" };
            return next;
        });
    };

    const updatePack = (e: React.MouseEvent, id: number, unit: string) => {
        e.stopPropagation();
        setSelected((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { dest: "store" }), unit } }));
    };

    const updateDest = (e: React.MouseEvent, id: number, dest: "store" | "remote_warehouse") => {
        e.stopPropagation();
        setSelected((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { unit: "Box" }), dest } }));
    };

    const handleAdd = () => {
        const toAdd = available.filter((s) => selected[s.id]).map((s) => ({
            ...s,
            unit: selected[s.id].unit,
            target_dest: selected[s.id].dest,
            pack_label: selected[s.id].unit === "Pcs" ? "Singles" : selected[s.id].unit === "Box" ? "Box/12" : "Carton/48",
            added_by: { type: "manual" as const, name: "Admin", reason: "Manual addition" },
        }));
        onAdd(toAdd);
        setSelected({});
        onClose();
    };

    const selectedCount = Object.keys(selected).length;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Add Items to Manifest</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                {available.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">All available SKUs are already in the manifest.</Typography>
                ) : (
                    <Stack spacing={1} mt={0.5}>
                        {available.map((item) => {
                            const cfg = statusColors[item.status];
                            const isSelected = !!selected[item.id];
                            return (
                                <Paper key={item.id} elevation={0} onClick={() => toggle(item)}
                                    sx={{ p: 1.25, borderRadius: "10px", border: "1px solid", borderColor: isSelected ? "primary.main" : "divider", cursor: "pointer" }}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Checkbox checked={isSelected} size="small" sx={{ p: 0 }} />
                                        <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: cfg.bg, color: cfg.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <ItemIcon icon={item.icon} />
                                        </Box>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 12 }}>{item.name}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{item.sku} • {item.location}</Typography>
                                        </Box>
                                        <Chip label={item.status_label} size="small" color={cfg.chipColor} sx={{ fontWeight: 700, fontSize: 9, height: 18, flexShrink: 0 }} />
                                    </Stack>
                                    {isSelected && (
                                        <Box mt={1} pt={1} borderTop="1px dashed" borderColor="divider" onClick={(e) => e.stopPropagation()}>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>Packaging Option:</Typography>
                                            <Stack direction="row" spacing={1} mb={1.25}>
                                                {["Pcs", "Box", "Carton"].map((u) => (
                                                    <Chip
                                                        key={u}
                                                        label={u === "Pcs" ? "Pcs (1)" : u === "Box" ? "Box (12)" : "Carton (48)"}
                                                        size="small"
                                                        color={selected[item.id]?.unit === u ? "primary" : "default"}
                                                        variant={selected[item.id]?.unit === u ? "filled" : "outlined"}
                                                        onClick={(e) => updatePack(e, item.id, u)}
                                                        sx={{ fontSize: 10, fontWeight: 700 }}
                                                    />
                                                ))}
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>Target Destination (Dual Support):</Typography>
                                            <Stack direction="row" spacing={1}>
                                                <Button
                                                    size="small"
                                                    variant={selected[item.id]?.dest !== "remote_warehouse" ? "contained" : "outlined"}
                                                    color="primary"
                                                    startIcon={<StoreIcon sx={{ fontSize: 14 }} />}
                                                    onClick={(e) => updateDest(e, item.id, "store")}
                                                    sx={{ flex: 1, textTransform: "none", fontWeight: 700, fontSize: 10, borderRadius: "8px" }}
                                                >
                                                    Main Store
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant={selected[item.id]?.dest === "remote_warehouse" ? "contained" : "outlined"}
                                                    color="secondary"
                                                    startIcon={<WarehouseIcon sx={{ fontSize: 14 }} />}
                                                    onClick={(e) => updateDest(e, item.id, "remote_warehouse")}
                                                    sx={{ flex: 1, textTransform: "none", fontWeight: 700, fontSize: 10, borderRadius: "8px" }}
                                                >
                                                    Remote Warehouse
                                                </Button>
                                            </Stack>
                                        </Box>
                                    )}
                                </Paper>
                            );
                        })}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: "10px", textTransform: "none" }}>Cancel</Button>
                <Button onClick={handleAdd} variant="contained" disabled={selectedCount === 0}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>
                    Add {selectedCount > 0 ? `(${selectedCount})` : ""} Items
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ----------------------------------------------------------
 | Move Item Dialog
 |----------------------------------------------------------*/
function MoveItemDialog({ open, item, onClose, onMove }: {
    open: boolean; item: ManifestItem | null;
    onClose: () => void; onMove: (itemId: number, transferId: number) => void;
}) {
    const [target, setTarget] = useState<number>(SIBLING_TRANSFERS[0]?.id ?? 0);
    if (!item) return null;
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Move Item</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    Move <strong>{item.name}</strong> to another scheduled shipment.
                </Typography>
                <TextField select label="Destination Shipment" value={target}
                    onChange={(e) => setTarget(Number(e.target.value))} size="small" fullWidth>
                    {SIBLING_TRANSFERS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                </TextField>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: "10px", textTransform: "none" }}>Cancel</Button>
                <Button onClick={() => { onMove(item.id, target); onClose(); }}
                    variant="contained" sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Move Item</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishBuild({
    transfer_id,
    origin: originProp,
    destination: destinationProp,
    distance_km,
    scheduled_run,
    cutoff_label,
    vehicles,
    manifest_items: initialItems,
}: Props) {
    const [selectedVehicle, setSelectedVehicle] = useState(vehicles.find((v) => v.is_primary)?.id ?? vehicles[0]?.id);
    const [scheduleInput, setScheduleInput] = useState(scheduled_run);
    const [items, setItems] = useState<ManifestItem[]>(initialItems);
    const [quantities, setQuantities] = useState<Record<number, number>>(Object.fromEntries(initialItems.map((i) => [i.id, i.quantity])));
    const [origin, setOrigin] = useState(originProp);
    const [destination, setDestination] = useState(destinationProp);

    const [driver, setDriver] = useState("auto");
    const [editRouteOpen, setEditRouteOpen] = useState(false);
    const [addItemsOpen, setAddItemsOpen] = useState(false);
    const [moveItem, setMoveItem] = useState<ManifestItem | null>(null);
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);

    const [timeWindows, setTimeWindows] = useState<TimeWindow[]>(DEFAULT_TIME_WINDOWS);
    const [primaryWindowId, setPrimaryWindowId] = useState<number | null>(DEFAULT_TIME_WINDOWS[0]?.id ?? null);

    const activeVehicle = vehicles.find((v) => v.id === selectedVehicle);
    const totalCbm = items.reduce((sum, item) => sum + item.cbm * ((quantities[item.id] ?? 0) / item.quantity), 0);
    const totalKg  = items.reduce((sum, item) => sum + item.weight_kg * ((quantities[item.id] ?? 0) / item.quantity), 0);
    const maxCbm = activeVehicle?.max_cbm ?? 14.5;
    const maxKg  = activeVehicle?.payload_kg ?? 4200;
    const cbmPercent = Math.min(Math.round((totalCbm / maxCbm) * 100), 100);
    const kgPercent  = Math.min(Math.round((totalKg / maxKg) * 100), 100);
    const totalCartons = Object.values(quantities).reduce((a, b) => a + b, 0);

    const hasStoreDest = items.some((i) => (i.target_dest ?? "store") === "store");
    const hasRemoteWHDest = items.some((i) => i.target_dest === "remote_warehouse");
    const isDualDest = hasStoreDest && hasRemoteWHDest;

    const agreements: PartyAgreementsMap = {
        creator: {
            title: "1. Creator",
            role: "Seller",
            party: "Admin • Today • 06:14 AM",
            status: "pending",
            status_label: "Drafting / Pending Dispatch",
            detail: "Manifest is being constructed by Admin. Only ticked off as Created once reviewed and dispatched.",
        },
        fleet: {
            title: "2. Fleet",
            role: "Carrier",
            party: `${activeVehicle?.name ?? "Unassigned"} • ${activeVehicle?.plate ?? "TBD"}`,
            status: driver === "d1" ? "accepted" : driver === "d2" ? "rescheduled" : "pending",
            status_label: driver === "d1" ? "Driver Accepted" : driver === "d2" ? "Rescheduled" : "Pending Driver",
            detail: driver === "d1"
                ? "Driver Abebe K. accepted assigned vehicle and scheduled route."
                : driver === "d2"
                ? "Driver Chala M. requested reschedule to 10/25/2024, 05:00 PM (En route delay)."
                : "Auto-dispatch enabled; awaiting driver confirmation.",
        },
        origin: {
            title: "3. Origin",
            role: "Depot",
            party: `${origin.name} (${origin.detail})`,
            status: "pending",
            status_label: "Pending Stock Keeper",
            detail: "Stock Keeper assigned; bay reserved, awaiting picking & staging sign-off.",
        },
        destination: isDualDest ? {
            title: "4. Dest.",
            role: "Store & Remote WH",
            party: `${destination.name} + Remote Warehouse`,
            status: "pending",
            status_label: "Pending 2 Stock Keepers",
            detail: "Manifest has items going to both Store Floor and Remote WH. Both Stock Keepers must accept.",
            stock_keepers: [
                {
                    name: "Main Store (Floor)",
                    location: destination.name,
                    role: "Store Stock Keeper",
                    keeper: "Helen M.",
                    status: "pending",
                    status_label: "Pending Stock Keeper",
                    detail: "Store Receiver standing by for floor staging clearance.",
                },
                {
                    name: "Remote Warehouse (Overflow)",
                    location: "Kality Sector 3 Overflow",
                    role: "Remote WH Stock Keeper",
                    keeper: "Blen A.",
                    status: "pending",
                    status_label: "Pending Stock Keeper",
                    detail: "Remote warehouse stock keeper sign-off required for inbound overflow.",
                },
            ],
        } : {
            title: "4. Dest.",
            role: hasRemoteWHDest ? "Remote WH" : "Store",
            party: hasRemoteWHDest ? "Remote Warehouse (Overflow Depot)" : `${destination.name} (${destination.detail})`,
            status: "pending",
            status_label: "Pending Stock Keeper",
            detail: hasRemoteWHDest
                ? "Stock Keeper awaiting overflow depot clearance."
                : "Store Receiver awaiting inbound corridor clearance.",
        },
    };

    const handleQty = (id: number, delta: number) => {
        setQuantities((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));
    };
    const handleAddItems = (newItems: ManifestItem[]) => {
        setItems((prev) => [...prev, ...newItems]);
        setQuantities((prev) => ({ ...prev, ...Object.fromEntries(newItems.map((i) => [i.id, i.quantity])) }));
    };
    const handleRemoveItem = (id: number) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setQuantities((prev) => { const n = { ...prev }; delete n[id]; return n; });
    };
    const handleMoveItem = (itemId: number, _transferId: number) => handleRemoveItem(itemId);
    const handleToggleDest = (id: number) => {
        setItems((prev) => prev.map((item) => {
            if (item.id !== id) return item;
            const nextDest = (item.target_dest ?? "store") === "store" ? "remote_warehouse" : "store";
            return { ...item, target_dest: nextDest };
        }));
    };
    const handleReview = () => {
        router.post(route("admin.inventory.replenish.store"), { transfer_id, vehicle_id: selectedVehicle, quantities });
    };

    // ── Proposed Time Gap Windows: the alternate run-times delivery/origin/destination
    // can agree on. Seeded when the shipment was added; editable here (add/edit/delete).
    const addTimeWindow = () => {
        const [date] = scheduleInput.split("T");
        setTimeWindows((prev) => [...prev, { id: Date.now(), date: date || "", time: "17:00" }]);
    };
    const updateTimeWindow = (id: number, field: "date" | "time", value: string) => {
        setTimeWindows((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
    };
    const removeTimeWindow = (id: number) => {
        setTimeWindows((prev) => prev.filter((w) => w.id !== id));
        if (primaryWindowId === id) setPrimaryWindowId(null);
    };
    const selectPrimaryWindow = (w: TimeWindow) => {
        setPrimaryWindowId(w.id);
        setScheduleInput(`${w.date}T${w.time}`);
    };

    return (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
            <Head title="Shipments — Manifest Builder" />

            {/* ── Header ── */}
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                <LocalShippingIcon color="primary" />
                <Typography variant="h5" fontWeight={800}>Shipments</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={2}>Phase 1 / 3 — Manifest Configuration</Typography>

            {/* ── Phase Stepper ── */}
            <PhaseStepper active={1} />

            {/* ── Route Matrix Card ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="overline" color="text.secondary">Replenishment Corridor</Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Chip label="WH → Retail Store" size="small" color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                        <Tooltip title="Edit origin / target">
                            <IconButton size="small" onClick={() => setEditRouteOpen(true)}>
                                <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
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
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ bgcolor: "action.hover", borderRadius: "10px", p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <ScheduleIcon sx={{ color: "primary.contrastText", fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Scheduled Run</Typography>
                            <TextField type="datetime-local" variant="standard" value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)}
                                InputProps={{ disableUnderline: true, sx: { fontWeight: 700, fontSize: "0.875rem" } }} />
                        </Box>
                    </Stack>
                    <Chip label={cutoff_label} size="small" color="warning" sx={{ fontWeight: 700 }} />
                </Stack>

                {/* Proposed Time Gap Windows — alternates delivery/origin/destination can agree
                    on, seeded when the shipment was created; editable here (add/edit/delete). */}
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: "10px", bgcolor: "action.hover" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="caption" fontWeight={700}>Proposed Time Gap Windows:</Typography>
                        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={addTimeWindow}
                            sx={{ textTransform: "none", fontWeight: 700, fontSize: 11 }}>
                            Add Window
                        </Button>
                    </Stack>
                    <Stack spacing={1}>
                        {timeWindows.map((w) => {
                            const isPrimary = primaryWindowId === w.id;
                            return (
                                <Stack key={w.id} direction="row" spacing={1} alignItems="center">
                                    <TextField type="date" size="small" value={w.date}
                                        onChange={(e) => updateTimeWindow(w.id, "date", e.target.value)}
                                        sx={{ bgcolor: "background.paper", borderRadius: 1, flex: 1 }} />
                                    <TextField type="time" size="small" value={w.time}
                                        onChange={(e) => updateTimeWindow(w.id, "time", e.target.value)}
                                        sx={{ bgcolor: "background.paper", borderRadius: 1, width: 110 }} />
                                    <Tooltip title={isPrimary ? "Primary run time" : "Set as primary run time"}>
                                        <Chip
                                            size="small"
                                            label={isPrimary ? "PRIMARY" : "Set Primary"}
                                            color={isPrimary ? "success" : "default"}
                                            variant={isPrimary ? "filled" : "outlined"}
                                            onClick={() => selectPrimaryWindow(w)}
                                            sx={{ fontWeight: 700, fontSize: 10 }}
                                        />
                                    </Tooltip>
                                    <IconButton size="small" color="error" onClick={() => removeTimeWindow(w.id)}>
                                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Stack>
                            );
                        })}
                        {timeWindows.length === 0 && (
                            <Typography variant="caption" color="text.disabled">No alternate windows proposed — add one above.</Typography>
                        )}
                    </Stack>
                </Box>
            </Paper>

            {/* ── 4-Party Inbound Agreement Gate ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Box>
                        <Typography variant="subtitle1" fontWeight={700}>4-Party Inbound Agreement Gate</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {isDualDest ? "Dual Destination: Store SK + Remote WH SK both required" : "Tap any party to view details"}
                        </Typography>
                    </Box>
                    <Chip label={isDualDest ? "DUAL DEST (2 SKS)" : "ALL 4 REQUIRED"} size="small" color="warning" variant="outlined" sx={{ fontWeight: 700, fontSize: 10 }} />
                </Stack>
                <Stack direction="row" spacing={1}>
                    {[
                        { key: "creator" as PartyKey,     label: "Creator", icon: <PersonIcon sx={{ fontSize: 14 }} />,        agreed: false },
                        { key: "fleet" as PartyKey,       label: "Fleet",   icon: <LocalShippingIcon sx={{ fontSize: 14 }} />, agreed: driver === "d1" },
                        { key: "origin" as PartyKey,      label: "Origin",  icon: <WarehouseIcon sx={{ fontSize: 14 }} />,     agreed: false },
                        { key: "destination" as PartyKey, label: "Dest.",   icon: <StoreIcon sx={{ fontSize: 14 }} />,         agreed: false },
                    ].map((p) => (
                        <Box
                            key={p.key}
                            onClick={() => setActivePartyModal(p.key)}
                            sx={{
                                flex: 1, textAlign: "center", p: 1, borderRadius: "12px", cursor: "pointer",
                                border: "1px solid", borderColor: p.agreed ? "success.light" : "divider",
                                bgcolor: p.agreed ? "success.light" : "action.hover", opacity: p.agreed ? 1 : 0.85,
                            }}
                        >
                            <Stack alignItems="center" spacing={0.25}>
                                <Box sx={{ color: p.agreed ? "success.dark" : "text.secondary" }}>{p.icon}</Box>
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: 9 }}>{p.label}</Typography>
                                {p.agreed
                                    ? <CheckCircleIcon color="success" sx={{ fontSize: 13 }} />
                                    : <HourglassEmptyIcon sx={{ fontSize: 13, color: "text.disabled" }} />}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </Paper>

            <PartyDetailDialog
                open={activePartyModal !== null}
                activeParty={activePartyModal ?? "creator"}
                onClose={() => setActivePartyModal(null)}
                onSelectParty={setActivePartyModal}
                reference={`RPL-BUILD-${transfer_id}`}
                agreements={agreements}
            />

            {/* ── Vehicle Selection ── */}
            <Box mb={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <LocalShippingIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Dedicated Fleet Carrier</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 600 }}>{vehicles.length} Available</Typography>
                </Stack>
                <Stack spacing={1.5}>
                    {vehicles.map((v) => {
                        const isSelected = selectedVehicle === v.id;
                        return (
                            <Paper key={v.id} elevation={0} onClick={() => setSelectedVehicle(v.id)}
                                sx={{ p: 2, borderRadius: "16px", border: "2px solid", borderColor: isSelected ? "primary.main" : "divider", bgcolor: isSelected ? "action.selected" : "background.paper", cursor: "pointer", opacity: isSelected ? 1 : 0.75, transition: "all 0.2s ease", position: "relative", overflow: "hidden", "&:hover": { opacity: 1, borderColor: "primary.light" } }}>
                                {isSelected && <Box sx={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 5, bgcolor: "primary.main" }} />}
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                                    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
                                        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            {v.icon === "directions_car" ? <DirectionsCarIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 26 }} /> : <LocalShippingIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 26 }} />}
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={700} noWrap>{v.name}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block" }}>Plate: {v.plate}</Typography>
                                            <Stack direction="row" spacing={0.75} mt={0.75} flexWrap="wrap">
                                                <Chip label={`Max: ${v.max_cbm} CBM`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                                <Chip label={`Payload: ${v.payload_kg.toLocaleString()} kg`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                            </Stack>
                                        </Box>
                                    </Stack>
                                    <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.5 }}>
                                        {isSelected ? <CheckCircleIcon sx={{ fontSize: 18, color: "primary.contrastText" }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "text.secondary" }} />}
                                    </Box>
                                </Stack>
                                {isSelected && v.bay && (
                                    <Box sx={{ mt: 1.5, px: 1.5, py: 0.5, bgcolor: "action.hover", borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Typography variant="caption" color="text.secondary">Bay Loading Status</Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "primary.main" }} />
                                            <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ fontFamily: "monospace" }}>{v.bay} RESERVED</Typography>
                                        </Stack>
                                    </Box>
                                )}
                            </Paper>
                        );
                    })}
                </Stack>

                {/* Driver Assignment */}
                <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 700, display: "block", mb: 1 }}>
                        Assign Driver for this Fleet
                    </Typography>
                    <TextField select size="small" fullWidth value={driver} onChange={(e) => setDriver(e.target.value)}>
                        <MenuItem value="auto">Open to Any Driver (Auto-dispatch &amp; accept)</MenuItem>
                        <MenuItem value="d1">Abebe K. — (Available Now)</MenuItem>
                        <MenuItem value="d2">Chala M. — (Currently On Route)</MenuItem>
                    </TextField>
                </Box>
            </Box>

            {/* ── Volumetric Telemetry ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <ViewInArIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Volumetric Load Telemetry</Typography>
                    </Stack>
                    <Chip label={`${cbmPercent <= 40 ? "Under" : cbmPercent <= 75 ? "Optimal" : "Near Cap."} (${cbmPercent}%)`}
                        size="small" color={cbmPercent > 85 ? "error" : cbmPercent > 60 ? "warning" : "success"} sx={{ fontWeight: 700 }} />
                </Stack>
                <Stack direction="row" alignItems="center" spacing={2.5}>
                    <Box color="primary.main"><RadialGauge percent={cbmPercent} /></Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box mb={1.5}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Volume Utilization</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>{totalCbm.toFixed(1)} / {maxCbm} m³</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={cbmPercent} sx={{ height: 8, borderRadius: 4 }} color={cbmPercent > 85 ? "error" : "primary"} />
                            <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ mt: 0.5, display: "block" }}>{(maxCbm - totalCbm).toFixed(1)} CBM Remaining Headroom</Typography>
                        </Box>
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>Gross Mass Load</Typography>
                                <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace" }}>{Math.round(totalKg).toLocaleString()} / {maxKg.toLocaleString()} kg</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={kgPercent} sx={{ height: 6, borderRadius: 4 }} color={kgPercent > 90 ? "error" : "secondary"} />
                        </Box>
                    </Box>
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-around" textAlign="center">
                    {[
                        { label: "ALLOCATED SKUs", value: items.length },
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

            {/* ── Manifest Items ── */}
            <Box mb={3}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="subtitle1" fontWeight={700}>Replenishment Manifest</Typography>
                            {isDualDest && (
                                <Chip label="DUAL DEST (2 SKs)" size="small" color="secondary"
                                    sx={{ fontWeight: 700, fontSize: 9 }} />
                            )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {isDualDest ? "Store Floor + Remote Warehouse stock keepers both required" : "Calculated from inventory velocity"}
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} size="small"
                        sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 700 }}
                        onClick={() => setAddItemsOpen(true)}>Add Items</Button>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Button size="small" variant="outlined" startIcon={<PriorityHighIcon color="error" sx={{ fontSize: 16 }} />}
                        sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: 12 }}>Priority: OOS First</Button>
                    <Tooltip title="Reset all quantities to defaults">
                        <Button size="small" startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />} color="error"
                            sx={{ textTransform: "none", fontSize: 12 }}
                            onClick={() => setQuantities(Object.fromEntries(initialItems.map((i) => [i.id, i.quantity])))}>Reset Build</Button>
                    </Tooltip>
                </Stack>
                <Stack spacing={1.5}>
                    {items.map((item) => {
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
                                            <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25} flexWrap="wrap" useFlexGap>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{item.sku} • {item.pack_label}</Typography>
                                                <Chip label={item.status === "oos" ? `${item.status_label} (0 Pcs)` : item.status === "sold" ? item.status_label : `${item.status_label} (${item.stock_qty} Pcs)`}
                                                    size="small" color={cfg.chipColor} sx={{ fontWeight: 700, fontSize: 10 }} />
                                                <Chip
                                                    size="small"
                                                    onClick={() => handleToggleDest(item.id)}
                                                    icon={(item.target_dest ?? "store") === "remote_warehouse"
                                                        ? <WarehouseIcon sx={{ fontSize: 12 }} />
                                                        : <StoreIcon sx={{ fontSize: 12 }} />}
                                                    label={(item.target_dest ?? "store") === "remote_warehouse" ? "To: Remote WH" : "To: Store Floor"}
                                                    color={(item.target_dest ?? "store") === "remote_warehouse" ? "secondary" : "primary"}
                                                    variant="outlined"
                                                    sx={{ fontWeight: 700, fontSize: 9 }}
                                                />
                                            </Stack>
                                            {item.added_by && (
                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ bgcolor: "action.hover", px: 1, py: 0.5, borderRadius: "6px", mt: 0.75, width: "fit-content" }}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                                        {item.added_by.type === "auto" ? "Auto-added:" : `Added by ${item.added_by.name}:`}{" "}
                                                        <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{item.added_by.reason}</Box>
                                                    </Typography>
                                                </Stack>
                                            )}
                                        </Box>
                                    </Stack>
                                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                        <Typography variant="subtitle2" fontWeight={800} color="primary.main">{quantities[item.id]} {item.unit}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                            {(item.cbm * (quantities[item.id] ?? 0) / item.quantity).toFixed(1)} CBM • {Math.round(item.weight_kg * (quantities[item.id] ?? 0) / item.quantity).toLocaleString()} kg
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ bgcolor: "action.hover", borderRadius: "8px", px: 1.5, py: 0.75 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <WarehouseIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                        <Typography variant="caption" color="text.secondary">{item.location}</Typography>
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Tooltip title="Move to another shipment">
                                            <IconButton size="small" onClick={() => setMoveItem(item)} sx={{ width: 22, height: 22 }}>
                                                <SwapHorizIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Remove from manifest">
                                            <IconButton size="small" onClick={() => handleRemoveItem(item.id)} sx={{ width: 22, height: 22 }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14, color: "error.main" }} />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton size="small" onClick={() => handleQty(item.id, -1)} sx={{ width: 26, height: 26, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                                            <RemoveIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                        <Typography variant="caption" fontWeight={800} sx={{ minWidth: 24, textAlign: "center", fontFamily: "monospace" }}>{quantities[item.id]}</Typography>
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
            <Paper elevation={4} sx={{ position: "sticky", bottom: 16, borderRadius: "16px", p: 2, border: "1px solid", borderColor: "divider", backdropFilter: "blur(12px)", bgcolor: "background.paper", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box>
                    <Stack direction="row" alignItems="baseline" spacing={0.75}>
                        <Typography variant="h6" fontWeight={800} color="primary.main">{totalCbm.toFixed(1)} CBM</Typography>
                        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "text.disabled" }} />
                        <Typography variant="h6" fontWeight={700}>{items.length} SKUs</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{Math.round(totalKg).toLocaleString()} kg • {activeVehicle?.name ?? "No vehicle"}</Typography>
                </Box>
                <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={handleReview}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, px: 3, py: 1.25, flexShrink: 0 }}>
                    Review & Dispatch
                </Button>
            </Paper>

            {/* ── Dialogs ── */}
            <EditRouteDialog open={editRouteOpen} originName={origin.name} destName={destination.name}
                onClose={() => setEditRouteOpen(false)}
                onSave={(o, d) => { setOrigin(o); setDestination(d); setEditRouteOpen(false); }} />
            <AddItemsDialog open={addItemsOpen} existingIds={items.map((i) => i.id)}
                onClose={() => setAddItemsOpen(false)} onAdd={handleAddItems} />
            <MoveItemDialog open={!!moveItem} item={moveItem} onClose={() => setMoveItem(null)} onMove={handleMoveItem} />
        </Box>
    );
}

ReplenishBuild.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
