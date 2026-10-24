import { useEffect, useState } from "react";
import { Box, Chip, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery } from "@mui/material";
import DirectionsRunRounded from "@mui/icons-material/DirectionsRunRounded";
import DirectionsWalkRounded from "@mui/icons-material/DirectionsWalkRounded";
import FullscreenExitRounded from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import { alpha, useTheme } from "@mui/material/styles";
import { setGame, useGame, type GameView } from "./gameStore";

/**
 * Play's top bar: Practice or Live, the camera choice, and how to walk.
 * Live shows only to someone who may do the job for real (permissions.ts),
 * and while it is on a red LIVE badge stays up.
 */
export default function GameHud({ canGoLive, onLive }: { canGoLive: boolean; onLive: (on: boolean) => void }) {
    const theme = useTheme();
    const game = useGame();
    const glass = alpha(theme.palette.background.paper, 0.92);
    // A touch screen gets the tap-and-drag hint; a mouse and keyboard, the keys.
    const coarse = useMediaQuery("(pointer: coarse)");
    const live = game.live;
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

    return (
        <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ pointerEvents: "auto", p: 0.5, pl: 1, borderRadius: 999, bgcolor: glass, boxShadow: 3, flexWrap: "wrap", justifyContent: "center", border: live ? "2px solid" : "none", borderColor: "error.main" }}>
                {/* On a phone the switch beside it already says Practice or Live; only LIVE keeps a (short) chip there. */}
                <Chip size="small" color={live ? "error" : "info"} label={live ? "LIVE: drops make real records" : "Practice: nothing is saved"} sx={{ fontWeight: 900, display: { xs: "none", sm: "inline-flex" } }} />
                {live && <Chip size="small" color="error" label="LIVE" sx={{ fontWeight: 900, display: { xs: "inline-flex", sm: "none" } }} />}
                {canGoLive && (
                    <ToggleButtonGroup size="small" exclusive value={live ? "live" : "practice"} disabled={game.saving} onChange={(_, next: string | null) => next && onLive(next === "live")} aria-label="Practice or Live">
                        <ToggleButton value="practice" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>Practice</ToggleButton>
                        <ToggleButton value="live" sx={{ fontWeight: 800, px: 1.25, textTransform: "none", "&.Mui-selected": { bgcolor: "error.main", color: "error.contrastText", "&:hover": { bgcolor: "error.dark" } } }}>Live</ToggleButton>
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
                    <ToggleButton value="follow" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>Follow</ToggleButton>
                    <ToggleButton value="first" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>First person</ToggleButton>
                    <ToggleButton value="director" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>Director</ToggleButton>
                </ToggleButtonGroup>
                {canFull && (
                    <Tooltip title={full ? "Leave full screen" : "Full screen"}>
                        <IconButton size="small" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"}>
                            {full ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
            {/* How to walk, until the worker has first walked on this device. */}
            {!game.hinted && <Box sx={{ px: 1.5, py: 0.5, borderRadius: 999, bgcolor: glass, boxShadow: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                    {coarse
                        ? "Tap the ground to walk there · drag on the left to steer, on the right to look · pinch to zoom"
                        : "Click the ground to walk there, or W A S D · drag to look round · scroll in to see through their eyes (V) and zoom to read · R run"}
                </Typography>
            </Box>}
        </Stack>
    );
}
