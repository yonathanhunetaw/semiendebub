import { Alert, Box, Checkbox, FormControlLabel, FormGroup, Typography } from "@mui/material";

export interface AdminAreaOption {
    key: string;
    label: string;
}

/**
 * What else a store admin may open, one tick per part of the global zone
 * (App\Services\Admin\AdminAreas). Only a global admin is sent the options;
 * other users, sessions and the system status are never on the list.
 */
export default function AdminAreaTicks({ options, value, onChange, error }: { options: AdminAreaOption[]; value: string[]; onChange: (next: string[]) => void; error?: string }) {
    if (options.length === 0) return null;

    const toggle = (key: string, on: boolean) => onChange(on ? [...value.filter((k) => k !== key), key] : value.filter((k) => k !== key));

    return (
        <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Also allowed for this store admin</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                A store admin runs their own store. Tick the parts of the global zone they may also see and use.
            </Typography>
            <FormGroup>
                {options.map((option) => (
                    <FormControlLabel key={option.key} control={<Checkbox checked={value.includes(option.key)} onChange={(e) => toggle(option.key, e.target.checked)} />} label={option.label} />
                ))}
            </FormGroup>
            <Alert severity="info" sx={{ mt: 1 }}>Other users, sessions and the system status stay with global admins.</Alert>
            {error && <Typography color="error" variant="caption">{error}</Typography>}
        </Box>
    );
}
