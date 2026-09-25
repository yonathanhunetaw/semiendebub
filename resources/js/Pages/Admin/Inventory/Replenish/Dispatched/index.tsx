import React, { useEffect, useState } from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Chip,
    LinearProgress,
    Button,
    Stack,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Divider,
    IconButton,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ScheduleIcon from "@mui/icons-material/Schedule";
import BadgeIcon from "@mui/icons-material/Badge";
import RouteIcon from "@mui/icons-material/Route";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonIcon from "@mui/icons-material/Person";
import CallIcon from "@mui/icons-material/Call";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import DownloadIcon from "@mui/icons-material/Download";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import InventoryIcon from "@mui/icons-material/Inventory";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface Vehicle {
    id: string;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
}

interface ManifestItem {
    id: number;
    name: string;
    sku: string;
    pack_label: string;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg: number;
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
    vehicle: Vehicle;
    manifest_items: ManifestItem[];
    total_cbm: number;
    total_kg: number;
    total_cartons: number;
    driver: { name: string; phone: string };
    gate_pass: string;
    departure_time: string;
    eta: string;
    est_mins: number;
    transit_pct: number;
}

/* ----------------------------------------------------------
 | Confetti Component (Moment of Delight)
 |----------------------------------------------------------*/
function Confetti() {
    const [pieces, setPieces] = useState<any[]>([]);

    useEffect(() => {
        const colors = ["#004632", "#0d5f46", "#8cd5b6", "#ffdcc3", "#d5e0f8"];
        const newPieces = Array.from({ length: 40 }).map((_, i) => {
            const animDuration = (Math.random() * 1.5 + 1.2).toFixed(2);
            return {
                id: i,
                size: Math.floor(Math.random() * 6) + 4,
                left: Math.floor(Math.random() * 90) + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                animDuration,
                delay: (Math.random() * 0.3).toFixed(2),
                rot1: Math.floor(Math.random() * 360),
                rot2: Math.floor(Math.random() * 720) - 360,
                transY: Math.floor(Math.random() * 40) + 40,
                transX: Math.floor(Math.random() * 40) - 20,
            };
        });
        setPieces(newPieces);
    }, []);

    return (
        <Box sx={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
            {pieces.map((p) => (
                <Box
                    key={p.id}
                    sx={{
                        position: "absolute",
                        top: "-20px",
                        left: `${p.left}%`,
                        width: p.size,
                        height: p.size * 1.5,
                        bgcolor: p.color,
                        borderRadius: "2px",
                        opacity: 0,
                        transform: `rotate(${p.rot1}deg)`,
                        animation: `confetti-fall ${p.animDuration}s cubic-bezier(.25,.46,.45,.94) ${p.delay}s forwards`,
                        "@keyframes confetti-fall": {
                            "0%": { top: "-20px", opacity: 0.9, transform: `rotate(${p.rot1}deg)` },
                            "70%": { opacity: 0.9 },
                            "100%": { top: `${p.transY}%`, opacity: 0, transform: `translate(${p.transX}px) rotate(${p.rot2}deg)` },
                        },
                    }}
                />
            ))}
        </Box>
    );
}

/* ----------------------------------------------------------
 | Phase Stepper
 |----------------------------------------------------------*/
function PhaseStepper() {
    return (
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: "12px", bgcolor: "action.hover", border: "1px solid", borderColor: "divider", mb: 2 }}>
            <Stack direction="row" alignItems="center">
                {["Manifest", "Review", "Dispatched"].map((label, i) => (
                    <React.Fragment key={label}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: i === 2 ? "0 0 0 3px rgba(0, 70, 50, 0.15)" : "none" }}>
                                {i < 2 ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <Typography variant="caption" fontWeight={800} lineHeight={1}>3</Typography>}
                            </Box>
                            <Box>
                                <Typography variant="caption" fontWeight={i === 2 ? 800 : 600} color={i === 2 ? "primary.main" : "text.secondary"} sx={{ display: "block", lineHeight: 1.1, fontSize: 11 }}>{label}</Typography>
                                <Typography variant="caption" color={i === 2 ? "primary.main" : "text.disabled"} sx={{ fontSize: 10, lineHeight: 1 }}>{i === 2 ? "Active" : "Done"}</Typography>
                            </Box>
                        </Stack>
                        {i < 2 && <Box sx={{ flex: 1, height: 2, mx: 1, bgcolor: "primary.main" }} />}
                    </React.Fragment>
                ))}
            </Stack>
        </Paper>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishDispatched({
    transfer_id, reference, origin, destination, vehicle, manifest_items, total_cbm, total_kg, total_cartons, driver, gate_pass, departure_time, eta, est_mins, transit_pct,
}: Props) {
    return (
        <Box sx={{ maxWidth: 720, mx: "auto", pb: 8 }}>
            <Head title="Shipment Dispatched" />
            <Confetti />

            {/* ── Header ── */}
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                <LocalShippingIcon color="primary" />
                <Typography variant="h5" fontWeight={800}>Shipments</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={2}>Phase 3 / 3 — Tracking &amp; Handoff</Typography>

            <PhaseStepper />

            {/* ── Success Hero ── */}
            <Paper elevation={0} sx={{ p: 3, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2, position: "relative", overflow: "hidden" }}>
                <Box sx={{ position: "absolute", top: -20, right: -20, width: 150, height: 150, bgcolor: "primary.light", opacity: 0.1, borderRadius: "50%" }} />
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ width: 56, height: 56, borderRadius: "16px", bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,70,50,0.2)" }}>
                            <CheckCircleIcon sx={{ fontSize: 32 }} />
                        </Box>
                        <Box>
                            <Typography variant="h5" fontWeight={800}>Shipment Dispatched</Typography>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ fontFamily: "monospace", mt: 0.5 }}>REF: {reference}</Typography>
                        </Box>
                    </Stack>
                    <Chip label="EN ROUTE" color="primary" size="small" sx={{ fontWeight: 800, "& .MuiChip-label": { display: "flex", alignItems: "center", gap: 1 } }} icon={<Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.contrastText" }} />} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: "80%" }}>
                    Manifest cleared gate inspection and released for transit. Carrier en route to destination.
                </Typography>
                <Box sx={{ mt: 2.5, p: 1.5, bgcolor: "action.hover", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <ScheduleIcon color="primary" sx={{ fontSize: 18 }} />
                        <Typography variant="subtitle2" fontWeight={700}>Est. Clearance to Dock</Typography>
                    </Stack>
                    <Typography variant="h6" fontWeight={800} color="primary.main">{est_mins} MINS</Typography>
                </Box>
            </Paper>

            {/* ── Gate Pass ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <BadgeIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Digital Gate Pass</Typography>
                    </Stack>
                    <Chip label={gate_pass} size="small" sx={{ fontFamily: "monospace", fontWeight: 700 }} />
                </Stack>
                <Stack direction="row" spacing={2} sx={{ p: 2, bgcolor: "action.hover", borderRadius: "12px" }}>
                    <Box sx={{ width: 80, height: 80, bgcolor: "background.paper", borderRadius: 1, p: 1, flexShrink: 0, border: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <QrCode2Icon sx={{ fontSize: 60, color: "text.primary" }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />
                            <Typography variant="subtitle2" fontWeight={700}>Security Verified</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block">Gate release logged at <strong>{departure_time}</strong></Typography>
                        <Typography variant="caption" color="text.secondary" display="block" mb={1}>Terminal Gate #04 • Outbound Lane B</Typography>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Chip label="FAST-PASS" size="small" color="primary" sx={{ fontWeight: 800, fontSize: 10, height: 20 }} />
                            <Typography variant="caption" color="text.secondary">Merkato Priority Corridor</Typography>
                        </Stack>
                    </Box>
                </Stack>
            </Paper>

            {/* ── Live Transit ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <RouteIcon color="primary" sx={{ fontSize: 20 }} />
                        <Typography variant="subtitle1" fontWeight={700}>Corridor &amp; Live Progress</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>18.4 km total</Typography>
                </Stack>
                
                {/* Track */}
                <Box sx={{ position: "relative", py: 1.5, mb: 1 }}>
                    <LinearProgress variant="determinate" value={transit_pct} sx={{ height: 8, borderRadius: 4, bgcolor: "action.selected", "& .MuiLinearProgress-bar": { borderRadius: 4 } }} />
                    <Box sx={{ position: "absolute", top: "50%", left: `${transit_pct}%`, transform: "translate(-50%, -50%)", width: 28, height: 28, borderRadius: "50%", bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: 2, transition: "left 1s ease" }}>
                        <LocalShippingIcon sx={{ fontSize: 16, color: "#fff" }} />
                    </Box>
                </Box>

                <Stack direction="row" spacing={1.5} mb={2}>
                    <Box sx={{ flex: 1, bgcolor: "action.hover", p: 1.5, borderRadius: "10px" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>Origin</Typography>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{origin.name}</Typography>
                        <Typography variant="caption" color="text.secondary">Dep: {departure_time}</Typography>
                    </Box>
                    <Box sx={{ flex: 1, bgcolor: "action.hover", p: 1.5, borderRadius: "10px" }}>
                        <Typography variant="caption" color="primary.main" sx={{ textTransform: "uppercase", fontWeight: 700 }}>Destination</Typography>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>{destination.name}</Typography>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>ETA: {eta}</Typography>
                    </Box>
                </Stack>
            </Paper>

            {/* ── Driver Info ── */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1" fontWeight={700}>Carrier &amp; Logistics Unit</Typography>
                    <Chip label="FLEET ID #TRK-109" size="small" sx={{ fontWeight: 700, fontSize: 10 }} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: "12px", mb: 1.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: "secondary.light", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <PersonIcon sx={{ color: "secondary.dark" }} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" fontWeight={700}>{driver.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{vehicle.name} ({vehicle.plate})</Typography>
                        </Box>
                    </Stack>
                    <Button variant="contained" component="a" href={`tel:${driver.phone}`} sx={{ minWidth: 0, width: 44, height: 44, borderRadius: "12px" }}>
                        <CallIcon />
                    </Button>
                </Stack>
                <Box>
                    <Stack direction="row" justifyContent="space-between" mb={0.5}>
                        <Typography variant="caption" color="text.secondary">Volumetric Capacity ({total_cbm.toFixed(1)} / {vehicle.max_cbm} CBM)</Typography>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>{Math.round((total_cbm / vehicle.max_cbm) * 100)}% Utilized</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={(total_cbm / vehicle.max_cbm) * 100} sx={{ height: 6, borderRadius: 3, mb: 1 }} />
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">Payload: {Math.round(total_kg).toLocaleString()} kg</Typography>
                        <Typography variant="caption" color="text.secondary">{total_cartons} Cartons Loaded</Typography>
                    </Stack>
                </Box>
            </Paper>

            {/* ── Manifest Accordion ── */}
            <Paper elevation={0} sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 3, overflow: "hidden" }}>
                <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2.5, py: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                            <InventoryIcon color="primary" sx={{ fontSize: 22 }} />
                            <Box>
                                <Typography variant="subtitle1" fontWeight={700}>Committed Manifest</Typography>
                                <Typography variant="caption" color="text.secondary">{manifest_items.length} Items • Destination Verified</Typography>
                            </Box>
                        </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
                        <Stack spacing={1}>
                            {manifest_items.map((item) => (
                                <Box key={item.id} sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <Box sx={{ minWidth: 0, flex: 1, pr: 2 }}>
                                        <Typography variant="subtitle2" fontWeight={700} noWrap>{item.name}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{item.sku}</Typography>
                                    </Box>
                                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                        <Typography variant="subtitle2" fontWeight={800}>{item.quantity} {item.unit}</Typography>
                                        <Typography variant="caption" color="text.secondary">{item.cbm.toFixed(1)} CBM</Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Stack>
                        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: "primary.light", borderRadius: "10px", display: "flex", alignItems: "center", gap: 1 }}>
                            <MarkEmailReadIcon color="primary" sx={{ fontSize: 18 }} />
                            <Typography variant="caption" color="text.primary">Store receiver at <strong>{destination.name}</strong> has been notified via SMS.</Typography>
                        </Box>
                    </AccordionDetails>
                </Accordion>
            </Paper>

            {/* ── Actions ── */}
            <Stack spacing={1.5}>
                <Button variant="contained" size="large" startIcon={<MyLocationIcon />} sx={{ borderRadius: "12px", py: 1.5, fontWeight: 700, fontSize: 15 }}>
                    Track Live GPS / Fleet
                </Button>
                <Button variant="outlined" size="large" startIcon={<DownloadIcon />} sx={{ borderRadius: "12px", py: 1.5, fontWeight: 700, fontSize: 15 }}>
                    Download Manifest PDF (BOL)
                </Button>
                <Button variant="text" size="large" startIcon={<AddCircleOutlineIcon />} onClick={() => router.get(route("admin.inventory.replenish"))} sx={{ py: 1.5, fontWeight: 700 }}>
                    Create Another Replenishment
                </Button>
            </Stack>
        </Box>
    );
}

ReplenishDispatched.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
