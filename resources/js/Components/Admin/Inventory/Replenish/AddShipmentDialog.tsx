import React, { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import StoreIcon from "@mui/icons-material/Store";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import type { LocationOption, NewShipmentInput, NewShipmentTimeWindow } from "@/types/adminReplenish";

/* ----------------------------------------------------------
 | DEMO facility / unit options (replace with API data)
 |----------------------------------------------------------*/
export const FACILITIES: LocationOption[] = [
    { value: "central-hub", label: "Central Hub — Kality Logistics Center" },
    { value: "piazza-hub",  label: "Piazza Hub — Piazza Terminal 01" },
    { value: "bole-hub",    label: "Bole Hub — Bole Logistics Center" },
];

export const UNITS: LocationOption[] = [
    { value: "main-store",   label: "Main Store — Merkato Terminal 01" },
    { value: "branch-store", label: "Branch Store — Piazza Terminal 02" },
    { value: "bole-store",   label: "Bole Store — Bole Terminal 03" },
];

export interface AddShipmentDialogProps {
    open: boolean;
    onClose: () => void;
    onAdd: (shipment: NewShipmentInput) => void;
}

export default function AddShipmentDialog({ open, onClose, onAdd }: AddShipmentDialogProps) {
    const [origin, setOrigin] = useState(FACILITIES[0].value);
    const [dest, setDest] = useState(UNITS[0].value);
    const [schedDate, setSchedDate] = useState("");
    const [schedTime, setSchedTime] = useState("08:00");
    const [altOptions, setAltOptions] = useState<NewShipmentTimeWindow[]>([]);

    const addOption = () => setAltOptions((prev) => [...prev, { date: schedDate, time: "17:00" }]);
    const removeOption = (idx: number) => setAltOptions((prev) => prev.filter((_, i) => i !== idx));
    const updateOption = (idx: number, field: "date" | "time", val: string) =>
        setAltOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: val } : o)));

    const handleAdd = () => {
        onAdd({ origin, destination: dest, scheduledDate: schedDate, scheduledTime: schedTime, alternateOptions: altOptions });
        setAltOptions([]);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <LocalShippingIcon color="primary" />
                    <span>New Shipment</span>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={2.5} mt={0.5}>
                    <TextField
                        select label="Origin Facility" value={origin}
                        onChange={(e) => setOrigin(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <HomeWorkIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {FACILITIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                    </TextField>
                    <TextField
                        select label="Target Unit" value={dest}
                        onChange={(e) => setDest(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <StoreIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                    </TextField>
                    <Stack direction="row" spacing={1.5}>
                        <TextField label="Scheduled Date" type="date" value={schedDate}
                            onChange={(e) => setSchedDate(e.target.value)} size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        <TextField label="Time" type="time" value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)} size="small" sx={{ width: 120 }} InputLabelProps={{ shrink: true }} />
                    </Stack>

                    {altOptions.length > 0 && (
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary" fontWeight={700}>Alternate Time Windows</Typography>
                            {altOptions.map((opt, idx) => (
                                <Stack key={idx} direction="row" spacing={1} alignItems="center">
                                    <TextField type="date" value={opt.date} onChange={(e) => updateOption(idx, "date", e.target.value)}
                                        size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                    <TextField type="time" value={opt.time} onChange={(e) => updateOption(idx, "time", e.target.value)}
                                        size="small" sx={{ width: 110 }} InputLabelProps={{ shrink: true }} />
                                    <IconButton size="small" color="error" onClick={() => removeOption(idx)}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                        </Stack>
                    )}
                    <Button size="small" startIcon={<AddIcon />} onClick={addOption}
                        sx={{ textTransform: "none", fontWeight: 700, alignSelf: "flex-start" }}>
                        Add Time Window
                    </Button>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: "10px", textTransform: "none" }}>Cancel</Button>
                <Button onClick={handleAdd} variant="contained" sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}>Add Shipment</Button>
            </DialogActions>
        </Dialog>
    );
}
