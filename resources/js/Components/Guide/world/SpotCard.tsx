import React from "react";
import { Box, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { SPOT_CAPACITY, describeSpot } from "./storeLayout";
import type { ShelfBin } from "./shelfSpots";

/**
 * One physical spot of the Main Store's racking ("f6"): where it is, and what
 * the seller's shelf has on it: up to four bins (f6a to f6d), each with its
 * stock, refill line and low line. The world lays the bins out in the shelf's
 * own order (shelfSpots.ts), as which bin is on which physical spot is not recorded.
 */
export default function SpotCard({ code, bins = [], onClose }: { code: string; bins?: ShelfBin[]; onClose: () => void }) {
    const theme = useTheme();
    const spot = describeSpot(code);

    return (
        <Paper elevation={6} sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 2, borderRadius: 4, borderTop: "4px solid", borderTopColor: "divider", bgcolor: alpha(theme.palette.background.paper, 0.97) }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{spot ? spot.run.label : "Racking"}</Typography>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.3rem", lineHeight: 1.2 }}>Spot {code}</Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRounded fontSize="small" /></IconButton>
            </Stack>

            {spot && (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    <Chip size="small" variant="outlined" label={`Column ${spot.column}`} />
                    <Chip size="small" variant="outlined" label={`Row ${spot.row} from the top`} />
                    {spot.run.suspended && <Chip size="small" variant="outlined" label="Hangs from the ceiling" />}
                </Stack>
            )}

            {bins.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Nothing from the seller's shelf is on this spot. A spot carries up to {SPOT_CAPACITY} bins: {code}a, {code}b and so on.
                </Typography>
            ) : (
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {bins.map((bin, i) => (
                        <Box key={bin.item_id} sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography sx={{ fontWeight: 900, flex: 1, minWidth: 0 }} noWrap>{code}{"abcd"[i]} · {bin.name}</Typography>
                                <Chip size="small" label={bin.status === "ok" ? "OK" : bin.status === "refill" ? "Refill" : bin.status === "critical" ? "Low" : "Empty"}
                                    color={bin.status === "ok" ? "success" : bin.status === "refill" ? "warning" : bin.status === "critical" ? "error" : "default"} sx={{ fontWeight: 800 }} />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                {bin.display || "None on the shelf"}
                                {bin.band ? ` · refill at ${bin.band.refill}, low at ${bin.band.critical}, up to ${bin.band.max} ${bin.band.unit}` : " · no refill line set"}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
