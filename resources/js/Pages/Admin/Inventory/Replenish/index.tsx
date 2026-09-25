import React, { useState } from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import RouteIcon from "@mui/icons-material/Route";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import InboxIcon from "@mui/icons-material/Inbox";

import AddShipmentDialog, { FACILITIES, UNITS } from "@/Components/Admin/Inventory/Replenish/AddShipmentDialog";
import EditRouteDialog from "@/Components/Admin/Inventory/Replenish/EditRouteDialog";
import TransferCard from "@/Components/Admin/Inventory/Replenish/TransferCard";
import type { Location, NewShipmentInput, ReplenishTransferStatus, ScheduledTransfer } from "@/types/adminReplenish";

interface Props {
    scheduled_transfers?: ScheduledTransfer[];
}

const STATUS_CARDS: { id: ReplenishTransferStatus; label: string; icon: React.ReactNode; color: string }[] = [
    { id: "scheduled", label: "Scheduled",        icon: <CheckCircleIcon />,  color: "success.main" },
    { id: "pending",   label: "Pending Manifest", icon: <WarningAmberIcon />, color: "warning.main" },
    { id: "en_route",  label: "En Route",         icon: <RouteIcon />,        color: "secondary.main" },
    { id: "shipped",   label: "Shipped",          icon: <TaskAltIcon />,      color: "primary.main" },
    { id: "overdue",   label: "Overdue",          icon: <ErrorIcon />,        color: "error.main" },
];

const FILTERS: { id: "all" | ReplenishTransferStatus; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "scheduled", label: "Scheduled" },
    { id: "pending",   label: "Pending Manifest" },
    { id: "en_route",  label: "En Route" },
    { id: "shipped",   label: "Shipped" },
    { id: "overdue",   label: "Overdue" },
];

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ScheduledTransfer | null>(null);
    const [filter, setFilter] = useState<"all" | ReplenishTransferStatus>("all");
    const [transfers, setTransfers] = useState<ScheduledTransfer[]>(scheduled_transfers);

    const handleSaveRoute = (origin: Location, destination: Location) => {
        if (!editTarget) return;
        setTransfers((prev) => prev.map((t) => (t.id === editTarget.id ? { ...t, origin, destination } : t)));
        setEditTarget(null);
    };

    const addShipment = (input: NewShipmentInput) => {
        const originOption = FACILITIES.find((f) => f.value === input.origin) ?? FACILITIES[0];
        const destinationOption = UNITS.find((u) => u.value === input.destination) ?? UNITS[0];
        const [originName, originDetail = ""] = originOption.label.split(" — ");
        const [destinationName, destinationDetail = ""] = destinationOption.label.split(" — ");
        const shipmentId = Date.now();
        const scheduledRun = `${input.scheduledDate} • ${input.scheduledTime}`;

        const newShipment: ScheduledTransfer = {
            id: shipmentId,
            reference: `RPL-${String(shipmentId).slice(-6)}`,
            status: "pending",
            origin: { name: originName, detail: originDetail },
            destination: { name: destinationName, detail: destinationDetail },
            distance_km: 0,
            scheduled_run: scheduledRun,
            cutoff_label: "NEW",
            sku_count: 0,
            total_cartons: 0,
            vehicle_name: "To be assigned",
            vehicle_plate: "TBD",
            slot: "TBD",
            created_by: "Admin",
            created_at: new Date().toISOString(),
            schedule_options: [
                `${input.scheduledDate}, ${input.scheduledTime}`,
                ...input.alternateOptions.map((o) => `${o.date}, ${o.time}`),
            ],
        };

        setTransfers((prev) => [newShipment, ...prev]);
    };

    const displayedTransfers = filter === "all" ? transfers : transfers.filter((t) => t.status === filter);

    return (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
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
                <Button variant="contained" size="small" startIcon={<AddIcon />}
                    onClick={() => setAddOpen(true)}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>
                    Add Shipment
                </Button>
            </Stack>

            {/* ── Summary cards (one per status) ── */}
            <Grid container spacing={1.5} mb={2.5}>
                {STATUS_CARDS.map((card) => (
                    <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={card.id}>
                        <Paper elevation={0} sx={{ p: 1.75, borderRadius: "14px", border: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1.25 }}>
                            <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", color: card.color, flexShrink: 0 }}>
                                {card.icon}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={800} lineHeight={1}>
                                    {transfers.filter((t) => t.status === card.id).length}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10, display: "block" }}>{card.label}</Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* ── Status filter chips ── */}
            <Stack direction="row" spacing={1} mb={2.5} flexWrap="wrap" useFlexGap>
                {FILTERS.map((f) => {
                    const count = f.id === "all" ? transfers.length : transfers.filter((t) => t.status === f.id).length;
                    const active = filter === f.id;
                    return (
                        <Chip
                            key={f.id}
                            label={`${f.label} (${count})`}
                            size="small"
                            onClick={() => setFilter(f.id)}
                            variant={active ? "filled" : "outlined"}
                            color={active ? "primary" : "default"}
                            sx={{ fontWeight: active ? 700 : 500, cursor: "pointer" }}
                        />
                    );
                })}
            </Stack>

            {/* ── Transfer list ── */}
            <Stack spacing={1.5}>
                {displayedTransfers.map((t) => (
                    <TransferCard key={t.id} t={t} onEditRoute={setEditTarget} />
                ))}
                {displayedTransfers.length === 0 && (
                    <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: "16px", border: "1px solid", borderColor: "divider" }}>
                        <InboxIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
                        <Typography color="text.secondary" fontWeight={700}>No shipments found</Typography>
                        <Typography variant="caption" color="text.disabled">Change the filter or create a new shipment.</Typography>
                    </Paper>
                )}
            </Stack>

            {/* ── Dialogs ── */}
            <AddShipmentDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={addShipment} />
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

ReplenishIndex.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
