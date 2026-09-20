import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
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
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import EditIcon from "@mui/icons-material/Edit";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

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

// Demo pool of addable SKUs
const AVAILABLE_SKUS: ManifestItem[] = [
    { id: 301, name: "Ballpoint Pens Box", sku: "SKU-301", status: "low", status_label: "LOW STOCK", stock_qty: 8, quantity: 20, unit: "Bx", cbm: 0.4, weight_kg: 80, location: "Aisle C-02", icon: "warning" },
    { id: 302, name: "Correction Fluid 12pk", sku: "SKU-302", status: "regular", status_label: "REGULAR", stock_qty: 30, quantity: 30, unit: "Pk", cbm: 0.3, weight_kg: 60, location: "Aisle C-03", icon: "inventory" },
    { id: 303, name: "Stapler Set", sku: "SKU-303", status: "oos", status_label: "CRITICAL OOS", stock_qty: 0, quantity: 15, unit: "Pcs", cbm: 0.5, weight_kg: 90, location: "Aisle A-01", icon: "report" },
];

// Demo sibling transfers for Move Item
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
};

function ItemIcon({ icon }: { icon: string }) {
    if (icon === "report") return <ReportIcon sx={{ fontSize: 20 }} />;
    if (icon === "warning") return <WarningIcon sx={{ fontSize: 20 }} />;
    return <InventoryIcon sx={{ fontSize: 20 }} />;
}

function RadialGauge({ percent }: { percent: number }) {
    const circumference = 2 * Math.PI * 15.9155;
    const dash = (percent / 100) * circumference;
    return (
        <Box sx={{ position: "relative", width: 88, height: 88, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.8" style={{ color: "rgba(0,0,0,0.08)" }} />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.8" strokeDasharray={`${dash}, ${circumference}`} strokeLinecap="round" style={{ color: "inherit", transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
            <Box sx={{ position: "absolute", textAlign: "center" }}>
                <Typography variant="subtitle2" fontWeight={800} lineHeight={1} sx={{ fontSize: 13 }}>{percent}%</Typography>
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
    const [selected, setSelected] = useState<Record<number, string>>({});

    const toggle = (id: number) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = "Box";
            return next;
        });
    };

    const updatePack = (e: React.MouseEvent, id: number, unit: string) => {
        e.stopPropagation();
        setSelected((prev) => ({ ...prev, [id]: unit }));
    };

    const handleAdd = () => {
        const toAdd = available.filter((s) => selected[s.id]).map((s) => ({
            ...s,
            unit: selected[s.id],
            pack_label: selected[s.id] === "Pcs" ? "Singles" : selected[s.id] === "Box" ? "Box/12" : "Carton/48"
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
                                <Paper key={item.id} elevation={0} onClick={() => toggle(item.id)}
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
                                            <Stack direction="row" spacing={1}>
                                                {["Pcs", "Box", "Carton"].map((u) => (
                                                    <Chip
                                                        key={u}
                                                        label={u === "Pcs" ? "Pcs (1)" : u === "Box" ? "Box (12)" : "Carton (48)"}
                                                        size="small"
                                                        color={selected[item.id] === u ? "primary" : "default"}
                                                        variant={selected[item.id] === u ? "filled" : "outlined"}
                                                        onClick={(e) => updatePack(e, item.id, u)}
                                                        sx={{ fontSize: 10, fontWeight: 700 }}
                                                    />
                                                ))}
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
export default function SellerShipmentsIndex({
    transfer_id,
    origin: originProp,
    destination: destinationProp,
    distance_km,
    scheduled_run,
    cutoff_label,
    vehicles,
    manifest_items: initialItems,
}: Props) {
    const [selectedVehicle, setSelectedVehicle] = useState(
        vehicles.find((v) => v.is_primary)?.id ?? vehicles[0]?.id
    );
    const [scheduleInput, setScheduleInput] = useState(scheduled_run);
    const [items, setItems] = useState<ManifestItem[]>(initialItems);
    const [quantities, setQuantities] = useState<Record<number, number>>(
        Object.fromEntries(initialItems.map((i) => [i.id, i.quantity]))
    );
    const [origin, setOrigin] = useState(originProp);
    const [destination, setDestination] = useState(destinationProp);

    // Dialog state
    const [editRouteOpen, setEditRouteOpen] = useState(false);
    const [addItemsOpen, setAddItemsOpen] = useState(false);
    const [moveItem, setMoveItem] = useState<ManifestItem | null>(null);

    const activeVehicle = vehicles.find((v) => v.id === selectedVehicle);

    const totalCbm = items.reduce((sum, item) => sum + item.cbm * ((quantities[item.id] ?? 0) / item.quantity), 0);
    const totalKg  = items.reduce((sum, item) => sum + item.weight_kg * ((quantities[item.id] ?? 0) / item.quantity), 0);
    const maxCbm = activeVehicle?.max_cbm ?? 14.5;
    const maxKg  = activeVehicle?.payload_kg ?? 4200;
    const cbmPercent = Math.min(Math.round((totalCbm / maxCbm) * 100), 100);
    const kgPercent  = Math.min(Math.round((totalKg / maxKg) * 100), 100);
    const totalCartons = Object.values(quantities).reduce((a, b) => a + b, 0);

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

    const handleMoveItem = (itemId: number, _transferId: number) => {
        // TODO: persist move to server; for now remove from this manifest
        handleRemoveItem(itemId);
    };

    const handleDispatch = () => {
        router.post(route("seller.shipments.store", transfer_id), {
            vehicle_id: selectedVehicle,
            quantities,
        });
    };

    return (
        <Box>
            <Head title="Shipments" />

            <Box sx={{ px: 2, pt: 2.5, pb: 2 }}>
                {/* ── Phase Badge ── */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Chip label="Phase 1 / 3" color="primary" size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: 10 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontWeight: 700 }}>ERP-SYNC: ACTIVE</Typography>
                </Stack>

                {/* ── Route Matrix Card ── */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>Replenishment Corridor</Typography>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Chip label="WH → Retail Store" size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: 10 }} />
                            <Tooltip title="Edit origin / target">
                                <IconButton size="small" onClick={() => setEditRouteOpen(true)}>
                                    <EditIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Stack>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: "10px", p: 1.25, mb: 1.25 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" spacing={0.5} mb={0.25}>
                                <HomeWorkIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase" }}>Origin</Typography>
                            </Stack>
                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{origin.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{origin.detail}</Typography>
                        </Box>
                        <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                            <ArrowForwardIcon color="primary" sx={{ fontSize: 18 }} />
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10 }}>{distance_km} km</Typography>
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                            <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} mb={0.25}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase" }}>Target</Typography>
                                <StoreIcon sx={{ fontSize: 12, color: "text.secondary" }} />
                            </Stack>
                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{destination.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>{destination.detail}</Typography>
                        </Box>
                    </Box>

                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ bgcolor: "action.hover", borderRadius: "10px", p: 1.25 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <ScheduleIcon sx={{ color: "primary.contrastText", fontSize: 17 }} />
                            </Box>
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Scheduled Run</Typography>
                                <TextField
                                    type="datetime-local" variant="standard" value={scheduleInput}
                                    onChange={(e) => setScheduleInput(e.target.value)}
                                    InputProps={{ disableUnderline: true, sx: { fontWeight: 700, fontSize: "0.875rem" } }}
                                />
                            </Box>
                        </Stack>
                        <Chip label={cutoff_label} size="small" color="warning" sx={{ fontWeight: 700, fontSize: 10, flexShrink: 0 }} />
                    </Stack>
                </Paper>

                {/* ── Route Protocol Notice ── */}
                <Paper elevation={0} sx={{ p: 1.25, borderRadius: "10px", bgcolor: "action.hover", mb: 1.5, display: "flex", gap: 0.75 }}>
                    <Typography color="primary.main" sx={{ flexShrink: 0, fontSize: 15 }}>ℹ</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        <strong>Route Protocol:</strong> Remote WH → Store routes auto-assign 3PL transit; local transfer requires manual fleet allocation.
                    </Typography>
                </Paper>

                {/* ── Vehicle Selection ── */}
                <Box mb={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                            <LocalShippingIcon color="primary" sx={{ fontSize: 18 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Dedicated Fleet Carrier</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 10 }}>
                            {vehicles.length} Available
                        </Typography>
                    </Stack>

                    <Stack spacing={1.25}>
                        {vehicles.map((v) => {
                            const isSelected = selectedVehicle === v.id;
                            return (
                                <Paper key={v.id} elevation={0} onClick={() => setSelectedVehicle(v.id)}
                                    sx={{ p: 1.75, borderRadius: "14px", border: "2px solid", borderColor: isSelected ? "primary.main" : "divider", bgcolor: isSelected ? "action.selected" : "background.paper", cursor: "pointer", opacity: isSelected ? 1 : 0.75, transition: "all 0.2s ease", position: "relative", overflow: "hidden" }}>
                                    {isSelected && <Box sx={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 4, bgcolor: "primary.main" }} />}
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.25}>
                                        <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                                            <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                {v.icon === "directions_car"
                                                    ? <DirectionsCarIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 22 }} />
                                                    : <LocalShippingIcon sx={{ color: isSelected ? "primary.contrastText" : "text.secondary", fontSize: 22 }} />
                                                }
                                            </Box>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{v.name}</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 11, display: "block" }}>Plate: {v.plate}</Typography>
                                                <Stack direction="row" spacing={0.5} mt={0.5} flexWrap="wrap">
                                                    <Chip label={`${v.max_cbm} CBM`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                                                    <Chip label={`${v.payload_kg.toLocaleString()} kg`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                                                </Stack>
                                            </Box>
                                        </Stack>
                                        <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: isSelected ? "primary.main" : "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            {isSelected
                                                ? <Box component="span" sx={{ color: "primary.contrastText", fontSize: 14 }}>✓</Box>
                                                : <AddIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                            }
                                        </Box>
                                    </Stack>
                                    {isSelected && v.bay && (
                                        <Box sx={{ mt: 1.25, px: 1.25, py: 0.5, bgcolor: "action.hover", borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Bay Status</Typography>
                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main" }} />
                                                <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ fontFamily: "monospace", fontSize: 11 }}>{v.bay} RESERVED</Typography>
                                            </Stack>
                                        </Box>
                                    )}
                                </Paper>
                            );
                        })}
                    </Stack>
                </Box>

                {/* ── Volumetric Load Telemetry ── */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                            <ViewInArIcon color="primary" sx={{ fontSize: 18 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Volumetric Load Telemetry</Typography>
                        </Stack>
                        <Chip label={`${cbmPercent <= 40 ? "Under" : cbmPercent <= 75 ? "Optimal" : "Near Cap."} (${cbmPercent}%)`}
                            size="small" color={cbmPercent > 85 ? "error" : cbmPercent > 60 ? "warning" : "success"} sx={{ fontWeight: 700, fontSize: 10 }} />
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Box color="primary.main"><RadialGauge percent={cbmPercent} /></Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box mb={1.25}>
                                <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: 11 }}>Volume Utilization</Typography>
                                    <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace", fontSize: 11 }}>{totalCbm.toFixed(1)} / {maxCbm} m³</Typography>
                                </Stack>
                                <LinearProgress variant="determinate" value={cbmPercent} sx={{ height: 7, borderRadius: 4 }} color={cbmPercent > 85 ? "error" : "primary"} />
                                <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ mt: 0.5, display: "block", fontSize: 11 }}>{(maxCbm - totalCbm).toFixed(1)} CBM Remaining</Typography>
                            </Box>
                            <Box>
                                <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: 11 }}>Gross Mass</Typography>
                                    <Typography variant="caption" fontWeight={800} sx={{ fontFamily: "monospace", fontSize: 11 }}>{Math.round(totalKg).toLocaleString()} / {maxKg.toLocaleString()} kg</Typography>
                                </Stack>
                                <LinearProgress variant="determinate" value={kgPercent} sx={{ height: 6, borderRadius: 4 }} color={kgPercent > 90 ? "error" : "secondary"} />
                            </Box>
                        </Box>
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" justifyContent="space-around" textAlign="center">
                        {[
                            { label: "SKUs", value: items.length },
                            { label: "CARTONS", value: totalCartons },
                            { label: "PALLET EQ", value: `${(totalCbm / 2.07).toFixed(1)}` },
                        ].map((stat) => (
                            <Box key={stat.label}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 600, fontSize: 10 }}>{stat.label}</Typography>
                                <Typography variant="subtitle2" fontWeight={800}>{stat.value}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Paper>

                {/* ── Replenishment Manifest ── */}
                <Box mb={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.25}>
                        <Box>
                            <Typography variant="subtitle2" fontWeight={700}>Replenishment Manifest</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Calculated from inventory velocity</Typography>
                        </Box>
                        <Button variant="contained" startIcon={<AddIcon />} size="small"
                            sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 700, fontSize: 12 }}
                            onClick={() => setAddItemsOpen(true)}>
                            Add Items
                        </Button>
                    </Stack>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25}>
                        <Button size="small" variant="outlined" startIcon={<PriorityHighIcon color="error" sx={{ fontSize: 14 }} />}
                            sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: 11 }}>
                            Priority: OOS First
                        </Button>
                        <Tooltip title="Reset quantities to defaults">
                            <Button size="small" startIcon={<DeleteSweepIcon sx={{ fontSize: 14 }} />} color="error"
                                sx={{ textTransform: "none", fontSize: 11 }}
                                onClick={() => setQuantities(Object.fromEntries(initialItems.map((i) => [i.id, i.quantity])))}>
                                Reset
                            </Button>
                        </Tooltip>
                    </Stack>

                    <Stack spacing={1.25}>
                        {items.map((item) => {
                            const cfg = statusColors[item.status];
                            return (
                                <Paper key={item.id} elevation={0} sx={{ p: 1.75, borderRadius: "14px", border: "1px solid", borderColor: "divider" }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.25} mb={1.25}>
                                        <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                                            <Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: cfg.bg, color: cfg.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <ItemIcon icon={item.icon} />
                                            </Box>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{item.name}</Typography>
                                                <Stack direction="row" alignItems="center" spacing={0.5} mt={0.25} flexWrap="wrap">
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 10 }}>{item.sku}</Typography>
                                                    <Chip label={item.status === "oos" ? `${item.status_label} (0)` : `${item.status_label} (${item.stock_qty})`}
                                                        size="small" color={cfg.chipColor} sx={{ fontWeight: 700, fontSize: 9, height: 18 }} />
                                                </Stack>
                                            </Box>
                                        </Stack>
                                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ fontSize: 13 }}>
                                                {quantities[item.id]} {item.unit}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 10 }}>
                                                {(item.cbm * (quantities[item.id] ?? 0) / item.quantity).toFixed(1)} CBM
                                            </Typography>
                                        </Box>
                                    </Stack>

                                    <Stack direction="row" justifyContent="space-between" alignItems="center"
                                        sx={{ bgcolor: "action.hover", borderRadius: "8px", px: 1.25, py: 0.5 }}>
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <WarehouseIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{item.location}</Typography>
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
                                            <IconButton size="small" onClick={() => handleQty(item.id, -1)}
                                                sx={{ width: 24, height: 24, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                                                <RemoveIcon sx={{ fontSize: 13 }} />
                                            </IconButton>
                                            <Typography variant="caption" fontWeight={800} sx={{ minWidth: 22, textAlign: "center", fontFamily: "monospace", fontSize: 13 }}>
                                                {quantities[item.id]}
                                            </Typography>
                                            <IconButton size="small" onClick={() => handleQty(item.id, 1)}
                                                sx={{ width: 24, height: 24, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
                                                <AddIcon sx={{ fontSize: 13 }} />
                                            </IconButton>
                                        </Stack>
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                </Box>

                {/* ── Sticky Execution Bar ── */}
                <Paper elevation={4} sx={{ position: "sticky", bottom: 8, borderRadius: "14px", p: 1.75, border: "1px solid", borderColor: "divider", backdropFilter: "blur(12px)", bgcolor: "background.paper", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5 }}>
                    <Box>
                        <Stack direction="row" alignItems="baseline" spacing={0.5}>
                            <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ fontSize: 16 }}>{totalCbm.toFixed(1)} CBM</Typography>
                            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "text.disabled" }} />
                            <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: 16 }}>{items.length} SKUs</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                            {Math.round(totalKg).toLocaleString()} kg • {activeVehicle?.name ?? "No vehicle"}
                        </Typography>
                    </Box>
                    <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={handleDispatch}
                        sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, px: 2.5, py: 1, flexShrink: 0, fontSize: 13 }}>
                        Review & Dispatch
                    </Button>
                </Paper>
            </Box>

            {/* ── Dialogs ── */}
            <EditRouteDialog
                open={editRouteOpen}
                originName={origin.name}
                destName={destination.name}
                onClose={() => setEditRouteOpen(false)}
                onSave={(o, d) => { setOrigin(o); setDestination(d); setEditRouteOpen(false); }}
            />
            <AddItemsDialog
                open={addItemsOpen}
                existingIds={items.map((i) => i.id)}
                onClose={() => setAddItemsOpen(false)}
                onAdd={handleAddItems}
            />
            <MoveItemDialog
                open={!!moveItem}
                item={moveItem}
                onClose={() => setMoveItem(null)}
                onMove={handleMoveItem}
            />
        </Box>
    );
}

SellerShipmentsIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
