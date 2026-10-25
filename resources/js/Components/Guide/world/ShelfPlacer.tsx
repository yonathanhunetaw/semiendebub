import { Alert, Autocomplete, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import TouchAppRounded from "@mui/icons-material/TouchAppRounded";
import { slotOfItem, type ShelfBin } from "./shelfSpots";

/**
 * Put each item on the shelf: in the racks view, pick an item, then tap a slot on the racks (f6c: column f, row 6,
 * the third of the spot's four slots) and its bin stands there. A slot holds one item, so a taken slot swaps with
 * the item that was on it. Only whoever may change the planogram sees this (the server says so: `shelf_edit`).
 * Items with no bin on the shelf are not offered: give them their limits first (the item page).
 */
export default function ShelfPlacer({
    bins, placed, value, onChange, onLift, note, onNote,
}: {
    bins: ShelfBin[];
    placed: Map<string, ShelfBin[]>;
    value: number | null;
    onChange: (itemId: number | null) => void;
    /** Lift the chosen item's bin off its slot. */
    onLift: () => void;
    note: { tone: "success" | "error"; text: string } | null;
    onNote: () => void;
}) {
    const theme = useTheme();
    const options = bins.filter((b) => b.assigned && b.band !== null).sort((a, b) => a.name.localeCompare(b.name));
    const picked = options.find((b) => b.item_id === value) ?? null;
    const where = picked ? slotOfItem(placed, picked.item_id) : null;

    return (
        <Paper
            elevation={4}
            data-testid="shelf-placer"
            sx={{ pointerEvents: "auto", p: 1, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, 0.94), width: "min(340px, calc(100vw - 16px))" }}
        >
            <Stack spacing={0.75}>
                <Autocomplete
                    size="small"
                    options={options}
                    value={picked}
                    onChange={(_, next) => onChange(next?.item_id ?? null)}
                    getOptionLabel={(b) => b.name}
                    isOptionEqualToValue={(a, b) => a.item_id === b.item_id}
                    noOptionsText="No item has a bin on this shelf yet"
                    openOnFocus
                    renderOption={(props, b) => {
                        const { key, ...rest } = props as typeof props & { key: string };
                        const slot = slotOfItem(placed, b.item_id);
                        return (
                            <Box component="li" key={key} {...rest} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start !important", py: 0.5 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{b.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{slot ? `on ${slot}${b.spot ? "" : " (in the shelf's order)"}` : "not on the racks"}</Typography>
                            </Box>
                        );
                    }}
                    renderInput={(params) => (
                        <TextField {...params} label="Put an item on the shelf" slotProps={{ htmlInput: { ...params.inputProps, "data-testid": "shelf-placer-input" } }} />
                    )}
                />
                {picked && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TouchAppRounded fontSize="small" color="primary" />
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 700 }} data-testid="shelf-placer-hint">
                            Tap a slot on the racks{where ? ` · now on ${where}` : ""}
                        </Typography>
                        {picked.spot && (
                            <Button size="small" onClick={onLift} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none", flexShrink: 0 }}>
                                Lift off
                            </Button>
                        )}
                    </Stack>
                )}
                {note && (
                    <Alert severity={note.tone} onClose={onNote} sx={{ py: 0 }} data-testid="shelf-placer-note">
                        {note.text}
                    </Alert>
                )}
            </Stack>
        </Paper>
    );
}
