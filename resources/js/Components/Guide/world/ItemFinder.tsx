import { Autocomplete, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DirectionsWalkRounded from "@mui/icons-material/DirectionsWalkRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { packLines, type CatalogueItem, type StockPlace } from "./catalogue";

/**
 * The item finder: while a hub (or the shop's floor) is open, pick an item from what it holds and the world marks
 * its boxes: a pulsing ring, a frame and a beam on each stack, with the cell's name over it. The options are the
 * hub's real stock (catalogue.ts), so an item that is not there is not offered.
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

    return (
        <Paper
            elevation={4}
            data-testid="item-finder"
            sx={{ pointerEvents: "auto", p: 1, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, 0.94), width: "min(360px, calc(100vw - 16px))" }}
        >
            <Stack spacing={0.75}>
                <Autocomplete
                    size="small"
                    options={options}
                    value={picked}
                    onChange={(_, next) => onChange(next?.item.item_id ?? null)}
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
                            label={`Find an item in ${FIND_NAME[place]}`}
                            slotProps={{ input: { ...params.InputProps, startAdornment: <SearchRounded fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} />, }, htmlInput: { ...params.inputProps, "data-testid": "item-finder-input" } }}
                        />
                    )}
                />
                {picked && (
                    <Stack direction="row" spacing={1} alignItems="center" data-testid="item-finder-result">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: "0.85rem" }} noWrap>
                                {picked.cells.slice(0, 3).join(", ")}{picked.cells.length > 3 ? ` +${picked.cells.length - 3}` : ""} · {picked.boxes} × {boxName(picked.item)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                {packLines(picked.item.pack).slice(0, 3).join(" ") || "Marked in the world"}
                            </Typography>
                        </Box>
                        {onWalk && (
                            <Button size="small" variant="contained" startIcon={<DirectionsWalkRounded />} onClick={onWalk} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none", flexShrink: 0 }}>
                                Walk there
                            </Button>
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}
