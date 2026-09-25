import React, { useState } from "react";
import { Box, Button, Chip, Dialog, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import StoreIcon from "@mui/icons-material/Store";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { PartyAgreementInfo, PartyAgreementsMap, PartyKey } from "@/types/adminReplenish";

export interface PartyDetailDialogProps {
    open: boolean;
    activeParty: PartyKey;
    onClose: () => void;
    onSelectParty: (p: PartyKey) => void;
    reference?: string;
    scheduleOptions?: string[];
    selectedSchedule?: string;
    onSelectSchedule?: (slot: string) => void;
    agreements: PartyAgreementsMap;
}

const DEFAULT_SCHEDULE_OPTIONS = [
    "10/25/2024, 08:30 AM",
    "10/25/2024, 05:00 PM",
    "10/26/2024, 08:30 AM",
    "10/26/2024, 05:00 PM",
];

const PARTY_META: Record<PartyKey, { label: string; icon: React.ReactNode }> = {
    creator:     { label: "1. Creator", icon: <PersonIcon sx={{ fontSize: 15 }} /> },
    fleet:       { label: "2. Fleet",   icon: <LocalShippingIcon sx={{ fontSize: 15 }} /> },
    origin:      { label: "3. Origin",  icon: <WarehouseIcon sx={{ fontSize: 15 }} /> },
    destination: { label: "4. Dest.",   icon: <StoreIcon sx={{ fontSize: 15 }} /> },
};

function isAgreed(status: PartyAgreementInfo["status"], key: PartyKey) {
    return key === "creator" ? status === "created" : status === "accepted";
}

function statusTheme(status: PartyAgreementInfo["status"], key: PartyKey) {
    if (key === "creator") {
        return status === "created"
            ? { color: "success" as const, bg: "success.light", headline: "Manifest Reviewed & Dispatched (Created)" }
            : { color: "warning" as const, bg: "warning.light", headline: "Awaiting Review & Dispatch Sign-Off" };
    }
    if (status === "accepted") return { color: "success" as const, bg: "success.light", headline: "Party Agreement Confirmed" };
    if (status === "rescheduled") return { color: "warning" as const, bg: "warning.light", headline: "Reschedule Notice Proposed" };
    return { color: "default" as const, bg: "action.hover", headline: "Pending Stock Keeper / Party Acknowledgment" };
}

export default function PartyDetailDialog({
    open,
    activeParty,
    onClose,
    onSelectParty,
    reference,
    scheduleOptions = DEFAULT_SCHEDULE_OPTIONS,
    selectedSchedule: initialSchedule,
    onSelectSchedule,
    agreements,
}: PartyDetailDialogProps) {
    const [selectedSlot, setSelectedSlot] = useState(initialSchedule || scheduleOptions[0]);

    const current = agreements[activeParty] ?? agreements.creator;
    const theme = statusTheme(current.status, activeParty);

    const handleSlotClick = (slot: string) => {
        setSelectedSlot(slot);
        onSelectSchedule?.(slot);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "20px" } }}>
            <Box sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                        <Typography variant="subtitle1" fontWeight={800}>4-Party Agreement Gate</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {reference ? `Run Ref: ${reference}` : "Mutual Clearance Verification"}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>

                {/* Party switcher */}
                <Stack direction="row" spacing={0.75} sx={{ p: 0.5, bgcolor: "action.hover", borderRadius: "14px", mb: 2 }}>
                    {(Object.keys(PARTY_META) as PartyKey[]).map((key) => {
                        const info = agreements[key];
                        const active = activeParty === key;
                        const agreed = isAgreed(info.status, key);
                        return (
                            <Box
                                key={key}
                                onClick={() => onSelectParty(key)}
                                sx={{
                                    flex: 1,
                                    textAlign: "center",
                                    py: 1,
                                    borderRadius: "10px",
                                    cursor: "pointer",
                                    bgcolor: active ? "background.paper" : "transparent",
                                    boxShadow: active ? 1 : 0,
                                }}
                            >
                                <Stack alignItems="center" spacing={0.25}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        {PARTY_META[key].icon}
                                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: agreed ? "success.main" : info.status === "rescheduled" ? "warning.main" : "grey.400" }} />
                                    </Stack>
                                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: 10 }}>{PARTY_META[key].label}</Typography>
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>

                {/* Status banner */}
                <Box sx={{ p: 1.75, borderRadius: "14px", bgcolor: theme.bg, mb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="subtitle2" fontWeight={700}>{current.title} ({current.role})</Typography>
                        <Chip size="small" label={current.status_label} color={theme.color} sx={{ fontWeight: 700 }} />
                    </Stack>
                    <Typography variant="caption" fontWeight={600} display="block">{theme.headline}</Typography>
                    <Typography variant="caption" color="text.secondary">{current.detail}</Typography>
                </Box>

                {/* Assigned entity + stock keepers */}
                <Box sx={{ p: 1.75, borderRadius: "14px", bgcolor: "action.hover", mb: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" mb={current.stock_keepers?.length ? 1 : 0}>
                        <Typography variant="caption" color="text.secondary">Assigned Entity</Typography>
                        <Typography variant="caption" fontWeight={700}>{current.party}</Typography>
                    </Stack>
                    {current.stock_keepers?.map((sk, i) => (
                        <Box
                            key={sk.keeper + i}
                            sx={{ p: 1.25, bgcolor: "background.paper", borderRadius: "10px", mb: i < current.stock_keepers!.length - 1 ? 1 : 0 }}
                        >
                            <Stack direction="row" justifyContent="space-between" mb={0.25}>
                                <Typography variant="caption" fontWeight={700}>{sk.name}</Typography>
                                <Chip
                                    size="small"
                                    label={sk.status_label}
                                    color={sk.status === "accepted" ? "success" : sk.status === "rescheduled" ? "warning" : "default"}
                                    sx={{ fontWeight: 700, fontSize: 10 }}
                                />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block">Stock Keeper: {sk.keeper} • {sk.location}</Typography>
                            <Typography variant="caption" color="text.secondary">{sk.detail}</Typography>
                        </Box>
                    ))}
                </Box>

                {/* Scheduled time gap consensus */}
                <Box sx={{ p: 1.75, borderRadius: "14px", bgcolor: "action.hover", mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} mb={1}>
                        <ScheduleIcon color="primary" sx={{ fontSize: 16 }} />
                        <Typography variant="caption" fontWeight={700}>Scheduled Time Gap & Consensus</Typography>
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                        {scheduleOptions.map((opt) => (
                            <Chip
                                key={opt}
                                label={opt}
                                size="small"
                                onClick={() => handleSlotClick(opt)}
                                color={selectedSlot === opt ? "primary" : "default"}
                                variant={selectedSlot === opt ? "filled" : "outlined"}
                                sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 10 }}
                            />
                        ))}
                    </Stack>
                </Box>

                <Button fullWidth variant="contained" onClick={onClose} sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700 }}>
                    Close Window
                </Button>
            </Box>
        </Dialog>
    );
}
