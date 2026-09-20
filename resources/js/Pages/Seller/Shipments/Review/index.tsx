import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Chip,
    LinearProgress,
    Button,
    Stack,
    Dialog,
    DialogContent,
    TextField,
    Divider,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
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
 | Page Component
 |----------------------------------------------------------*/
export default function SellerReplenishReview({
    transfer_id, reference, origin, destination, distance_km, scheduled_run, cutoff_label, slot, vehicle, manifest_items, total_cbm, total_kg, total_cartons,
}: Props) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [notes, setNotes] = useState("");

    const cbmPercent = Math.round((total_cbm / vehicle.max_cbm) * 100);
    const kgPercent  = Math.round((total_kg / vehicle.payload_kg) * 100);
    const loadState: "healthy" | "warning" | "over" = cbmPercent > 100 ? "over" : cbmPercent > 85 ? "warning" : "healthy";

    const handleDispatch = () => {
        router.post(route("seller.shipments.dispatch", transfer_id), { notes });
    };

    return (
        <Box sx={{ pb: 12 }}>
            <Head title="Review & Dispatch" />

            {/* Header */}
            <Box sx={{ px: 2, pt: 2, pb: 1, position: "sticky", top: 0, bgcolor: "background.default", zIndex: 10 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                            <LocalShippingIcon color="primary" />
                            <Typography variant="h6" fontWeight={800}>Review &amp; Dispatch</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">Phase 2 / 3</Typography>
                    </Box>
                    <Chip icon={<SyncAltIcon sx={{ fontSize: 14 }} />} label="SYNC" color="primary" size="small" sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 10 }} />
                </Stack>
            </Box>

            <Box sx={{ px: 2 }}>
                <PhaseStepper active={2} />

                {/* Validation Banner */}
                <Box mb={2}>
                    {loadState === "healthy" && (
                        <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", border: "1px solid", borderColor: "success.light" }}>
                            <Stack direction="row" spacing={1}>
                                <CheckCircleIcon color="success" sx={{ fontSize: 20, mt: 0.25 }} />
                                <Box>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="subtitle2" fontWeight={700}>Ready for Dispatch</Typography>
                                        <Typography variant="caption" fontWeight={700} color="success.main">{cbmPercent}% Cap</Typography>
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">Load is within carrier limits.</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    )}
                    {loadState === "warning" && (
                        <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", border: "1px solid", borderColor: "warning.light", bgcolor: "warning.light" }}>
                            <Stack direction="row" spacing={1}>
                                <WarningAmberIcon sx={{ color: "#fff", fontSize: 20, mt: 0.25 }} />
                                <Box>
                                    <Typography variant="subtitle2" fontWeight={700}>Near Capacity Notice ({cbmPercent}%)</Typography>
                                    <Typography variant="caption">Load is near limit ({total_cbm.toFixed(1)} / {vehicle.max_cbm} m³).</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    )}
                    {loadState === "over" && (
                        <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", border: "1px solid", borderColor: "error.light", bgcolor: "error.light" }}>
                            <Stack direction="row" spacing={1} mb={1}>
                                <ErrorIcon sx={{ color: "#fff", fontSize: 20, mt: 0.25 }} />
                                <Box>
                                    <Typography variant="subtitle2" fontWeight={700} color="error.dark">Over-Capacity!</Typography>
                                    <Typography variant="caption" color="error.dark">+{ (total_cbm - vehicle.max_cbm).toFixed(1) } m³ EXCEEDED. Reduce cartons.</Typography>
                                </Box>
                            </Stack>
                            <Button fullWidth variant="contained" color="error" size="small" onClick={() => router.get(route("seller.shipments.index"))}>Return to Manifest</Button>
                        </Paper>
                    )}
                </Box>

                {/* Corridor & Carrier Combined */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>CORRIDOR</Typography>
                        <Chip icon={<TimerIcon sx={{ fontSize: 13 }} />} label={cutoff_label} size="small" color="warning" sx={{ fontWeight: 700, fontSize: 10 }} />
                    </Stack>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: "8px", p: 1, mb: 1.5 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{origin.name}</Typography>
                        </Box>
                        <ArrowForwardIcon color="primary" sx={{ fontSize: 16 }} />
                        <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{destination.name}</Typography>
                        </Box>
                    </Box>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block">CARRIER</Typography>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 13 }}>{vehicle.plate}</Typography>
                        </Box>
                        <Box textAlign="right">
                            <Typography variant="caption" color="text.secondary" display="block">SLOT</Typography>
                            <Typography variant="subtitle2" fontWeight={700} color="primary.main" sx={{ fontSize: 13 }}>{slot}</Typography>
                        </Box>
                    </Stack>
                </Paper>

                {/* Manifest Summary */}
                <Box mb={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="subtitle2" fontWeight={700}>Manifest ({manifest_items.length} items)</Typography>
                        <Button startIcon={<EditIcon sx={{ fontSize: 12 }} />} size="small" onClick={() => router.get(route("seller.shipments.show", transfer_id))} sx={{ textTransform: "none" }}>Adjust</Button>
                    </Stack>
                    <Stack spacing={1}>
                        {manifest_items.map((item) => {
                            const cfg = statusColors[item.status];
                            return (
                                <Paper key={item.id} elevation={0} sx={{ p: 1.5, borderRadius: "10px", border: "1px solid", borderColor: "divider" }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ fontSize: 13 }}>{item.name}</Typography>
                                            <Chip label={item.status_label} size="small" color={cfg.chipColor} sx={{ fontWeight: 700, fontSize: 9, height: 18, mt: 0.5 }} />
                                        </Box>
                                        <Box textAlign="right" flexShrink={0}>
                                            <Typography variant="subtitle2" fontWeight={800} color="primary.main">{item.quantity}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{item.cbm.toFixed(1)} m³</Typography>
                                        </Box>
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                </Box>

                {/* Dispatch Notes */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "divider", mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight={700} mb={1}>Dispatch Notes (optional)</Typography>
                    <TextField
                        fullWidth multiline rows={2} variant="filled"
                        placeholder="Add driver instructions..."
                        value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 280))}
                        sx={{ "& .MuiFilledInput-root": { borderRadius: "10px", bgcolor: "action.hover", fontSize: 13 } }}
                        InputProps={{ disableUnderline: true }}
                    />
                </Paper>
            </Box>

            {/* Bottom Actions */}
            <Paper elevation={8} sx={{ position: "fixed", bottom: 68, left: 0, right: 0, p: 2, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider", zIndex: 40 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="subtitle1" fontWeight={800} color="primary.main">{total_cbm.toFixed(1)} / {vehicle.max_cbm} m³</Typography>
                    <Typography variant="caption" color="text.secondary">{total_cartons} Ctns</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" onClick={() => router.get(route("seller.shipments.show", transfer_id))} sx={{ borderRadius: "10px", fontWeight: 700 }}>Back</Button>
                    <Button fullWidth variant="contained" onClick={() => setConfirmOpen(true)} disabled={loadState === "over"} sx={{ borderRadius: "10px", fontWeight: 700 }}>Confirm Dispatch</Button>
                </Stack>
            </Paper>

            {/* Confirmation Dialog */}
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} PaperProps={{ sx: { borderRadius: "16px", p: 1, m: 2 } }} fullWidth>
                <DialogContent>
                    <Typography variant="h6" fontWeight={800} mb={1}>Dispatch shipment?</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        {total_cartons} cartons to {destination.name}. Carrier: {vehicle.plate}.
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button fullWidth variant="outlined" onClick={() => setConfirmOpen(false)} sx={{ borderRadius: "10px", fontWeight: 700 }}>Cancel</Button>
                        <Button fullWidth variant="contained" onClick={handleDispatch} sx={{ borderRadius: "10px", fontWeight: 700 }}>Confirm</Button>
                    </Stack>
                </DialogContent>
            </Dialog>
        </Box>
    );
}

SellerReplenishReview.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
