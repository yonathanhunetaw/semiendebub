import React, { useEffect, useState } from "react";
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
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CallIcon from "@mui/icons-material/Call";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import InventoryIcon from "@mui/icons-material/Inventory";

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
    quantity: number;
    unit: string;
    cbm: number;
}

interface Props {
    transfer_id: number;
    reference: string;
    origin: { name: string; detail: string };
    destination: { name: string; detail: string };
    vehicle: Vehicle;
    manifest_items: ManifestItem[];
    total_cbm: number;
    total_cartons: number;
    driver: { name: string; phone: string };
    gate_pass: string;
    eta: string;
    est_mins: number;
    transit_pct: number;
}

function Confetti() {
    const [pieces, setPieces] = useState<any[]>([]);

    useEffect(() => {
        const colors = ["#004632", "#0d5f46", "#8cd5b6", "#ffdcc3", "#d5e0f8"];
        const newPieces = Array.from({ length: 30 }).map((_, i) => ({
            id: i,
            size: Math.floor(Math.random() * 5) + 4,
            left: Math.floor(Math.random() * 90) + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            animDuration: (Math.random() * 1.5 + 1.2).toFixed(2),
            delay: (Math.random() * 0.3).toFixed(2),
            rot1: Math.floor(Math.random() * 360),
            rot2: Math.floor(Math.random() * 720) - 360,
            transY: Math.floor(Math.random() * 40) + 40,
            transX: Math.floor(Math.random() * 40) - 20,
        }));
        setPieces(newPieces);
    }, []);

    return (
        <Box sx={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
            {pieces.map((p) => (
                <Box
                    key={p.id}
                    sx={{
                        position: "absolute", top: "-20px", left: `${p.left}%`, width: p.size, height: p.size * 1.5,
                        bgcolor: p.color, borderRadius: "2px", opacity: 0, transform: `rotate(${p.rot1}deg)`,
                        animation: `confetti-fall-mobile ${p.animDuration}s cubic-bezier(.25,.46,.45,.94) ${p.delay}s forwards`,
                        "@keyframes confetti-fall-mobile": {
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

export default function SellerReplenishDispatched({
    reference, origin, destination, vehicle, manifest_items, total_cbm, total_cartons, driver, gate_pass, eta, est_mins, transit_pct,
}: Props) {
    return (
        <Box sx={{ pb: 12 }}>
            <Head title="Dispatched" />
            <Confetti />

            <Box sx={{ px: 2, pt: 3, pb: 2, textAlign: "center" }}>
                <Box sx={{ width: 64, height: 64, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 2, boxShadow: "0 8px 16px rgba(0,70,50,0.2)" }}>
                    <CheckCircleIcon sx={{ fontSize: 36 }} />
                </Box>
                <Typography variant="h5" fontWeight={800} mb={0.5}>Shipment Dispatched</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{reference}</Typography>
            </Box>

            <Box sx={{ px: 2 }}>
                {/* Gate Pass */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ width: 64, height: 64, bgcolor: "background.default", borderRadius: 1, p: 0.5, border: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <QrCode2Icon sx={{ fontSize: 48, color: "text.primary" }} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700}>Digital Gate Pass</Typography>
                            <Typography variant="h6" fontWeight={800} sx={{ fontFamily: "monospace", letterSpacing: 1 }}>{gate_pass}</Typography>
                            <Chip label="EN ROUTE" size="small" color="primary" sx={{ mt: 0.5, fontWeight: 700, fontSize: 10, height: 20 }} />
                        </Box>
                    </Stack>
                </Paper>

                {/* Live Transit */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Typography variant="subtitle2" fontWeight={700}>Live Progress</Typography>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>ETA: {eta}</Typography>
                    </Stack>
                    <Box sx={{ position: "relative", py: 1.5, mb: 1 }}>
                        <LinearProgress variant="determinate" value={transit_pct} sx={{ height: 6, borderRadius: 3, bgcolor: "action.selected" }} />
                        <Box sx={{ position: "absolute", top: "50%", left: `${transit_pct}%`, transform: "translate(-50%, -50%)", width: 24, height: 24, borderRadius: "50%", bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: 2 }}>
                            <LocalShippingIcon sx={{ fontSize: 14, color: "#fff" }} />
                        </Box>
                    </Box>
                    <Stack direction="row" justifyContent="space-between" mt={1}>
                        <Typography variant="caption" color="text.secondary">{origin.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{destination.name}</Typography>
                    </Stack>
                </Paper>

                {/* Driver */}
                <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 2, bgcolor: "action.hover" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="subtitle2" fontWeight={700}>{driver.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{vehicle.plate}</Typography>
                        </Box>
                        <Button variant="contained" component="a" href={`tel:${driver.phone}`} sx={{ minWidth: 0, width: 40, height: 40, borderRadius: "10px" }}>
                            <CallIcon fontSize="small" />
                        </Button>
                    </Stack>
                </Paper>

                {/* Accordion */}
                <Paper elevation={0} sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider", mb: 3, overflow: "hidden" }}>
                    <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <InventoryIcon color="primary" sx={{ fontSize: 20 }} />
                                <Typography variant="subtitle2" fontWeight={700}>Manifest ({manifest_items.length})</Typography>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                            <Stack spacing={1}>
                                {manifest_items.map((item) => (
                                    <Box key={item.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.5 }}>
                                        <Typography variant="caption" fontWeight={700}>{item.name}</Typography>
                                        <Typography variant="caption" fontWeight={800} color="primary.main">{item.quantity} {item.unit}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Paper>

                <Stack spacing={1.5}>
                    <Button variant="contained" startIcon={<MyLocationIcon />} fullWidth sx={{ py: 1.5, borderRadius: "12px", fontWeight: 700 }}>Track Live</Button>
                    <Button variant="outlined" fullWidth onClick={() => router.get(route("seller.dashboard"))} sx={{ py: 1.5, borderRadius: "12px", fontWeight: 700 }}>Return to Home</Button>
                </Stack>
            </Box>
        </Box>
    );
}

SellerReplenishDispatched.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
