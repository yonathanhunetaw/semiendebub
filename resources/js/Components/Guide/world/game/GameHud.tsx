import { Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from "@mui/material";
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
                <ToggleButtonGroup size="small" exclusive value={game.view} onChange={(_, next: GameView | null) => next && setGame({ view: next })} aria-label="Camera">
                    <ToggleButton value="follow" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>Follow</ToggleButton>
                    <ToggleButton value="director" sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }}>Director</ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            {/* How to walk, until the worker has first walked on this device. */}
            {!game.hinted && <Box sx={{ px: 1.5, py: 0.5, borderRadius: 999, bgcolor: glass, boxShadow: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                    {coarse
                        ? "Tap the ground to walk there, or drag to steer · pinch to zoom"
                        : "Click the ground to walk there, or W A S D / arrows · Shift to hurry · scroll to zoom"}
                </Typography>
            </Box>}
        </Stack>
    );
}
