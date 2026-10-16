import React from "react";
import { Box, Button, ButtonBase, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import MenuBookRounded from "@mui/icons-material/MenuBookRounded";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { identityFor } from "@/Components/Visual/identities";
import { CHAPTERS } from "@/Components/Guide/chapters";
import { KIND_COLOR, hhmm, type WorldEvent } from "./events";
import { hubLayout, type Place } from "./places";

/**
 * What a place in the Duka world is for, what happened there on the day being
 * replayed, who works there, and where to read more.
 */
export default function PlaceCard({
    place,
    onClose,
    onOpenChapter,
    events = [],
    time,
    currentKey,
    onEvent,
}: {
    place: Place;
    onClose: () => void;
    onOpenChapter: (key: string) => void;
    /** The day's events at this place, each with its index in the timeline. */
    events?: Array<{ event: WorldEvent; index: number }>;
    time: number;
    currentKey: string | null;
    onEvent: (index: number) => void;
}) {
    const theme = useTheme();
    const tone = theme.palette[identityFor(place.roles[0]).color].main;
    const chapters = CHAPTERS.filter((c) => place.chapters.includes(c.key));

    return (
        <Paper
            elevation={6}
            sx={{
                width: { xs: "auto", sm: 340 },
                maxHeight: { xs: "55%", sm: "calc(100% - 32px)" },
                overflowY: "auto",
                p: 2,
                borderRadius: 4,
                borderTop: "4px solid",
                borderTopColor: tone,
                bgcolor: alpha(theme.palette.background.paper, 0.97),
            }}
        >
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.15rem", lineHeight: 1.2 }}>{place.label}</Typography>
                    <Typography variant="body2" color="text.secondary">{place.does}</Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRounded fontSize="small" /></IconButton>
            </Stack>

            {events.length > 0 && (
                <>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>Here this day · {events.length}</Typography>
                    <Stack spacing={0.25} sx={{ maxHeight: 180, overflowY: "auto" }}>
                        {events.map(({ event: e, index }) => {
                            const isCurrent = e.key === currentKey;
                            const color = e.bad ? theme.palette.error.main : theme.palette[KIND_COLOR[e.kind]].main;
                            return (
                                <ButtonBase key={e.key} onClick={() => onEvent(index)}
                                    sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.5, borderRadius: 2, textAlign: "left", opacity: e.at <= time || isCurrent ? 1 : 0.5,
                                        bgcolor: isCurrent ? alpha(color, 0.14) : "transparent", "&:hover": { bgcolor: "action.hover" } }}>
                                    <Typography variant="caption" sx={{ width: 36, flexShrink: 0, fontWeight: 800, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{hhmm(e.at)}</Typography>
                                    <Box sx={{ width: 3, alignSelf: "stretch", borderRadius: 1, bgcolor: color, flexShrink: 0 }} />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: isCurrent ? 900 : 700, lineHeight: 1.25 }}>{e.what}</Typography>
                                        <Typography variant="caption" color="text.secondary">{e.reference}</Typography>
                                    </Box>
                                </ButtonBase>
                            );
                        })}
                    </Stack>
                </>
            )}

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>What happens here</Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                {place.happens.map((line) => (
                    <Typography key={line} component="li" variant="body2" sx={{ mb: 0.5 }}>{line}</Typography>
                ))}
            </Box>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1 }}>Who works here</Typography>
            <Stack spacing={1}>
                {place.roles.map((role) => (
                    <Stack key={role} direction="row" spacing={1.25} alignItems="center">
                        <RoleAvatar role={role} size={32} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{identityFor(role).label}</Typography>
                            <Typography variant="caption" color="text.secondary">{identityFor(role).does}</Typography>
                        </Box>
                    </Stack>
                ))}
            </Stack>

            {place.cells && (() => {
                const { cells } = hubLayout(place);
                return (
                    <>
                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>Floor</Typography>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={`${cells.length} cells of 1 m²`} sx={{ fontWeight: 700 }} />
                            <Chip size="small" variant="outlined" label={`${cells[0].name}–${cells[cells.length - 1].name}`} />
                            <Chip size="small" variant="outlined" label="2 m walkway" />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            Zoom in to see each cell. Stock will be placed into cells by its volume.
                        </Typography>
                    </>
                );
            })()}

            {chapters.length > 0 && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                    {chapters.map((chapter) => (
                        <Button key={chapter.key} variant="outlined" startIcon={<MenuBookRounded />} onClick={() => onOpenChapter(chapter.key)}
                            sx={{ justifyContent: "flex-start", borderRadius: 999, fontWeight: 800 }}>
                            Read “{chapter.title}”
                        </Button>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
