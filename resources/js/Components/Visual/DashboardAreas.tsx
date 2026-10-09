import React, { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronRight from "@mui/icons-material/ChevronRight";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import Scene, { type SceneKind } from "./scenes";
import { bob, motionSafe, pop, pulse } from "./motion";
import { useCountUp } from "./useCountUp";

/**
 * The dashboard's map of the whole app (App\Services\Admin\DashboardAreas):
 * a "go to" bar, a strip of what needs attention, and a card per area with
 * live figures and links into each list.
 */

export interface AreaFact {
    label: string;
    value: number | null;
    href: string | null;
    format: "count" | "money";
}

export interface DashboardArea {
    key: string;
    group: "selling" | "fulfilment" | "stock" | "network";
    label: string;
    scene: SceneKind;
    href: string;
    value: number;
    value_label: string;
    format: "count" | "money";
    attention: number;
    attention_label: string | null;
    facts: AreaFact[];
}

const GROUPS: Array<{ key: DashboardArea["group"]; title: string; caption: string }> = [
    { key: "selling", title: "Selling", caption: "Customers, carts, orders and the money they bring" },
    { key: "fulfilment", title: "Fulfilment", caption: "Packing paid orders and getting them to the door" },
    { key: "stock", title: "Stock", caption: "What is on hand, and what is moving between places" },
    { key: "network", title: "Network", caption: "Hubs, vehicles, the catalogue and the people (global admins)" },
];

const etb = (value: number): string =>
    `${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ETB`;

function Figure({ value, format, sx }: { value: number; format: "count" | "money"; sx?: object }) {
    const shown = useCountUp(value);
    const rounded = Math.round(shown);

    return <Box component="span" sx={sx}>{format === "money" ? etb(rounded) : rounded.toLocaleString()}</Box>;
}

/** "Live · updated 12s ago", ticking. */
export function LiveBadge({ updatedAt }: { updatedAt: number }) {
    const theme = useTheme();
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));

    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ...motionSafe }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main", "--pulse-color": alpha(theme.palette.success.main, 0.5), animation: `${pulse} 2s ease-out infinite` }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                Live · updated {seconds < 5 ? "just now" : `${seconds}s ago`}
            </Typography>
        </Stack>
    );
}

/** One chip per area: the fastest way to any list. */
export function GoToBar({ areas }: { areas: DashboardArea[] }) {
    return (
        <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5, mx: { xs: -1, sm: 0 }, px: { xs: 1, sm: 0 }, "&::-webkit-scrollbar": { display: "none" } }}>
            {areas.map((area) => (
                <Chip
                    key={area.key}
                    component={Link}
                    href={area.href}
                    clickable
                    icon={<Box component="span" sx={{ display: "inline-flex", pl: 0.5 }}><Scene kind={area.scene} size={20} /></Box>}
                    label={
                        <Box component="span" sx={{ display: "inline-flex", gap: 0.75, alignItems: "center" }}>
                            {area.label}
                            {area.attention > 0 && (
                                <Box component="span" sx={{ minWidth: 18, height: 18, px: 0.5, borderRadius: 9, bgcolor: "error.main", color: "error.contrastText", fontSize: "0.65rem", fontWeight: 800, display: "inline-grid", placeItems: "center" }}>
                                    {area.attention}
                                </Box>
                            )}
                        </Box>
                    }
                    variant="outlined"
                    sx={{ height: 36, borderRadius: 999, fontWeight: 700, bgcolor: "background.paper", flexShrink: 0 }}
                />
            ))}
        </Box>
    );
}

/** What needs someone now, biggest first. */
export function AttentionStrip({ areas }: { areas: DashboardArea[] }) {
    const theme = useTheme();
    const urgent = areas.filter((area) => area.attention > 0).sort((a, b) => b.attention - a.attention);

    if (urgent.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: alpha(theme.palette.success.main, 0.4), bgcolor: alpha(theme.palette.success.main, 0.06), display: "flex", alignItems: "center", gap: 1.5 }}>
                <CheckCircleRounded sx={{ color: "success.main" }} />
                <Typography sx={{ fontWeight: 700 }}>All clear: nothing is waiting on anyone right now.</Typography>
            </Paper>
        );
    }

    return (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: `repeat(${Math.min(urgent.length, 4)}, minmax(0, 1fr))` }, ...motionSafe }}>
            {urgent.map((area, index) => (
                <Paper
                    key={area.key}
                    component={Link}
                    href={area.facts.find((fact) => fact.href && fact.value === area.attention)?.href ?? area.href}
                    elevation={0}
                    sx={{
                        p: 1.5,
                        borderRadius: 3,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        textDecoration: "none",
                        color: "inherit",
                        border: "1px solid",
                        borderColor: alpha(theme.palette.warning.main, 0.5),
                        bgcolor: alpha(theme.palette.warning.main, 0.08),
                        animation: `${pop} .4s ease-out both`,
                        animationDelay: `${index * 80}ms`,
                        transition: "transform .15s, box-shadow .15s",
                        "&:hover": { transform: "translateY(-2px)", boxShadow: 3 },
                    }}
                >
                    <Box sx={{ position: "relative", flexShrink: 0 }}>
                        <Scene kind={area.scene} size={40} />
                        <Box sx={{ position: "absolute", top: -6, right: -8, minWidth: 22, height: 22, px: 0.5, borderRadius: 11, bgcolor: "error.main", color: "error.contrastText", fontSize: "0.7rem", fontWeight: 800, display: "grid", placeItems: "center", "--pulse-color": alpha(theme.palette.error.main, 0.5), animation: `${pulse} 1.8s ease-out infinite` }}>
                            {area.attention}
                        </Box>
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.875rem" }}>{area.label}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                            {area.attention} {area.attention_label}
                        </Typography>
                    </Box>
                    <ChevronRight sx={{ color: "text.secondary" }} />
                </Paper>
            ))}
        </Box>
    );
}

function AreaCard({ area, index }: { area: DashboardArea; index: number }) {
    const theme = useTheme();
    const urgent = area.attention > 0;

    return (
        <Paper
            elevation={0}
            sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                borderRadius: 4,
                border: "1px solid",
                borderColor: urgent ? alpha(theme.palette.warning.main, 0.55) : "divider",
                bgcolor: "background.paper",
                overflow: "hidden",
                animation: `${pop} .45s ease-out both`,
                animationDelay: `${index * 50}ms`,
                transition: "transform .2s, box-shadow .2s",
                "&:hover": { transform: "translateY(-3px)", boxShadow: 4 },
                "&:hover .area-scene": { animation: `${bob} 1.2s ease-in-out infinite` },
            }}
        >
            {/* Head: the whole top of the card opens the list. */}
            <Box component={Link} href={area.href} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", p: 2, pb: 1.25, textDecoration: "none", color: "inherit", background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 70%)` }}>
                <Box className="area-scene" sx={{ flexShrink: 0 }}>
                    <Scene kind={area.scene} size={48} title={area.label} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Typography sx={{ fontWeight: 800, fontSize: "0.95rem" }}>{area.label}</Typography>
                        {urgent && (
                            <Chip size="small" color="warning" label={`${area.attention} waiting`} sx={{ height: 20, fontSize: "0.65rem", fontWeight: 800 }} />
                        )}
                    </Stack>
                    <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" }, fontWeight: 900, lineHeight: 1.15, mt: 0.25 }}>
                        <Figure value={area.value} format={area.format} />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{area.value_label}</Typography>
                </Box>
            </Box>

            {/* Facts: each opens its own slice of the list. */}
            <Box sx={{ px: 1, pb: 1, mt: "auto" }}>
                {area.facts.map((fact) => {
                    const row = (
                        <>
                            <Typography sx={{ fontSize: "0.8125rem", flex: 1, minWidth: 0 }} noWrap>{fact.label}</Typography>
                            {fact.value !== null && (
                                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800 }}>
                                    <Figure value={fact.value} format={fact.format} />
                                </Typography>
                            )}
                            {fact.href && <ChevronRight fontSize="small" sx={{ color: "text.secondary" }} />}
                        </>
                    );
                    const rowSx = { display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.75, borderRadius: 2, textDecoration: "none", color: "inherit", minHeight: 36 } as const;

                    return fact.href ? (
                        <Box key={fact.label} component={Link} href={fact.href} sx={{ ...rowSx, "&:hover": { bgcolor: "action.hover" } }}>{row}</Box>
                    ) : (
                        <Box key={fact.label} sx={rowSx}>{row}</Box>
                    );
                })}
            </Box>
        </Paper>
    );
}

/** Every area, grouped by what it is for. */
export function AreaGroups({ areas }: { areas: DashboardArea[] }) {
    let index = 0;

    return (
        <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ ...motionSafe }}>
            {GROUPS.map((group) => {
                const inGroup = areas.filter((area) => area.group === group.key);
                if (inGroup.length === 0) return null;

                return (
                    <Box key={group.key}>
                        <Box sx={{ mb: 1.25 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>{group.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{group.caption}</Typography>
                        </Box>
                        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
                            {inGroup.map((area) => <AreaCard key={area.key} area={area} index={index++} />)}
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}
