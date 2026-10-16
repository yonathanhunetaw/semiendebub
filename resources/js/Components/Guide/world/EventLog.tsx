import React, { useEffect, useRef } from "react";
import { Box, ButtonBase, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { placeFor } from "./places";
import { KIND_COLOR, KIND_PLURAL, hhmm, type EventKind, type WorldEvent } from "./events";

const KINDS: EventKind[] = ["shipment", "order", "refill"];

/**
 * Everything that happened in the day, as a list: grouped by hour, each line
 * saying who did what and where. What is still to come is dimmed; a tap jumps
 * the world there. The kind chips filter the whole timeline.
 */
export default React.memo(function EventLog({
    events,
    counts,
    kinds,
    onKinds,
    cursor,
    reached,
    onCursor,
    onClose,
}: {
    events: WorldEvent[];
    counts: Record<EventKind, number>;
    kinds: EventKind[];
    onKinds: (kinds: EventKind[]) => void;
    cursor: number | null;
    /** The last event that has happened by the moment shown; later ones are dimmed. */
    reached: number | null;
    onCursor: (index: number) => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const list = listRef.current;
        const el = cursor !== null ? list?.querySelector<HTMLElement>(`[data-index="${cursor}"]`) : null;
        if (!list || !el) return;
        list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
    }, [cursor]);

    const toggle = (kind: EventKind) => {
        const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
        onKinds(next.length === 0 ? KINDS : next);
    };

    let lastHour = -1;

    return (
        <Paper elevation={6} sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, borderRadius: 4, overflow: "hidden", bgcolor: alpha(theme.palette.background.paper, 0.97) }}>
            <Box sx={{ p: 1.5, pb: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" alignItems="center">
                    <Typography sx={{ flex: 1, fontWeight: 900 }}>What happened</Typography>
                    <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {KINDS.map((kind) => {
                        const on = kinds.includes(kind);
                        return (
                            <Chip key={kind} size="small" label={`${KIND_PLURAL[kind]} · ${counts[kind]}`} onClick={() => toggle(kind)}
                                color={on ? KIND_COLOR[kind] : "default"} variant={on ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
                        );
                    })}
                </Stack>
            </Box>

            <Box ref={listRef} sx={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", p: 1 }}>
                {events.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Nothing to show for this day.</Typography>
                )}
                {events.map((e, i) => {
                    const hour = new Date(e.at).getHours();
                    const header = hour !== lastHour;
                    lastHour = hour;
                    const isCurrent = i === cursor;
                    const tone = e.bad ? theme.palette.error.main : theme.palette[KIND_COLOR[e.kind]].main;
                    return (
                        <React.Fragment key={e.key}>
                            {header && (
                                <Typography variant="overline" color="text.secondary" sx={{ display: "block", fontWeight: 800, px: 1, mt: i === 0 ? 0 : 1, lineHeight: 2 }}>
                                    {String(hour).padStart(2, "0")}:00
                                </Typography>
                            )}
                            <ButtonBase data-index={i} onClick={() => onCursor(i)}
                                sx={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 1, p: 0.75, borderRadius: 2.5, textAlign: "left",
                                    bgcolor: isCurrent ? alpha(tone, 0.14) : "transparent", opacity: (reached !== null && i <= reached) || isCurrent ? 1 : 0.5,
                                    "&:hover": { bgcolor: isCurrent ? alpha(tone, 0.2) : "action.hover" } }}>
                                <Typography variant="caption" sx={{ width: 38, flexShrink: 0, pt: 0.25, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>{hhmm(e.at)}</Typography>
                                <Box sx={{ width: 3, alignSelf: "stretch", borderRadius: 1, bgcolor: tone, flexShrink: 0 }} />
                                <RoleAvatar role={e.who} size={26} />
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: isCurrent ? 900 : 700, lineHeight: 1.3 }}>{e.what}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                                        {e.reference}{e.where ? ` · ${placeFor(e.where).label}` : ""} · {e.detail}
                                    </Typography>
                                </Box>
                            </ButtonBase>
                        </React.Fragment>
                    );
                })}
            </Box>
        </Paper>
    );
});
