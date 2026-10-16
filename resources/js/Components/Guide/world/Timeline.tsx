import React, { memo, useEffect, useRef } from "react";
import { Box, Button, ButtonBase, Chip, CircularProgress, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ListRounded from "@mui/icons-material/ListRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SkipNextRounded from "@mui/icons-material/SkipNextRounded";
import SkipPreviousRounded from "@mui/icons-material/SkipPreviousRounded";
import VideocamOffRounded from "@mui/icons-material/VideocamOffRounded";
import VideocamRounded from "@mui/icons-material/VideocamRounded";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { placeFor } from "./places";
import { KIND_COLOR, KIND_LABEL, hhmm, type WorldEvent } from "./events";

/**
 * The replay's controls, driven by events rather than by the clock: the day,
 * what just happened (who, what, where), and every event of the day in a
 * strip to step through. Play walks the events one by one; the world flies
 * to each and the vans drive the time in between.
 */

export type Pace = "slow" | "normal" | "fast";

/** How long each event stays on screen while playing, in ms. */
export const PACE_MS: Record<Pace, number> = { slow: 7000, normal: 4000, fast: 1800 };
const PACE_LABEL: Record<Pace, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };
const NEXT_PACE: Record<Pace, Pace> = { slow: "normal", normal: "fast", fast: "slow" };

interface Props {
    day: string;
    onDay: (day: string) => void;
    busyDays: string[];
    loading: boolean;
    events: WorldEvent[];
    cursor: number | null;
    onCursor: (index: number) => void;
    time: number;
    /** The last event that has happened by `time`. */
    reached: number | null;
    playing: boolean;
    onPlaying: (playing: boolean) => void;
    pace: Pace;
    onPace: (pace: Pace) => void;
    live: boolean;
    isToday: boolean;
    onLive: () => void;
    follow: boolean;
    onFollow: (follow: boolean) => void;
    logOpen: boolean;
    onLog: (open: boolean) => void;
    onDetails: (event: WorldEvent) => void;
}

export default function Timeline(props: Props) {
    const { day, onDay, busyDays, loading, events, cursor, onCursor, time, reached, playing, onPlaying, pace, onPace, live, isToday, onLive, follow, onFollow, logOpen, onLog, onDetails } = props;
    const theme = useTheme();
    const start = dayStart(day);
    const current = cursor !== null ? events[cursor] ?? null : null;

    const busy = new Set(busyDays);
    const previousBusy = [...busyDays].reverse().find((d) => d < day);
    const nextBusy = busyDays.find((d) => d > day);
    const shift = (days: number) => {
        const d = new Date(start);
        d.setDate(d.getDate() + days);
        onDay(isoDay(d));
    };

    const prev = () => onCursor(cursor === null ? 0 : Math.max(0, cursor - 1));
    const next = () => onCursor(cursor === null ? 0 : Math.min(events.length - 1, cursor + 1));

    const tone = useTone();

    return (
        <Paper elevation={6} sx={{ p: { xs: 1, sm: 1.25 }, borderRadius: 4, bgcolor: alpha(theme.palette.background.paper, 0.96) }}>
            {/* Day, stepping, pace, camera, log, live */}
            <Stack direction="row" alignItems="center" spacing={0.25} flexWrap="wrap" useFlexGap>
                <Tooltip title={previousBusy ? `Previous busy day: ${previousBusy}` : "Previous day"}>
                    <IconButton size="small" onClick={() => (previousBusy ? onDay(previousBusy) : shift(-1))} aria-label="Previous day"><ChevronLeftRounded /></IconButton>
                </Tooltip>
                <TextField
                    type="date"
                    size="small"
                    value={day}
                    onChange={(e) => e.target.value && onDay(e.target.value)}
                    inputProps={{ max: isoDay(new Date()), "aria-label": "Day" }}
                    sx={{ width: 142, "& input": { py: 0.6, fontWeight: 700, fontSize: "0.85rem" } }}
                />
                <Tooltip title={nextBusy ? `Next busy day: ${nextBusy}` : "Next day"}>
                    <span>
                        <IconButton size="small" disabled={day >= isoDay(new Date())} onClick={() => (nextBusy ? onDay(nextBusy) : shift(1))} aria-label="Next day"><ChevronRightRounded /></IconButton>
                    </span>
                </Tooltip>
                {busy.has(day) && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "warning.main" }} title="Something happened this day" />}
                {loading && <CircularProgress size={16} sx={{ ml: 0.5 }} />}

                <Box sx={{ flex: 1 }} />

                <Tooltip title="Previous event (←)">
                    <span><IconButton size="small" onClick={prev} disabled={events.length === 0 || cursor === 0} aria-label="Previous event"><SkipPreviousRounded /></IconButton></span>
                </Tooltip>
                <Tooltip title={playing ? "Pause (space)" : "Play the day, event by event (space)"}>
                    <span>
                        <IconButton color="primary" onClick={() => onPlaying(!playing)} disabled={events.length === 0} aria-label={playing ? "Pause" : "Play"}
                            sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) } }}>
                            {playing ? <PauseRounded /> : <PlayArrowRounded />}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Next event (→)">
                    <span><IconButton size="small" onClick={next} disabled={events.length === 0 || cursor === events.length - 1} aria-label="Next event"><SkipNextRounded /></IconButton></span>
                </Tooltip>
                <Tooltip title="How long each event stays on screen">
                    <Chip size="small" variant="outlined" label={PACE_LABEL[pace]} onClick={() => onPace(NEXT_PACE[pace])} sx={{ fontWeight: 800, minWidth: 64 }} />
                </Tooltip>
                <Tooltip title={follow ? "The camera follows each event. Click to stop" : "Let the camera follow each event"}>
                    <IconButton size="small" color={follow ? "primary" : "default"} onClick={() => onFollow(!follow)} aria-label="Camera follows events" aria-pressed={follow}>
                        {follow ? <VideocamRounded fontSize="small" /> : <VideocamOffRounded fontSize="small" />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={logOpen ? "Hide the list of events" : "Show every event as a list"}>
                    <IconButton size="small" color={logOpen ? "primary" : "default"} onClick={() => onLog(!logOpen)} aria-label="Event list" aria-pressed={logOpen}>
                        <ListRounded fontSize="small" />
                    </IconButton>
                </Tooltip>
                {live
                    ? <Chip size="small" color="error" label="● LIVE" sx={{ fontWeight: 900 }} />
                    : <Button size="small" variant="outlined" color="error" onClick={onLive} sx={{ borderRadius: 999, fontWeight: 800, minWidth: 0 }}>Live</Button>}
            </Stack>

            {/* What just happened */}
            <Box sx={{ mt: 1, px: { xs: 0.5, sm: 1 } }}>
                {current ? (
                    <Stack direction="row" spacing={1.25} alignItems="center" key={current.key}
                        sx={{ p: 1, borderRadius: 3, bgcolor: alpha(tone(current), 0.1), borderLeft: "4px solid", borderLeftColor: tone(current) }}>
                        <RoleAvatar role={current.who} size={40} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: "block", lineHeight: 1.3 }} noWrap>
                                {hhmm(current.at)} · {KIND_LABEL[current.kind]} {current.reference}
                                {current.where ? ` · ${placeFor(current.where).label}` : ""}
                            </Typography>
                            <Typography sx={{ fontWeight: 900, fontSize: { xs: "0.95rem", sm: "1.05rem" }, lineHeight: 1.25 }}>{current.what}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{current.detail}</Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                {(cursor ?? 0) + 1} / {events.length}
                            </Typography>
                            <Button size="small" variant="text" onClick={() => onDetails(current)} sx={{ fontWeight: 800, minWidth: 0, px: 1, borderRadius: 999 }}>Details</Button>
                        </Stack>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: 3, bgcolor: "action.hover" }}>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                            {loading
                                ? "Loading the day…"
                                : events.length > 0
                                    ? `${events.length} things happened ${isToday ? "today" : "this day"}. Press play to walk through them.`
                                    : isToday ? "Nothing has happened yet today." : "Nothing happened this day."}
                        </Typography>
                        {events.length > 0 && (
                            <Button size="small" variant="contained" startIcon={<PlayArrowRounded />} onClick={() => onCursor(0)} sx={{ borderRadius: 999, fontWeight: 800 }}>First event</Button>
                        )}
                        {events.length === 0 && !loading && previousBusy && (
                            <Button size="small" variant="outlined" onClick={() => onDay(previousBusy)} sx={{ borderRadius: 999, fontWeight: 800 }}>Last busy day</Button>
                        )}
                    </Stack>
                )}
            </Box>

            {/* The day at a glance: where the events fall, and where we are */}
            {events.length > 0 && (
                <Box
                    role="presentation"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const t = start + ((e.clientX - rect.left) / rect.width) * 86_400_000;
                        let best = 0;
                        events.forEach((ev, i) => Math.abs(ev.at - t) < Math.abs(events[best].at - t) && (best = i));
                        onCursor(best);
                    }}
                    sx={{ position: "relative", height: 14, mx: { xs: 0.5, sm: 1 }, mt: 1, borderRadius: 999, bgcolor: "action.hover", cursor: "pointer", display: { xs: "none", sm: "block" } }}
                >
                    <DayMarks events={events} start={start} cursor={cursor} reached={reached} />
                    <Box sx={{ position: "absolute", left: `${Math.max(0, Math.min(1, (time - start) / 86_400_000)) * 100}%`, top: -3, bottom: -3, width: 2, ml: "-1px", bgcolor: "text.primary", borderRadius: 1 }} />
                </Box>
            )}

            {/* Every event of the day, to step to */}
            {events.length > 0 && <EventStrip events={events} cursor={cursor} reached={reached} onCursor={onCursor} />}
        </Paper>
    );
}

/** Where the day's events fall on the day bar; redrawn only when an event is reached, not every frame. */
const DayMarks = memo(function DayMarks({ events, start, cursor, reached }: { events: WorldEvent[]; start: number; cursor: number | null; reached: number | null }) {
    const tone = useTone();
    return (
        <>
            {[6, 12, 18].map((h) => (
                <Box key={h} sx={{ position: "absolute", left: `${(h / 24) * 100}%`, top: 2, bottom: 2, width: "1px", bgcolor: "divider" }} />
            ))}
            {events.map((e, i) => (
                <Box key={e.key} sx={{ position: "absolute", left: `${((e.at - start) / 86_400_000) * 100}%`, top: i === cursor ? 0 : 3, bottom: i === cursor ? 0 : 3, width: i === cursor ? 4 : 2, ml: "-1px", borderRadius: 1, bgcolor: tone(e), opacity: reached !== null && i <= reached ? 1 : 0.4 }} />
            ))}
        </>
    );
});

/** Every event of the day in a row, the current one kept in the middle. */
const EventStrip = memo(function EventStrip({ events, cursor, reached, onCursor }: { events: WorldEvent[]; cursor: number | null; reached: number | null; onCursor: (index: number) => void }) {
    const tone = useTone();
    const stripRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const strip = stripRef.current;
        const el = cursor !== null ? strip?.querySelector<HTMLElement>(`[data-index="${cursor}"]`) : null;
        if (!strip || !el) return;
        strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
    }, [cursor, events.length]);

    return (
        <Box ref={stripRef} sx={{ position: "relative", display: "flex", gap: 0.75, overflowX: "auto", mt: 1, pb: 0.25, px: { xs: 0.5, sm: 1 }, "&::-webkit-scrollbar": { display: "none" }, scrollbarWidth: "none" }}>
            {events.map((e, i) => {
                const isCurrent = i === cursor;
                const past = reached !== null && i <= reached;
                return (
                    <ButtonBase key={e.key} data-index={i} onClick={() => onCursor(i)}
                        sx={{ flexShrink: 0, maxWidth: 220, display: "flex", alignItems: "stretch", gap: 0.75, textAlign: "left", borderRadius: 2, pl: 0.75, pr: 1, py: 0.5,
                            border: "1px solid", borderColor: isCurrent ? tone(e) : "divider", bgcolor: isCurrent ? alpha(tone(e), 0.16) : "background.paper",
                            opacity: past || isCurrent ? 1 : 0.55, transition: "background-color .2s, border-color .2s" }}>
                        <Box sx={{ width: 4, borderRadius: 1, bgcolor: tone(e), flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: "block", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }} noWrap>
                                {hhmm(e.at)} · {e.reference}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: isCurrent ? 900 : 700, display: "block", lineHeight: 1.25 }} noWrap>{e.what}</Typography>
                        </Box>
                    </ButtonBase>
                );
            })}
        </Box>
    );
});

/** An event's colour: its kind's, or red when it went wrong. */
function useTone(): (e: WorldEvent) => string {
    const theme = useTheme();
    return (e) => (e.bad ? theme.palette.error.main : theme.palette[KIND_COLOR[e.kind]].main);
}

export function isoDay(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayStart(day: string): number {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
}
