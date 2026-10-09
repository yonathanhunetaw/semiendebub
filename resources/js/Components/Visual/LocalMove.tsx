import React, { useEffect, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import RoleFigure from "./RoleFigure";
import Scene from "./scenes";
import { motionSafe, pop } from "./motion";

/**
 * A move inside one store (floor → shelf): no road and no courier, just a few
 * steps across the shop. The stock keeper stands by the floor stock while it
 * waits, walks it over, and the shelf gets a tick once it is placed.
 */

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export default function LocalMove({ status, quantity, unit = "pieces", store = "Store" }: {
    status: "pending" | "in_transit" | "completed" | string;
    quantity?: number;
    unit?: string;
    store?: string;
}) {
    const theme = useTheme();
    const walking = status === "in_transit";
    const done = status === "completed";

    // Going back to the start (a demo restarting) is a jump, never a walk backwards.
    const position = done ? 1 : walking ? 1 : 0;
    const previous = useRef(position);
    const [instant, setInstant] = useState(false);
    useEffect(() => {
        setInstant(position < previous.current);
        previous.current = position;
    }, [position]);

    return (
        <Box sx={{ ...motionSafe }}>
            <Box sx={{ position: "relative", borderRadius: 4, border: "2px solid", borderColor: alpha(theme.palette.primary.main, 0.35), bgcolor: alpha(theme.palette.primary.main, 0.04), px: { xs: 1.5, sm: 3 }, pt: 4, pb: 1.5, overflow: "hidden" }}>
                {/* The shop's sign: one building, so it reads as "inside". */}
                <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                    {store}
                </Box>
                <Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={{ position: "relative", minHeight: 130 }}>
                    <Stack alignItems="center" spacing={0.5} sx={{ width: 90, zIndex: 0 }}>
                        <Stack direction="row" spacing={-1}>
                            <Box sx={{ opacity: done || walking ? 0.35 : 1, transition: "opacity .6s" }}><Scene kind="parcel" size={34} /></Box>
                            <Scene kind="parcel" size={34} />
                        </Stack>
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>Store floor</Typography>
                    </Stack>

                    {/* A short walk: a third of the width, not a road trip. */}
                    <Box
                        sx={{
                            position: "absolute",
                            bottom: 18,
                            left: position === 0 ? "18%" : "58%",
                            transition: instant ? "none" : "left 2.2s ease-in-out",
                            animation: instant ? `${fadeIn} .4s ease-out` : "none",
                            zIndex: 1,
                        }}
                    >
                        <RoleFigure role="stock_keeper" action={walking ? "walk" : done ? "point" : "idle"} height={100} />
                    </Box>

                    <Stack alignItems="center" spacing={0.5} sx={{ width: 90, position: "relative", zIndex: 0 }}>
                        <Scene kind="shelf" size={64} />
                        {done && (
                            <Box sx={{ position: "absolute", top: -8, right: 6, width: 22, height: 22, borderRadius: "50%", bgcolor: "success.main", color: "success.contrastText", display: "grid", placeItems: "center", animation: `${pop} .4s ease-out both` }}>
                                <CheckRounded sx={{ fontSize: 15 }} />
                            </Box>
                        )}
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>Store shelf</Typography>
                    </Stack>
                </Stack>
            </Box>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                {quantity !== undefined && <Chip size="small" label={`${quantity.toLocaleString()} ${unit}`} sx={{ fontWeight: 700 }} />}
                <Chip size="small" color={done ? "success" : walking ? "info" : "warning"} label={done ? "On the shelf" : walking ? "Carrying it across" : "On the shelving list"} sx={{ fontWeight: 700 }} />
            </Stack>
        </Box>
    );
}
