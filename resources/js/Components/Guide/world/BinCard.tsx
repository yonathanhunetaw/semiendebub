import React from "react";
import { Box, Chip, IconButton, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { SHELF_TIERS } from "./places";

/** One Store Shelf bin, as App\Services\Guide\WorldShipmentFeed::shelf() sends it. */
export interface ShelfBin {
    item_id: number;
    name: string;
    display: string;
    fill: number;
    status: "empty" | "critical" | "refill" | "ok";
    assigned: boolean;
    band: { max: number; refill: number; critical: number; unit: string } | null;
}

const STATUS: Record<ShelfBin["status"], { label: string; color: "success" | "warning" | "error" | "default" }> = {
    ok: { label: "Stocked", color: "success" },
    refill: { label: "At the refill line", color: "warning" },
    critical: { label: "Critical", color: "error" },
    empty: { label: "Empty", color: "default" },
};

/** Bin index 0–199 → "Tier 2 · C4": 50 to a tier, A–E across, 1–10 down. */
export function binName(index: number): { tier: number; coord: string } {
    const j = index % 50;
    return { tier: Math.floor(index / 50) + 1, coord: `${"ABCDE"[j % 5]}${Math.floor(j / 5) + 1}` };
}

/** What is in one shelf bin right now, and how full it is against its lines. */
export default function BinCard({ index, bin, onClose }: { index: number; bin: ShelfBin | null; onClose: () => void }) {
    const theme = useTheme();
    const { tier, coord } = binName(index);
    const status = bin ? STATUS[bin.assigned ? bin.status : "empty"] : null;

    return (
        <Paper elevation={6} sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 2, borderRadius: 4, borderTop: "4px solid", borderTopColor: status ? `${status.color === "default" ? "grey" : status.color}.main` : "divider", bgcolor: alpha(theme.palette.background.paper, 0.97) }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{SHELF_TIERS[tier - 1]?.label ?? `Tier ${tier}`} · bin {coord}</Typography>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", lineHeight: 1.2 }}>{bin ? bin.name : "Free bin"}</Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRounded fontSize="small" /></IconButton>
            </Stack>

            {!bin && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No item has this bin yet. A shelf manager gives an item a bin by setting its max, refill and critical lines.
                </Typography>
            )}

            {bin && status && (
                <>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        <Chip size="small" color={status.color} label={status.label} sx={{ fontWeight: 800 }} />
                        <Chip size="small" variant="outlined" label={bin.display} />
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.round(bin.fill * 100)} color={status.color === "default" ? "inherit" : status.color}
                        sx={{ mt: 1.5, height: 8, borderRadius: 999 }} />
                    {bin.band ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Holds up to {bin.band.max} {bin.band.unit.toLowerCase()}s · refill at {bin.band.refill} · critical at {bin.band.critical}
                        </Typography>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>On the shelf without a bin of its own: it is never refilled.</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Shelf levels are as they stand now.</Typography>
                </>
            )}
        </Paper>
    );
}
