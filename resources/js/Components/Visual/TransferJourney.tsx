import React, { useEffect, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import RoleAvatar from "./RoleAvatar";
import Scene, { type SceneKind } from "./scenes";
import { arrive, bob, drive, motionSafe, pop, slideX } from "./motion";

/**
 * Goods moving between two places. The vehicle waits at the origin while the
 * transfer is pending, drives the road while it is in transit, and parks at
 * the destination with a tick once received. Within one store there is no
 * truck: a stock keeper carries the box across.
 */

export type TransferStatus = "pending" | "in_transit" | "completed" | "cancelled" | string;

/** A place's picture from its label ("Main Hub · Hub A", "Store Shelf · Main Store"). */
export function sceneForPlace(label: string | null | undefined): SceneKind {
    const text = (label ?? "").toLowerCase();
    if (text.includes("main hub") || text.includes("distribution")) return "hub";
    if (text.includes("hub") || text.includes("warehouse") || text.includes("depot")) return "warehouse";
    if (text.includes("shelf")) return "shelf";
    if (text.includes("delivery") || text.includes("transit")) return "truck";
    if (text.includes("home") || text.includes("customer")) return "home";
    return "store";
}

interface Props {
    from: string | null;
    to: string | null;
    status: TransferStatus;
    quantity?: number;
    unit?: string;
    /** A courier carries it (leaves its site); otherwise staff carry it across. */
    needsCourier?: boolean;
    courier?: string | null;
    size?: number;
}

const VEHICLE = 52;

export default function TransferJourney({ from, to, status, quantity, unit = "units", needsCourier = true, courier, size = 72 }: Props) {
    const theme = useTheme();
    const moving = status === "in_transit";
    const arrived = status === "completed";
    const cancelled = status === "cancelled";

    // Back to the start (a demo restarting) is a jump with a fade, never the
    // truck reversing down the road.
    const position = arrived ? 1 : 0;
    const previous = useRef(position);
    const [reset, setReset] = useState(false);
    useEffect(() => {
        setReset(position < previous.current);
        previous.current = position;
    }, [position]);

    const place = (label: string | null, side: "from" | "to") => {
        const lit = side === "from" ? !arrived : arrived;

        return (
            <Stack alignItems="center" spacing={0.75} sx={{ width: { xs: 84, sm: 120 }, flexShrink: 0, textAlign: "center" }}>
                <Box sx={{ position: "relative", p: 1, borderRadius: 3, bgcolor: lit ? alpha(theme.palette.primary.main, 0.08) : "transparent", transition: "background-color .6s" }}>
                    <Scene kind={sceneForPlace(label)} size={size} muted={cancelled && side === "to"} title={label ?? undefined} />
                    {side === "to" && arrived && (
                        <Box sx={{ position: "absolute", right: 0, top: 0, width: 24, height: 24, borderRadius: "50%", bgcolor: "success.main", color: "success.contrastText", display: "grid", placeItems: "center", animation: `${pop} .5s ease-out both` }}>
                            <CheckRounded sx={{ fontSize: 16 }} />
                        </Box>
                    )}
                </Box>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>{label ?? "—"}</Typography>
            </Stack>
        );
    };

    const carrier = needsCourier ? (
        <Box sx={{ position: "relative" }}>
            <Scene kind="truck" size={VEHICLE} muted={cancelled} title="Courier" />
        </Box>
    ) : (
        <Stack direction="row" alignItems="flex-end" spacing={-0.5}>
            <RoleAvatar role="stock_keeper" size={34} working={moving} muted={cancelled} />
            <Scene kind="parcel" size={26} muted={cancelled} />
        </Stack>
    );

    return (
        <Box sx={{ ...motionSafe }}>
            <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1.5 }}>
                {place(from, "from")}

                {/* The road */}
                <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: VEHICLE + 28, "--vehicle-size": `${VEHICLE}px` }}>
                    <Box
                        aria-hidden
                        sx={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: 14,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: alpha(theme.palette.text.primary, 0.08),
                            backgroundImage: `repeating-linear-gradient(90deg, ${alpha(theme.palette.text.primary, 0.35)} 0 10px, transparent 10px 24px)`,
                            backgroundSize: "24px 2px",
                            backgroundRepeat: "repeat-x",
                            backgroundPosition: "0 center",
                            animation: moving ? `${slideX} .6s linear infinite` : "none",
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            bottom: 18,
                            left: arrived ? `calc(100% - ${VEHICLE}px)` : 0,
                            transition: reset ? "none" : "left 1.2s cubic-bezier(.65,0,.35,1)",
                            // Driving loops forward only: across, fade out, start again.
                            animation: moving ? `${drive} 3.6s ease-in-out infinite` : reset ? `${arrive} .5s ease-out` : "none",
                            opacity: cancelled ? 0.5 : 1,
                        }}
                    >
                        <Box sx={{ animation: moving ? `${bob} .5s ease-in-out infinite` : "none" }}>{carrier}</Box>
                    </Box>
                    {cancelled && (
                        <Box sx={{ position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", width: 28, height: 28, borderRadius: "50%", bgcolor: "error.main", color: "error.contrastText", display: "grid", placeItems: "center" }}>
                            <CloseRounded sx={{ fontSize: 18 }} />
                        </Box>
                    )}
                </Box>

                {place(to, "to")}
            </Stack>

            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                {quantity !== undefined && <Chip size="small" icon={<Box component="span" sx={{ display: "inline-flex", pl: 0.5 }}><Scene kind="parcel" size={16} /></Box>} label={`${quantity.toLocaleString()} ${unit}`} sx={{ fontWeight: 700 }} />}
                <Chip
                    size="small"
                    color={cancelled ? "error" : arrived ? "success" : moving ? "info" : "warning"}
                    label={cancelled ? "Cancelled" : arrived ? "Received" : moving ? (needsCourier ? `On the road${courier ? ` with ${courier}` : ""}` : "Being carried across") : needsCourier ? (courier ? `Waiting for ${courier}` : "Waiting for a courier") : "Waiting to be carried"}
                    sx={{ fontWeight: 700 }}
                />
            </Stack>
        </Box>
    );
}
