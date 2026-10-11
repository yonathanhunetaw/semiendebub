import React, { useEffect, useState } from "react";
import { Link } from "@inertiajs/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronRight from "@mui/icons-material/ChevronRight";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import PriorityHigh from "@mui/icons-material/PriorityHigh";
import Scene, { type SceneKind } from "./scenes";
import { motionSafe, pop, pulse } from "./motion";
import { useCountUp } from "./useCountUp";

/**
 * The dashboard's map of the whole app (App\Services\Admin\DashboardAreas),
 * drawn dense so the first screen holds it: a "go to" bar, a grid of what
 * needs attention, a tile per selling/fulfilment area, and one strip for
 * stock and the network.
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

const etb = (value: number): string =>
    `${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ETB`;

/** The shared look of a dashboard panel. */
export const densePanelSx = { p: 1.25, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", minWidth: 0 } as const;

/** A panel's title row: icon, bold title, something on the right. */
export function PanelHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                {icon}
                <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.8125rem" }}>{title}</Typography>
            </Stack>
            {right}
        </Box>
    );
}

function Figure({ value, format }: { value: number; format: "count" | "money" }) {
    const rounded = Math.round(useCountUp(value));

    return <>{format === "money" ? etb(rounded) : rounded.toLocaleString()}</>;
}

function Badge({ n }: { n: number }) {
    return (
        <Box component="span" sx={{ minWidth: 16, height: 16, px: 0.5, borderRadius: 8, bgcolor: "error.main", color: "error.contrastText", fontSize: "0.625rem", fontWeight: 800, display: "inline-grid", placeItems: "center", lineHeight: 1 }}>
            {n}
        </Box>
    );
}

/** "Live · 12s ago", ticking. */
export function LiveBadge({ updatedAt }: { updatedAt: number }) {
    const theme = useTheme();
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));

    return (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ...motionSafe, flexShrink: 0 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "success.main", "--pulse-color": alpha(theme.palette.success.main, 0.5), animation: `${pulse} 2s ease-out infinite` }} />
            <Typography sx={{ fontWeight: 700, fontSize: "0.6875rem", color: "success.main" }}>
                Live · {seconds < 5 ? "just now" : `${seconds}s ago`}
            </Typography>
        </Stack>
    );
}

/** One small link per area: the fastest way to any list. */
export function GoToBar({ areas }: { areas: DashboardArea[] }) {
    return (
        <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
            {areas.map((area) => (
                <Box
                    key={area.key}
                    component={Link}
                    href={area.href}
                    sx={{
                        flex: "1 0 auto",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0.5,
                        px: 1,
                        py: 0.5,
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        color: "text.primary",
                        textDecoration: "none",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        "&:hover": { borderColor: "primary.main" },
                    }}
                >
                    <Scene kind={area.scene} size={16} />
                    {area.label}
                    {area.attention > 0 && <Badge n={area.attention} />}
                </Box>
            ))}
        </Box>
    );
}

/** What needs someone now, biggest first, two to a row on a phone. */
export function AttentionGrid({ areas }: { areas: DashboardArea[] }) {
    const theme = useTheme();
    const urgent = areas.filter((area) => area.attention > 0).sort((a, b) => b.attention - a.attention);

    if (urgent.length === 0) {
        return (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ p: 0.75, borderRadius: 1.5, bgcolor: alpha(theme.palette.success.main, 0.08) }}>
                <CheckCircleRounded sx={{ color: "success.main", fontSize: 16 }} />
                <Typography sx={{ fontWeight: 700, fontSize: "0.75rem" }}>All clear: nothing is waiting on anyone.</Typography>
            </Stack>
        );
    }

    return (
        <Box sx={{ display: "grid", gap: 0.75, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, ...motionSafe }}>
            {urgent.map((area, index) => (
                <Box
                    key={area.key}
                    component={Link}
                    href={area.facts.find((fact) => fact.href && fact.value === area.attention)?.href ?? area.href}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        p: 0.75,
                        borderRadius: 1.5,
                        textDecoration: "none",
                        color: "inherit",
                        border: "1px solid",
                        borderColor: alpha(theme.palette.warning.main, 0.45),
                        bgcolor: alpha(theme.palette.warning.main, 0.08),
                        minWidth: 0,
                        animation: `${pop} .35s ease-out both`,
                        animationDelay: `${index * 60}ms`,
                        "&:hover": { bgcolor: alpha(theme.palette.warning.main, 0.16) },
                    }}
                >
                    <Box sx={{ position: "relative", flexShrink: 0, display: "flex" }}>
                        <Scene kind={area.scene} size={22} />
                        <Box sx={{ position: "absolute", top: -5, right: -7 }}>
                            <Badge n={area.attention} />
                        </Box>
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.75rem", lineHeight: 1.2 }}>{area.label}</Typography>
                        <Typography noWrap sx={{ fontSize: "0.6875rem", lineHeight: 1.2, color: "warning.dark" }}>
                            {area.attention} {area.attention_label}
                        </Typography>
                    </Box>
                    <ChevronRight sx={{ fontSize: 14, color: "text.secondary" }} />
                </Box>
            ))}
        </Box>
    );
}

/** The panel around AttentionGrid. */
export function AttentionPanel({ areas, updatedAt }: { areas: DashboardArea[]; updatedAt: number }) {
    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead
                icon={<PriorityHigh sx={{ fontSize: 16, color: "warning.main" }} />}
                title="Needs attention"
                right={<LiveBadge updatedAt={updatedAt} />}
            />
            <AttentionGrid areas={areas} />
        </Paper>
    );
}

const factRowSx = { display: "flex", alignItems: "center", gap: 0.5, minHeight: 18, textDecoration: "none", color: "inherit", borderRadius: 0.5 } as const;

function AreaTile({ area }: { area: DashboardArea }) {
    const theme = useTheme();
    const urgent = area.attention > 0;

    return (
        <Paper
            elevation={0}
            sx={{
                ...densePanelSx,
                p: 1,
                display: "flex",
                flexDirection: "column",
                borderColor: urgent ? alpha(theme.palette.warning.main, 0.55) : "divider",
            }}
        >
            {/* The head opens the list. */}
            <Box component={Link} href={area.href} sx={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.6875rem", color: "text.secondary" }}>{area.label}</Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                        {urgent && <Badge n={area.attention} />}
                        <Scene kind={area.scene} size={16} />
                    </Stack>
                </Stack>
                <Typography noWrap sx={{ fontSize: "1rem", fontWeight: 900, lineHeight: 1.25 }}>
                    <Figure value={area.value} format={area.format} />
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.625rem", color: "text.secondary", lineHeight: 1.2 }}>{area.value_label}</Typography>
            </Box>

            {/* Facts: each opens its own slice of the list. */}
            {area.facts.length > 0 && (
                <Box sx={{ mt: 0.75, pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                    {area.facts.map((fact) => {
                        const row = (
                            <>
                                <Typography noWrap sx={{ fontSize: "0.6875rem", color: "text.secondary", flex: 1, minWidth: 0 }}>{fact.label}</Typography>
                                {fact.value !== null ? (
                                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800 }}>
                                        <Figure value={fact.value} format={fact.format} />
                                    </Typography>
                                ) : (
                                    <ChevronRight sx={{ fontSize: 13, color: "text.secondary" }} />
                                )}
                            </>
                        );

                        return fact.href ? (
                            <Box key={fact.label} component={Link} href={fact.href} sx={{ ...factRowSx, "&:hover": { bgcolor: "action.hover" } }}>{row}</Box>
                        ) : (
                            <Box key={fact.label} sx={factRowSx}>{row}</Box>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
}

/** Selling and fulfilment: one small tile per area. */
export function AreaTiles({ areas }: { areas: DashboardArea[] }) {
    const tiles = areas.filter((area) => area.group === "selling" || area.group === "fulfilment");
    if (tiles.length === 0) return null;

    return (
        <Box>
            <Typography sx={{ px: 0.25, mb: 0.5, fontSize: "0.6875rem", fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
                Selling &amp; fulfilment
            </Typography>
            <Box sx={{ display: "grid", gap: 0.75, gridTemplateColumns: { xs: "repeat(auto-fill, minmax(108px, 1fr))", sm: "repeat(auto-fill, minmax(150px, 1fr))" } }}>
                {tiles.map((area) => <AreaTile key={area.key} area={area} />)}
            </Box>
        </Box>
    );
}

/** Stock and network areas squeezed into one strip, with their facts beneath. */
export function NetworkStrip({ areas }: { areas: DashboardArea[] }) {
    const cells = areas.filter((area) => area.group === "stock" || area.group === "network");
    if (cells.length === 0) return null;

    const facts = cells.flatMap((area) =>
        area.facts.filter((fact) => fact.value !== null).map((fact) => ({ ...fact, area: area.label, key: `${area.key}-${fact.label}` })),
    );

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead icon={<Scene kind="shelf" size={16} />} title="Stock & network" />
            <Box sx={{ display: "grid", gap: 0.5, gridTemplateColumns: { xs: "repeat(auto-fill, minmax(76px, 1fr))", sm: "repeat(auto-fill, minmax(110px, 1fr))" } }}>
                {cells.map((area) => (
                    <Box
                        key={area.key}
                        component={Link}
                        href={area.href}
                        sx={{ p: 0.5, borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", textAlign: "center", textDecoration: "none", color: "inherit", minWidth: 0, "&:hover": { borderColor: "primary.main" } }}
                    >
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                            <Typography noWrap sx={{ fontSize: "0.625rem", color: "text.secondary" }}>{area.label}</Typography>
                            {area.attention > 0 && <Badge n={area.attention} />}
                        </Stack>
                        <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 900 }}>
                            <Figure value={area.value} format={area.format} />
                        </Typography>
                    </Box>
                ))}
            </Box>
            {facts.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.25, mt: 0.75, px: 0.25 }}>
                    {facts.map((fact) => {
                        const text = (
                            <>
                                {fact.area} · {fact.label}:{" "}
                                <Box component="strong" sx={{ color: "text.primary" }}>
                                    <Figure value={fact.value as number} format={fact.format} />
                                </Box>
                            </>
                        );
                        const sx = { fontSize: "0.6875rem", color: "text.secondary", textDecoration: "none", whiteSpace: "nowrap" } as const;

                        return fact.href ? (
                            <Box key={fact.key} component={Link} href={fact.href} sx={{ ...sx, "&:hover": { color: "primary.main" } }}>{text}</Box>
                        ) : (
                            <Box key={fact.key} component="span" sx={sx}>{text}</Box>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
}
