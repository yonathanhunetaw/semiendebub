import React from "react";
import { Link } from "@inertiajs/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import History from "@mui/icons-material/History";
import { densePanelSx, PanelHead } from "@/Components/Visual/DashboardAreas";
import { dayDateTime } from "@/utils/dates";

/**
 * The dashboard's look as parts, so every admin list and detail page reads
 * the same: a colour band with the title, a row of figure tiles, dense
 * panels, small pills and a history timeline.
 */

export { densePanelSx, PanelHead };

export type PillTone = "default" | "info" | "warning" | "success" | "error" | "primary";

export const tinySx = { fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.3 } as const;

/** The band at the top of a page: icon, title, a line under it, actions on the right. */
export function PageBand({ icon, title, subtitle, actions, children }: { icon: React.ReactNode; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
    return (
        <Paper elevation={0} sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText" }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                <Box sx={(t) => ({ width: 34, height: 34, borderRadius: 1.5, flexShrink: 0, display: "grid", placeItems: "center", bgcolor: alpha(t.palette.primary.contrastText, 0.18), "& svg": { fontSize: 20 } })}>{icon}</Box>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.25 }}>{title}</Typography>
                    {subtitle && <Typography noWrap sx={{ fontSize: "0.75rem", opacity: 0.8 }}>{subtitle}</Typography>}
                </Box>
                {actions && <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>{actions}</Stack>}
            </Stack>
            {children && <Box sx={{ mt: 1 }}>{children}</Box>}
        </Paper>
    );
}

/** One figure with its label, for a row under the band. */
export function FigureTile({ label, value, tone = "default", hint }: { label: string; value: React.ReactNode; tone?: PillTone; hint?: string }) {
    const theme = useTheme();
    const color = tone === "default" ? theme.palette.text.primary : theme.palette[tone].main;

    return (
        <Paper elevation={0} sx={{ ...densePanelSx, py: 1, borderLeft: "3px solid", borderLeftColor: tone === "default" ? "divider" : color }}>
            <Typography sx={{ ...tinySx, fontWeight: 600 }}>{label}</Typography>
            <Typography noWrap sx={{ fontWeight: 800, fontSize: "1.125rem", lineHeight: 1.3, color, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
            {hint && <Typography noWrap sx={{ ...tinySx, fontSize: "0.625rem" }}>{hint}</Typography>}
        </Paper>
    );
}

export function FigureRow({ children }: { children: React.ReactNode }) {
    return <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>{children}</Box>;
}

export function Pill({ tone = "default", label }: { tone?: PillTone; label: string }) {
    const theme = useTheme();
    const color = tone === "default" ? theme.palette.text.secondary : theme.palette[tone].main;

    return (
        <Box component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 1, fontSize: "0.625rem", fontWeight: 700, textTransform: "capitalize", whiteSpace: "nowrap", flexShrink: 0, color, bgcolor: alpha(color, 0.12), border: "1px solid", borderColor: alpha(color, 0.3) }}>
            {label}
        </Box>
    );
}

/** Previous / next for a Laravel paginator's `links`. */
export function Pager({ links, from, to, total }: { links?: Array<{ url: string | null; label: string; active: boolean }>; from?: number | null; to?: number | null; total?: number }) {
    if (!links || links.length <= 3) return null;
    const prev = links[0];
    const next = links[links.length - 1];
    const numbered = links.slice(1, -1);
    const btn = (active: boolean, disabled: boolean) => ({ minWidth: 28, height: 28, px: 0.75, display: "inline-grid", placeItems: "center", borderRadius: 1, fontSize: "0.75rem", fontWeight: active ? 800 : 600, textDecoration: "none", color: active ? "primary.contrastText" : disabled ? "text.disabled" : "text.primary", bgcolor: active ? "primary.main" : "transparent", pointerEvents: disabled ? "none" : "auto", "&:hover": { bgcolor: active ? "primary.main" : "action.hover" } }) as const;

    return (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" justifyContent="space-between" sx={{ pt: 1 }}>
            <Typography sx={tinySx}>{total !== undefined ? `${from ?? 0}–${to ?? 0} of ${total.toLocaleString()}` : ""}</Typography>
            <Stack direction="row" spacing={0.25} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
                <Box component={Link} href={prev.url ?? "#"} preserveScroll sx={btn(false, !prev.url)} aria-label="Previous page"><ChevronLeft sx={{ fontSize: 18 }} /></Box>
                {numbered.map((link, index) => (
                    <Box key={`${link.label}-${index}`} component={link.url ? Link : "span"} {...(link.url ? { href: link.url, preserveScroll: true } : {})} sx={btn(link.active, !link.url)} dangerouslySetInnerHTML={{ __html: link.label }} />
                ))}
                <Box component={Link} href={next.url ?? "#"} preserveScroll sx={btn(false, !next.url)} aria-label="Next page"><ChevronRight sx={{ fontSize: 18 }} /></Box>
            </Stack>
        </Stack>
    );
}

export interface HistoryEvent {
    kind: string;
    title: string;
    detail: string | null;
    by: string | null;
    at: string;
}

const KIND_TONE: Record<string, PillTone> = { created: "primary", seller: "info", item: "default", share: "info", opened: "default", edited: "warning", revoked: "error", sale: "success" };

/** Who did what and when, newest first. Used where a record has a past worth reading. */
export function HistoryPanel({ events, title = "History", empty = "Nothing has happened yet." }: { events: HistoryEvent[]; title?: string; empty?: string }) {
    const theme = useTheme();

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead icon={<History sx={{ fontSize: 16, color: "text.secondary" }} />} title={`${title}${events.length ? ` · ${events.length}` : ""}`} />
            {events.length === 0 ? (
                <Typography sx={{ ...tinySx, py: 2, textAlign: "center" }}>{empty}</Typography>
            ) : (
                <Stack spacing={0}>
                    {events.map((event, index) => {
                        const tone = KIND_TONE[event.kind] ?? "default";
                        const color = tone === "default" ? theme.palette.text.secondary : theme.palette[tone].main;

                        return (
                            <Box key={`${event.kind}-${event.at}-${index}`} sx={{ display: "flex", gap: 1, position: "relative", pb: 1.25 }}>
                                {index < events.length - 1 && <Box sx={{ position: "absolute", left: 5, top: 14, bottom: 0, width: "1px", bgcolor: "divider" }} />}
                                <Box sx={{ width: 11, height: 11, mt: 0.5, borderRadius: "50%", flexShrink: 0, bgcolor: alpha(color, 0.25), border: "2px solid", borderColor: color, zIndex: 1 }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{event.title}</Typography>
                                    {event.detail && <Typography sx={{ ...tinySx, fontSize: "0.6875rem" }}>{event.detail}</Typography>}
                                    <Typography sx={{ fontSize: "0.625rem", color: "text.disabled" }}>
                                        {dayDateTime(event.at)}{event.by ? ` · ${event.by}` : ""}
                                    </Typography>
                                </Box>
                            </Box>
                        );
                    })}
                </Stack>
            )}
        </Paper>
    );
}

/** A panel wrapper that holds a table edge to edge. */
export function TablePanel({ children, head }: { children: React.ReactNode; head?: React.ReactNode }) {
    return (
        <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
            {head && <Box sx={{ p: 1.25, pb: 0.5 }}>{head}</Box>}
            {children}
        </Paper>
    );
}

export const adminTableSx = {
    "& th": { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "text.secondary", bgcolor: "action.hover", py: 0.75, whiteSpace: "nowrap" },
    "& td": { fontSize: "0.8125rem", py: 0.875 },
    "& tbody tr:hover": { bgcolor: "action.hover" },
} as const;
