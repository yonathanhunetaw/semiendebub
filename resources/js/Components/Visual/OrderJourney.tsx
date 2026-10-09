import React, { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import RoleAvatar from "./RoleAvatar";
import Scene, { type SceneKind } from "./scenes";
import { bob, motionSafe, pop, pulse, slideX, slideY } from "./motion";
import type { IdentityKey } from "./identities";

/**
 * An order's road, from the shop floor to the customer's door.
 *
 * Two modes:
 *   - journey: one order. `current` is where it is; a parcel rides the track
 *     to that stop on mount, stops behind it turn green, and whoever does
 *     the current step bobs above it.
 *   - pipeline: every order. `counts` puts a number on each stop; stops with
 *     orders waiting carry a bobbing parcel, and each stop can link to its list.
 *
 * Horizontal from md, vertical on a phone.
 */

export type JourneyStage = "store" | "cart" | "to_pay" | "paid" | "packing" | "to_deliver" | "delivered";

interface StageDef {
    key: JourneyStage;
    label: string;
    scene: SceneKind;
    actors: IdentityKey[];
    hint: string;
}

export const JOURNEY: StageDef[] = [
    { key: "store", label: "Store", scene: "store", actors: ["customer", "seller"], hint: "The customer picks goods with a seller" },
    { key: "cart", label: "Cart", scene: "cart", actors: ["seller"], hint: "The seller builds the cart and checks out" },
    { key: "to_pay", label: "To pay", scene: "pay", actors: ["customer"], hint: "The customer pays: cash, bank, wallet or credit" },
    { key: "paid", label: "Paid", scene: "paid", actors: ["seller"], hint: "The account's owner confirms the money arrived" },
    { key: "packing", label: "Packing", scene: "parcel", actors: ["stock_keeper"], hint: "A stock keeper picks the lines and packs them" },
    { key: "to_deliver", label: "On the way", scene: "truck", actors: ["delivery"], hint: "A courier carries it to the customer" },
    { key: "delivered", label: "Delivered", scene: "home", actors: ["customer"], hint: "The customer has it" },
];

/** A sale's fulfillment stage (or a board stage) as a stop on the road. */
export function journeyStageFor(stage: string | null | undefined): JourneyStage {
    switch (stage) {
        case "awaiting_payment":
        case "to_pay":
            return "to_pay";
        case "pick_pack":
        case "paid":
            return "paid";
        case "packing":
            return "packing";
        case "to_deliver":
            return "to_deliver";
        case "delivered":
            return "delivered";
        default:
            return "cart";
    }
}

interface Props {
    current?: JourneyStage;
    cancelled?: boolean;
    counts?: Partial<Record<JourneyStage, number>>;
    hrefs?: Partial<Record<JourneyStage, string>>;
    /** Hide the hints under each stop. */
    compact?: boolean;
}

const NODE = 64;

export default function OrderJourney({ current, cancelled = false, counts, hrefs, compact = false }: Props) {
    const theme = useTheme();
    const pipeline = counts !== undefined;
    const target = current ? JOURNEY.findIndex((stage) => stage.key === current) : -1;

    // Start at the first stop and travel to the real one after mounting, so
    // the parcel visibly moves along the road.
    const [reached, setReached] = useState(pipeline ? JOURNEY.length - 1 : 0);
    useEffect(() => {
        if (pipeline) return;
        const timer = window.setTimeout(() => setReached(Math.max(0, target)), 120);
        return () => window.clearTimeout(timer);
    }, [target, pipeline]);

    const n = JOURNEY.length;
    const progress = pipeline ? 100 : (reached / (n - 1)) * 100;
    const success = theme.palette.success.main;
    const primary = theme.palette.primary.main;
    const muted = theme.palette.divider;

    // The track runs through the centres of the first and last stop.
    const inset = `calc(100% / ${n} / 2)`;

    return (
        <Box sx={{ position: "relative", ...motionSafe }}>
            {/* ── Track ── */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    zIndex: 0,
                    // Vertical on a phone: down the stops' centre column.
                    left: { xs: NODE / 2 - 2, md: inset },
                    right: { xs: "auto", md: inset },
                    top: { xs: NODE / 2, md: (compact ? 0 : 44) + NODE / 2 - 2 },
                    bottom: { xs: NODE / 2, md: "auto" },
                    width: { xs: 4, md: "auto" },
                    height: { xs: "auto", md: 4 },
                    borderRadius: 2,
                    // Marching dashes: the road ahead.
                    backgroundImage: `repeating-linear-gradient(var(--track-angle), ${muted} 0 8px, transparent 8px 14px)`,
                    "--track-angle": { xs: "180deg", md: "90deg" },
                    backgroundSize: { xs: "4px 24px", md: "24px 4px" },
                    animation: { xs: `${slideY} 1.2s linear infinite`, md: `${slideX} 1.2s linear infinite` },
                }}
            />
            {/* ── Progress: the road travelled ── */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    zIndex: 0,
                    left: { xs: NODE / 2 - 2, md: inset },
                    top: { xs: NODE / 2, md: (compact ? 0 : 44) + NODE / 2 - 2 },
                    width: { xs: 4, md: `calc((100% - 100% / ${n}) * ${progress / 100})` },
                    height: { xs: `calc((100% - ${NODE}px) * ${progress / 100})`, md: 4 },
                    borderRadius: 2,
                    bgcolor: cancelled ? theme.palette.error.main : pipeline ? alpha(primary, 0.5) : success,
                    transition: "width 1.1s cubic-bezier(.65,0,.35,1), height 1.1s cubic-bezier(.65,0,.35,1)",
                }}
            />

            {/* ── Stops ── */}
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: `repeat(${n}, minmax(0, 1fr))` },
                    rowGap: { xs: 2.5, md: 0 },
                }}
            >
                {JOURNEY.map((stage, index) => {
                    const done = !pipeline && index < reached;
                    const here = !pipeline && index === reached && target >= 0;
                    const ahead = !pipeline && index > reached;
                    const count = counts?.[stage.key];
                    const href = hrefs?.[stage.key];
                    const ring = cancelled && here ? theme.palette.error.main : here ? primary : done ? success : pipeline ? alpha(primary, 0.35) : muted;

                    const node = (
                        <Box
                            sx={{
                                position: "relative",
                                width: NODE,
                                height: NODE,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: "background.paper",
                                border: "3px solid",
                                borderColor: ring,
                                transition: "border-color .5s, transform .5s",
                                transform: here ? "scale(1.12)" : "scale(1)",
                                "--pulse-color": alpha(ring, 0.45),
                                animation: here && !cancelled ? `${pulse} 1.8s ease-out infinite` : "none",
                                flexShrink: 0,
                            }}
                        >
                            <Scene kind={stage.scene} size={40} muted={ahead || (cancelled && !done)} title={stage.label} />
                            {done && (
                                <Box sx={{ position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: "50%", bgcolor: "success.main", color: "success.contrastText", display: "grid", placeItems: "center", animation: `${pop} .4s ease-out both`, animationDelay: `${index * 120}ms` }}>
                                    <CheckRounded sx={{ fontSize: 15 }} />
                                </Box>
                            )}
                            {pipeline && (count ?? 0) > 0 && (
                                <Box sx={{ position: "absolute", top: -12, right: -10, animation: `${bob} 1.8s ease-in-out infinite`, animationDelay: `${index * 150}ms` }}>
                                    <Scene kind="parcel" size={22} />
                                </Box>
                            )}
                        </Box>
                    );

                    return (
                        <Box
                            key={stage.key}
                            component={href ? Link : "div"}
                            href={href}
                            sx={{
                                display: "flex",
                                flexDirection: { xs: "row", md: "column" },
                                alignItems: "center",
                                gap: { xs: 1.5, md: 1 },
                                textAlign: { xs: "left", md: "center" },
                                textDecoration: "none",
                                color: "inherit",
                                borderRadius: 3,
                                px: { md: 0.5 },
                                ...(href ? { "&:hover .journey-label": { color: "primary.main" } } : {}),
                            }}
                        >
                            {/* Who works this stop: above it on wide screens. */}
                            {!compact && (
                                <Stack direction="row" spacing={-1} sx={{ height: 36, alignItems: "flex-end", justifyContent: "center", display: { xs: "none", md: "flex" }, order: { md: 0 } }}>
                                    {(pipeline || here ? stage.actors : []).map((actor) => (
                                        <RoleAvatar key={actor} role={actor} size={here ? 34 : 28} working={here && !cancelled} />
                                    ))}
                                </Stack>
                            )}
                            <Box sx={{ order: { md: 1 } }}>{node}</Box>
                            <Box sx={{ order: { md: 2 }, minWidth: 0, flex: { xs: 1, md: "none" } }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: "flex-start", md: "center" }}>
                                    <Typography className="journey-label" sx={{ fontWeight: here ? 800 : 700, fontSize: "0.875rem", color: here ? (cancelled ? "error.main" : "primary.main") : ahead ? "text.secondary" : "text.primary", transition: "color .3s" }}>
                                        {stage.label}
                                    </Typography>
                                    {count !== undefined && (
                                        <Chip size="small" label={count.toLocaleString()} color={count > 0 ? "primary" : "default"} variant={count > 0 ? "filled" : "outlined"} sx={{ height: 20, fontWeight: 800, fontSize: "0.7rem" }} />
                                    )}
                                </Stack>
                                {!compact && (
                                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1.35, mt: 0.25, maxWidth: { md: 140 }, mx: { md: "auto" } }}>
                                        {here && cancelled ? "Cancelled here" : stage.hint}
                                    </Typography>
                                )}
                            </Box>
                            {/* On a phone the people sit at the end of the row. */}
                            {!compact && (pipeline || here) && (
                                <Stack direction="row" spacing={-1} sx={{ display: { xs: "flex", md: "none" } }}>
                                    {stage.actors.map((actor) => (
                                        <RoleAvatar key={actor} role={actor} size={30} working={here && !cancelled} />
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
