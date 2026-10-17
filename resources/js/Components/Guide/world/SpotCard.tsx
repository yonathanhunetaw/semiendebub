import React from "react";
import { Box, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { SPOT_CAPACITY, describeSpot } from "./storeLayout";

/**
 * One physical spot of the Main Store's racking ("f6"): where it is, and what
 * the seller's shelf has placed on it. Nothing is placed yet, so for now it
 * says so and what will happen: a spot carries up to four seller-shelf spots,
 * named f6a to f6d once they are placed.
 */
export default function SpotCard({ code, onClose }: { code: string; onClose: () => void }) {
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

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Nothing from the seller's shelf has been placed on this spot yet. Once it is, the spot shows as {code}a, {code}b and so on: up to {SPOT_CAPACITY} to a spot.
            </Typography>
        </Paper>
    );
}
