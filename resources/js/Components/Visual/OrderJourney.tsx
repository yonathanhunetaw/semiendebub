import React, { useEffect, useRef, useState } from "react";
import { Link } from "@inertiajs/react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import RoleAvatar from "./RoleAvatar";
import Scene, { type SceneKind } from "./scenes";
import { bob, motionSafe, pop, pulse, slideX } from "./motion";
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
 * Always one horizontal road: on a narrow screen it scrolls sideways
 * (smoothly, snapping to stops) and brings the current stop into view.
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

    // The track runs from the centre of the first stop to the centre of the
    // last (Delivered), so it ends under that node instead of running past it.
    const inset = `calc(100% / ${n} / 2)`;
    const trackTop = (compact ? 0 : 44) + NODE / 2 - 2;

    // Keep the current stop in view on a narrow screen: the road scrolls
    // sideways (smoothly) rather than folding into a tall column.
    const scroller = useRef<HTMLDivElement | null>(null);
    const stopRefs = useRef<Array<HTMLElement | null>>([]);
    useEffect(() => {
        const box = scroller.current;
        const stop = stopRefs.current[Math.max(0, reached)];
        if (!box || !stop || pipeline || box.scrollWidth <= box.clientWidth) return;
        box.scrollTo({ left: stop.offsetLeft - box.clientWidth / 2 + stop.clientWidth / 2, behavior: "smooth" });
    }, [reached, pipeline]);

    return (
        <Box
            ref={scroller}
            sx={{
                overflowX: "auto",
                overscrollBehaviorX: "contain",
                scrollBehavior: "smooth",
                scrollSnapType: "x proximity",
                WebkitOverflowScrolling: "touch",
                pb: 1,
                mx: { xs: -1, sm: 0 },
                px: { xs: 1, sm: 0 },
                "&::-webkit-scrollbar": { height: 6 },
                "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 3 },
                ...motionSafe,
            }}
        >
        <Box sx={{ position: "relative", minWidth: n * (compact ? 88 : 116) }}>
            {/* ── Track ── */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    zIndex: 0,
                    left: inset,
                    right: inset,
                    top: trackTop,
                    height: 4,
                    borderRadius: 2,
                    // Marching dashes: the road ahead.
                    backgroundImage: `repeating-linear-gradient(90deg, ${muted} 0 8px, transparent 8px 14px)`,
                    backgroundSize: "24px 4px",
                    animation: `${slideX} 1.2s linear infinite`,
                }}
            />
            {/* ── Progress: the road travelled, never past the last stop ── */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    zIndex: 0,
                    left: inset,
                    top: trackTop,
                    width: `calc((100% - 100% / ${n}) * ${progress / 100})`,
                    maxWidth: `calc(100% - 100% / ${n})`,
                    height: 4,
                    borderRadius: 2,
                    bgcolor: cancelled ? theme.palette.error.main : pipeline ? alpha(primary, 0.5) : success,
                    transition: "width 1.1s cubic-bezier(.65,0,.35,1)",
                }}
            />

            {/* ── Stops ── */}
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    display: "grid",
                    gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
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
                            ref={(element: HTMLElement | null) => {
                                stopRefs.current[index] = element;
                            }}
                            component={href ? Link : "div"}
                            href={href}
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 1,
                                textAlign: "center",
                                textDecoration: "none",
                                color: "inherit",
                                borderRadius: 3,
                                px: 0.5,
                                scrollSnapAlign: "center",
                                ...(href ? { "&:hover .journey-label": { color: "primary.main" } } : {}),
                            }}
                        >
                            {/* Who works this stop: above it on wide screens. */}
                            {!compact && (
                                <Stack direction="row" spacing={-1} sx={{ height: 36, alignItems: "flex-end", justifyContent: "center", display: "flex" }}>
                                    {(pipeline || here ? stage.actors : []).map((actor) => (
                                        <RoleAvatar key={actor} role={actor} size={here ? 34 : 28} working={here && !cancelled} />
                                    ))}
                                </Stack>
                            )}
                            <Box>{node}</Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
                                    <Typography className="journey-label" sx={{ fontWeight: here ? 800 : 700, fontSize: "0.875rem", color: here ? (cancelled ? "error.main" : "primary.main") : ahead ? "text.secondary" : "text.primary", transition: "color .3s" }}>
                                        {stage.label}
                                    </Typography>
                                    {count !== undefined && (
                                        <Chip size="small" label={count.toLocaleString()} color={count > 0 ? "primary" : "default"} variant={count > 0 ? "filled" : "outlined"} sx={{ height: 20, fontWeight: 800, fontSize: "0.7rem" }} />
                                    )}
                                </Stack>
                                {!compact && (
                                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1.35, mt: 0.25, maxWidth: 140, mx: "auto" }}>
                                        {here && cancelled ? "Cancelled here" : stage.hint}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
        </Box>
    );
}
