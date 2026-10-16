import React from "react";
import { Box, ButtonBase, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { placeFor } from "./places";
import { KIND_COLOR, KIND_LABEL, hhmm, type EventKind, type WorldEvent } from "./events";

/**
 * One order or refill as of the timeline's moment: what it is, the phase it
 * is in, and each of its events with who did it and where (greyed until it
 * has happened). A tap on an event jumps the timeline there.
 */
export default function JourneyCard({
    kind,
    reference,
    title,
    chips,
    phase,
    events,
    currentKey,
    time,
    onEvent,
    onClose,
}: {
    kind: EventKind;
    reference: string;
    title: string;
    chips: string[];
    phase: string;
    events: WorldEvent[];
    currentKey: string | null;
    time: number;
    onEvent: (event: WorldEvent) => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const tone = theme.palette[KIND_COLOR[kind]].main;

    return (
        <Paper elevation={6} sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 2, borderRadius: 4, borderTop: "4px solid", borderTopColor: tone, bgcolor: alpha(theme.palette.background.paper, 0.97) }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{KIND_LABEL[kind]}</Typography>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", lineHeight: 1.2 }}>{reference}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{title}</Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRounded fontSize="small" /></IconButton>
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <Chip size="small" color={KIND_COLOR[kind]} label={phase} sx={{ fontWeight: 800 }} />
                {chips.map((c) => <Chip key={c} size="small" variant="outlined" label={c} />)}
            </Stack>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>What happened</Typography>
            <Stack spacing={0.25}>
                {events.map((e) => {
                    const happened = e.at <= time;
                    const isCurrent = e.key === currentKey;
                    return (
                        <ButtonBase key={e.key} onClick={() => onEvent(e)}
                            sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.5, borderRadius: 2, textAlign: "left", opacity: happened ? 1 : 0.45,
                                bgcolor: isCurrent ? alpha(tone, 0.14) : "transparent", "&:hover": { bgcolor: "action.hover" } }}>
                            {happened
                                ? <CheckCircleRounded color={e.bad ? "error" : "success"} sx={{ fontSize: 16 }} />
                                : <RadioButtonUncheckedRounded color="disabled" sx={{ fontSize: 16 }} />}
                            <RoleAvatar role={e.who} size={22} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: isCurrent ? 900 : happened ? 700 : 500, lineHeight: 1.25 }}>{e.what}</Typography>
                                {e.where && <Typography variant="caption" color="text.secondary">{placeFor(e.where).label}</Typography>}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(e.at)}</Typography>
                        </ButtonBase>
                    );
                })}
            </Stack>
        </Paper>
    );
}
