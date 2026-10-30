import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Chip, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery } from "@mui/material";
import DirectionsRunRounded from "@mui/icons-material/DirectionsRunRounded";
import DirectionsWalkRounded from "@mui/icons-material/DirectionsWalkRounded";
import FullscreenExitRounded from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import MapRounded from "@mui/icons-material/MapRounded";
import VideocamRounded from "@mui/icons-material/VideocamRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { alpha, useTheme } from "@mui/material/styles";
import { setGame, useGame, type GameView } from "./gameStore";

/**
 * Play's top bar: Practice or Live, the camera choice, and how to walk.
 * Live shows only to someone who may do the job for real (permissions.ts),
 * and while it is on a red LIVE badge stays up.
 *
 * On a screen wider than it is tall (`inBar`), the controls ride in the world's top bar, beside the title, so they
 * take no room from the view; the walking hint stays where it was.
 *
 * On a phone they are one compact row of icon buttons (as a game keeps its corner buttons small): the camera views
 * are icons with their names as labels, and the walking hint shows a few seconds, then folds into a "?" button.
 */

/** The camera views, with an icon for the compact (phone) row. */
const VIEWS: { value: GameView; label: string; icon: React.ReactNode }[] = [
    { value: "follow", label: "Follow", icon: <VideocamRounded fontSize="small" /> },
    { value: "first", label: "First person", icon: <VisibilityRounded fontSize="small" /> },
    { value: "director", label: "Director", icon: <MapRounded fontSize="small" /> },
];

/** How long the walking hint stays before it folds into the "?" button. */
const HINT_MS = 8000;
export default function GameHud({ canGoLive, onLive, inBar = null }: { canGoLive: boolean; onLive: (on: boolean) => void; inBar?: HTMLElement | null }) {
    const theme = useTheme();
    const game = useGame();
    const glass = alpha(theme.palette.background.paper, 0.92);
    // A touch screen gets the tap-and-drag hint; a mouse and keyboard, the keys.
    const coarse = useMediaQuery("(pointer: coarse)");
    // A phone held upright: icons only, one row.
    const compact = useMediaQuery(theme.breakpoints.down("sm")) && !inBar;
    const live = game.live;
    const [hintShown, setHintShown] = useState(true);
    useEffect(() => {
        if (!hintShown) return;
        const timer = window.setTimeout(() => setHintShown(false), HINT_MS);
        return () => window.clearTimeout(timer);
    }, [hintShown]);
    // The browser's full screen, where the device has one (not an iPhone's Safari): the page chrome goes and the world fills the display.
    const canFull = typeof document !== "undefined" && document.fullscreenEnabled === true;
    const [full, setFull] = useState(typeof document !== "undefined" && document.fullscreenElement !== null);
    useEffect(() => {
        const onChange = () => setFull(document.fullscreenElement !== null);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggleFull = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
    };

    const pills = (
            <Stack direction="row" spacing={compact ? 0.5 : 1} alignItems="center" sx={{ pointerEvents: "auto", p: 0.5, pl: compact ? 0.5 : 1, borderRadius: 999, bgcolor: glass, boxShadow: 3, flexWrap: inBar || compact ? "nowrap" : "wrap", justifyContent: "center", border: live ? "2px solid" : "none", borderColor: "error.main", maxWidth: "100%", overflowX: inBar ? "auto" : "visible", scrollbarWidth: "none" }}>
                {/* On a phone the switch beside it already says Practice or Live; only LIVE keeps a (short) chip there. In the top bar the chip is short everywhere. */}
                {inBar
                    ? <Chip size="small" color={live ? "error" : "info"} label={live ? "LIVE" : "Practice"} sx={{ fontWeight: 900, display: canGoLive ? "none" : "inline-flex" }} />
                    : <Chip size="small" color={live ? "error" : "info"} label={live ? "LIVE: drops make real records" : "Practice: nothing is saved"} sx={{ fontWeight: 900, display: { xs: "none", sm: "inline-flex" } }} />}
                {live && !inBar && <Chip size="small" color="error" label="LIVE" sx={{ fontWeight: 900, display: { xs: "inline-flex", sm: "none" } }} />}
                {canGoLive && (
                    <ToggleButtonGroup size="small" exclusive value={live ? "live" : "practice"} disabled={game.saving} onChange={(_, next: string | null) => next && onLive(next === "live")} aria-label="Practice or Live">
                        <ToggleButton value="practice" sx={{ fontWeight: 800, px: compact ? 0.9 : 1.25, py: compact ? 0.4 : undefined, fontSize: compact ? "0.75rem" : undefined, textTransform: "none" }}>Practice</ToggleButton>
                        <ToggleButton value="live" sx={{ fontWeight: 800, px: compact ? 0.9 : 1.25, py: compact ? 0.4 : undefined, fontSize: compact ? "0.75rem" : undefined, textTransform: "none", "&.Mui-selected": { bgcolor: "error.main", color: "error.contrastText", "&:hover": { bgcolor: "error.dark" } } }}>Live</ToggleButton>
                    </ToggleButtonGroup>
                )}
                <Tooltip title={game.run ? "Running (R or Shift to walk)" : "Walking (R or Shift to run)"}>
                    <ToggleButton size="small" value="run" selected={game.run} onChange={() => setGame({ run: !game.run })} aria-label="Run" aria-pressed={game.run}
                        sx={{ fontWeight: 800, px: 1.1, textTransform: "none", gap: 0.5, borderRadius: 999 }}>
                        {game.run ? <DirectionsRunRounded fontSize="small" /> : <DirectionsWalkRounded fontSize="small" />}
                        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{game.run ? "Run" : "Walk"}</Box>
                    </ToggleButton>
                </Tooltip>
                <ToggleButtonGroup size="small" exclusive value={game.view} onChange={(_, next: GameView | null) => next && setGame({ view: next })} aria-label="Camera">
                    {VIEWS.map((view) => (
                        <ToggleButton key={view.value} value={view.value} aria-label={view.label} title={view.label}
                            sx={{ fontWeight: 800, px: compact ? 0.8 : 1.25, py: compact ? 0.5 : undefined, textTransform: "none" }}>
                            {compact ? view.icon : view.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                {canFull && (
                    <Tooltip title={full ? "Leave full screen" : "Full screen"}>
                        <IconButton size="small" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"}>
                            {full ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                )}
                {/* The walking hint, folded away: the last button of the row brings it back. */}
                {!game.hinted && !hintShown && (
                    <Tooltip title="How to move">
                        <IconButton size="small" onClick={() => setHintShown(true)} aria-label="How to move">
                            <HelpOutlineRounded fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
    );

    return (
        <>
            {inBar ? createPortal(pills, inBar) : null}
        <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none" }}>
            {!inBar && pills}
            {/* How to walk: until the worker has first walked on this device, for a few seconds (tap to close); then the
                "?" at the end of the controls brings it back. */}
            {!game.hinted && hintShown && (
                <Box onClick={() => setHintShown(false)} sx={{ pointerEvents: "auto", cursor: "pointer", px: 1.5, py: 0.5, borderRadius: 999, bgcolor: glass, boxShadow: 1, maxWidth: "calc(100vw - 16px)" }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                        {coarse
                            ? "Left thumb: move · right thumb: look · tap the ground to walk · ⤴ jumps · pinch zooms"
                            : "Click the ground to walk there, or W A S D · Space jumps · E does the action · drag to look round · scroll in to see through their eyes (V) and zoom to read · R run"}
                    </Typography>
                </Box>
            )}
        </Stack>
        </>
    );
}
