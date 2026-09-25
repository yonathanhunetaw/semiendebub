import React, { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import StoreIcon from "@mui/icons-material/Store";
import { FACILITIES, UNITS } from "./AddShipmentDialog";
import type { Location, ScheduledTransfer } from "@/types/adminReplenish";

export interface EditRouteDialogProps {
    open: boolean;
    transfer: ScheduledTransfer;
    onClose: () => void;
    onSave: (origin: Location, destination: Location) => void;
}

export default function EditRouteDialog({ open, transfer, onClose, onSave }: EditRouteDialogProps) {
    const [originVal, setOriginVal] = useState(
        FACILITIES.find((f) => transfer.origin.name.startsWith(f.label.split("—")[0].trim()))?.value ?? FACILITIES[0].value
    );
    const [destVal, setDestVal] = useState(
        UNITS.find((u) => transfer.destination.name.startsWith(u.label.split("—")[0].trim()))?.value ?? UNITS[0].value
    );

    const handleSave = () => {
        const originOpt = FACILITIES.find((f) => f.value === originVal)!;
        const destOpt   = UNITS.find((u) => u.value === destVal)!;
        const [oName, oDetail] = originOpt.label.split(" — ");
        const [dName, dDetail] = destOpt.label.split(" — ");
        onSave({ name: oName.trim(), detail: oDetail?.trim() ?? "" }, { name: dName.trim(), detail: dDetail?.trim() ?? "" });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: "16px" } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Edit Route — {transfer.reference}</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={2.5} mt={0.5}>
                    <TextField
                        select label="Origin Facility" value={originVal}
                        onChange={(e) => setOriginVal(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <HomeWorkIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
                        {FACILITIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                    </TextField>
                    <TextField
                        select label="Target Unit" value={destVal}
                        onChange={(e) => setDestVal(e.target.value)} size="small" fullWidth
                        InputProps={{ startAdornment: <StoreIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} /> }}
                    >
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
