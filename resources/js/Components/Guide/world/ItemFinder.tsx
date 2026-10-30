import { useState } from "react";
import { Autocomplete, Box, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { alpha, useTheme } from "@mui/material/styles";
import DirectionsWalkRounded from "@mui/icons-material/DirectionsWalkRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { type CatalogueItem, type StockPlace } from "./catalogue";

/**
 * The item finder: while a hub (or the shop's floor) is open, pick an item from what it holds and the world marks
 * its boxes: a pulsing ring, a frame and a beam on each stack, with the cell's name over it. The options are the
 * hub's real stock (catalogue.ts), so an item that is not there is not offered.
 *
 * It keeps out of the way: a small round search button at the top right until tapped; once an item is chosen it
 * folds back to a chip (name, cells, walk there, clear) beside the button.
 */

export interface FindOption {
    item: CatalogueItem;
    /** The cells its stacks stand on, in the order they are drawn ("A3", "B1" …). */
    cells: string[];
    /** The real number of boxes the place holds of it. */
    boxes: number;
}

export const FIND_PLACES: StockPlace[] = ["main_hub_a", "main_hub_b", "remote_hub", "store_floor"];

export const FIND_NAME: Record<StockPlace, string> = {
    main_hub_a: "Main Hub A",
    main_hub_b: "Main Hub B",
    remote_hub: "Remote Hub",
    store_floor: "the Store Floor",
};

/** Read by screen readers (and found in the text), not drawn. */
const visuallyHidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** What one box of an item is called ("Carton"), from its packaging; "box" when the item has none. */
function boxName(item: CatalogueItem): string {
    return item.pack?.[0]?.name ?? item.tier ?? "box";
}

export default function ItemFinder({
    place, options, value, onChange, onWalk,
}: {
    place: StockPlace;
    options: FindOption[];
    value: number | null;
    onChange: (itemId: number | null) => void;
    /** Play: walk the worker to the item's stack. Absent in Watch (the camera flies there instead). */
    onWalk?: () => void;
}) {
    const theme = useTheme();
    const picked = options.find((o) => o.item.item_id === value) ?? null;
    // Small by default (a round search button, like a game's corner button): the box opens only when asked,
    // and closes again once an item is chosen, leaving a chip with where it is.
    const [open, setOpen] = useState(false);
    const glass = alpha(theme.palette.background.paper, 0.94);
    const label = `Find an item in ${FIND_NAME[place]}`;

    if (!open) {
        return (
            <Stack direction="row" spacing={0.75} alignItems="center" data-testid="item-finder" sx={{ pointerEvents: "auto", alignSelf: "flex-end", maxWidth: "calc(100vw - 16px)" }}>
                {picked && (
                    <Paper elevation={4} data-testid="item-finder-result" sx={{ display: "flex", alignItems: "center", gap: 0.5, pl: 1.25, pr: 0.25, py: 0.25, borderRadius: 999, bgcolor: glass, minWidth: 0 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: "0.8rem", lineHeight: 1.2 }} noWrap>{picked.item.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", lineHeight: 1.2 }}>
                                {picked.cells.slice(0, 3).join(", ")}{picked.cells.length > 3 ? ` +${picked.cells.length - 3}` : ""} · {picked.boxes} × {boxName(picked.item)}
                            </Typography>
                        </Box>
                        {onWalk && (
                            <Tooltip title="Walk there">
                                <IconButton size="small" color="primary" onClick={onWalk} aria-label="Walk there"><DirectionsWalkRounded fontSize="small" /></IconButton>
                            </Tooltip>
                        )}
                        <IconButton size="small" onClick={() => onChange(null)} aria-label="Clear"><CloseRounded fontSize="small" /></IconButton>
                    </Paper>
                )}
                <Tooltip title={label}>
                    <IconButton onClick={() => setOpen(true)} aria-label={label} data-testid="item-finder-open"
                        sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: glass, boxShadow: 4, "&:hover": { bgcolor: theme.palette.background.paper } }}>
                        <SearchRounded />
                        {/* The place's name, for screen readers (and kept in the text, so it can be found). */}
                        <Box component="span" sx={visuallyHidden}>{label}</Box>
                    </IconButton>
                </Tooltip>
            </Stack>
        );
    }

    return (
        <Paper
            elevation={4}
            data-testid="item-finder"
            sx={{ pointerEvents: "auto", alignSelf: "flex-end", p: 0.75, borderRadius: 3, bgcolor: glass, width: "min(340px, calc(100vw - 16px))", display: "flex", alignItems: "center", gap: 0.5 }}
        >
            <Autocomplete
                size="small"
                sx={{ flex: 1, minWidth: 0 }}
                options={options}
                value={picked}
                onChange={(_, next) => {
                    onChange(next?.item.item_id ?? null);
                    if (next) setOpen(false);
                }}
                getOptionLabel={(o) => o.item.name}
                isOptionEqualToValue={(a, b) => a.item.item_id === b.item.item_id}
                noOptionsText={`Nothing in ${FIND_NAME[place]} yet`}
                openOnFocus
                renderOption={(props, o) => {
                    const { key, ...rest } = props as typeof props & { key: string };
                    return (
                        <Box component="li" key={key} {...rest} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start !important", py: 0.5 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{o.item.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {o.boxes} × {boxName(o.item)} · {o.cells.slice(0, 4).join(", ")}{o.cells.length > 4 ? ` +${o.cells.length - 4}` : ""}
                            </Typography>
                        </Box>
                    );
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        autoFocus
                        placeholder={label}
                        slotProps={{ input: { ...params.InputProps, startAdornment: <SearchRounded fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} />, }, htmlInput: { ...params.inputProps, "data-testid": "item-finder-input", "aria-label": label } }}
                    />
                )}
            />
            <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close the item search"><CloseRounded fontSize="small" /></IconButton>
        </Paper>
    );
}
