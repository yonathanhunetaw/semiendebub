import React, { useState } from "react";
import { Link } from "@inertiajs/react";
import { Box, Button, Chip, Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
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
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import SyncIcon from "@mui/icons-material/Sync";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import RouteIcon from "@mui/icons-material/Route";

import PartyDetailDialog from "./PartyDetailDialog";
import type {
    PartyAgreementsMap,
    PartyKey,
    ReplenishTransferStatus,
    ScheduledTransfer,
    StatusConfigEntry,
} from "@/types/adminReplenish";

const statusConfig: Record<ReplenishTransferStatus, StatusConfigEntry> = {
    scheduled:  { label: "Scheduled",        color: "success",   icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    pending:    { label: "Pending Manifest", color: "warning",   icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
    overdue:    { label: "Overdue",          color: "error",     icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
    dispatched: { label: "Dispatched",       color: "info",      icon: <LocalShippingIcon sx={{ fontSize: 14 }} /> },
    en_route:   { label: "En Route",         color: "secondary", icon: <RouteIcon sx={{ fontSize: 14 }} /> },
    shipped:    { label: "Shipped",          color: "primary",   icon: <TaskAltIcon sx={{ fontSize: 14 }} /> },
};

export interface TransferCardProps {
    t: ScheduledTransfer;
    onEditRoute: (t: ScheduledTransfer) => void;
}

export default function TransferCard({ t, onEditRoute }: TransferCardProps) {
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const cfg = statusConfig[t.status];
    const creator = t.created_by || "Admin";
    const isDispatched = t.status === "dispatched";
    const isTransit = t.status === "en_route" || t.status === "shipped";

    const agreements: PartyAgreementsMap = {
        creator: t.agreements?.creator ?? {
            title: "1. Creator",
            role: "Seller",
            party: `Admin • ${t.created_at ?? "Today"}`,
            status: isDispatched ? "created" : "pending",
            status_label: isDispatched ? "Created" : "Pending Dispatch",
            detail: isDispatched ? "Manifest reviewed & dispatched by Admin." : "Manifest drafted; awaiting dispatch sign-off.",
        },
        fleet: t.agreements?.fleet ?? {
            title: "2. Fleet",
            role: "Carrier",
            party: `${t.vehicle_name} • ${t.vehicle_plate}`,
            status: t.status === "overdue" ? "rescheduled" : (t.status === "scheduled" || isDispatched) ? "accepted" : "pending",
            status_label: t.status === "overdue" ? "Rescheduled" : (t.status === "scheduled" || isDispatched) ? "Driver Accepted" : "Pending Driver",
            detail: t.status === "overdue"
                ? "Driver requested slot reschedule due to transit maintenance."
                : (t.status === "scheduled" || isDispatched)
                ? "Driver accepted assignment • ETA on schedule."
                : "Awaiting driver assignment & route confirmation.",
        },
        origin: t.agreements?.origin ?? {
            title: "3. Origin",
            role: "Depot",
            party: `${t.origin.name} (${t.origin.detail})`,
            status: t.status === "overdue" ? "rescheduled" : (t.status === "pending" || isDispatched) ? "accepted" : "pending",
            status_label: t.status === "overdue" ? "Rescheduled" : (t.status === "pending" || isDispatched) ? "Accepted" : "Pending Stock Keeper",
            detail: t.status === "overdue"
                ? "Stock Keeper sent a reschedule notice due to loading dock backlog."
                : (t.status === "pending" || isDispatched)
                ? "Stock Keeper accepted and staged cartons."
                : "Stock Keeper assigned. Bay staging in progress.",
        },
        destination: t.agreements?.destination ?? {
            title: "4. Dest.",
            role: "Store",
            party: `${t.destination.name} (${t.destination.detail})`,
            status: t.status === "pending" ? "rescheduled" : "pending",
            status_label: t.status === "pending" ? "Rescheduled" : "Pending Stock Keeper",
            detail: t.status === "pending"
                ? "Store Stock Keeper sent a reschedule request (+30 mins for shift swap)."
                : "Store Receiver standing by for arrival confirmation.",
        },
    };

    const partyButtons: { key: PartyKey; label: string; icon: React.ReactNode; agreed: boolean }[] = [
        { key: "creator",     label: "Creator", icon: <PersonIcon sx={{ fontSize: 14 }} />,        agreed: isDispatched },
        { key: "fleet",       label: "Fleet",   icon: <LocalShippingIcon sx={{ fontSize: 14 }} />, agreed: agreements.fleet.status === "accepted" },
        { key: "origin",      label: "Origin",  icon: <WarehouseIcon sx={{ fontSize: 14 }} />,     agreed: agreements.origin.status === "accepted" },
        { key: "destination", label: "Dest.",   icon: <StoreIcon sx={{ fontSize: 14 }} />,         agreed: agreements.destination.status === "accepted" },
    ];

    return (
        <Paper elevation={0} sx={{ p: 2, borderRadius: "16px", border: "1px solid", borderColor: t.status === "overdue" ? "error.light" : "divider", bgcolor: "background.paper" }}>
            {/* Top row */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: "10px", p: 1.25, mb: 1.5 }}>
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
                <Chip icon={<TimerIcon sx={{ fontSize: 13 }} />} label={t.cutoff_label} size="small"
                    color={t.status === "overdue" ? "error" : "warning"} variant="outlined" sx={{ fontWeight: 700, fontSize: 10 }} />
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
                {!isTransit && (
                    <Button
                        component={Link}
                        href={route("admin.inventory.replenish.show", t.id)}
                        variant="contained" size="small"
                        startIcon={<BuildIcon sx={{ fontSize: 15 }} />}
                        sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, fontSize: 12 }}
                    >
                        Build Manifest
                    </Button>
                )}
            </Stack>

            {/* Transit status vs 4-Party Agreement Gate */}
            {isTransit ? (
                <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5, mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 700, display: "block", mb: 1 }}>
                        Transit Status
                    </Typography>
                    <Stack spacing={1}>
                        {t.status === "en_route" && (
                            <>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                                    <Typography variant="caption" fontWeight={700}>Origin → Driver Done</Typography>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <SyncIcon color="secondary" sx={{ fontSize: 16 }} />
                                    <Typography variant="caption" fontWeight={700}>Driver → Destination Pending</Typography>
                                </Stack>
                            </>
                        )}
                        {t.status === "shipped" &&
                            [`Shipment Created (${creator})`, "Driver Accepted", "Origin Completed", "Destination Received"].map((label) => (
                                <Stack key={label} direction="row" alignItems="center" spacing={1}>
                                    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                                    <Typography variant="caption" fontWeight={700}>{label}</Typography>
                                </Stack>
                            ))}
                    </Stack>
                </Box>
            ) : (
                <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5, mt: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                                4-Party Agreement Gate
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Tap any party to view details</Typography>
                        </Box>
                        <Chip label="ALL 4 REQ" size="small" color="warning" variant="outlined" sx={{ fontWeight: 700, fontSize: 9 }} />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        {partyButtons.map((p) => (
                            <Box
                                key={p.key}
                                onClick={() => setActivePartyModal(p.key)}
                                sx={{
                                    flex: 1,
                                    textAlign: "center",
                                    p: 1,
                                    borderRadius: "12px",
                                    cursor: "pointer",
                                    border: "1px solid",
                                    borderColor: p.agreed ? "success.light" : "divider",
                                    bgcolor: p.agreed ? "success.light" : "action.hover",
                                    opacity: p.agreed ? 1 : 0.85,
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
                </Box>
            )}

            <PartyDetailDialog
                open={activePartyModal !== null}
                activeParty={activePartyModal ?? "creator"}
                onClose={() => setActivePartyModal(null)}
                onSelectParty={setActivePartyModal}
                reference={t.reference}
                scheduleOptions={t.schedule_options}
                agreements={agreements}
            />
        </Paper>
    );
}
