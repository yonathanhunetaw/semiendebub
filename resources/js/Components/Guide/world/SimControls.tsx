import { useState } from "react";
import { Box, Button, Chip, Divider, IconButton, ListSubheader, Menu, MenuItem, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ScienceRounded from "@mui/icons-material/ScienceRounded";
import StopRounded from "@mui/icons-material/StopRounded";

/**
 * The simulation, started by whoever is watching: a shop day the simulator played through the real app (make sim,
 * recorded by make sim-export into public/demo/world/) unfolds from the moment they press start, at the speed they
 * pick. Nothing touches the database; every viewer runs their own.
 */

export const SIM_SPEEDS = [
    { value: 1, label: "Real time", short: "1×" },
    { value: 60, label: "1 hour a minute", short: "60×" },
    { value: 300, label: "1 hour in 12 s", short: "300×" },
] as const;

export interface SimState {
    day: string;
    speed: number;
    running: boolean;
    /** The day's last event has happened. */
    over: boolean;
}

const dayName = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });

/** The top bar's button: choose a day and a speed, start. */
export function SimStart({ days, onStart, onBrowse }: { days: string[]; onStart: (day: string, speed: number) => void; onBrowse: () => void }) {
    const theme = useTheme();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [speed, setSpeed] = useState<number>(60);
    const glass = alpha(theme.palette.background.paper, 0.92);

    return (
        <>
            <Button onClick={(event) => setAnchor(event.currentTarget)} startIcon={<ScienceRounded />} aria-haspopup="menu" aria-expanded={anchor !== null}
                sx={{ pointerEvents: "auto", borderRadius: 999, fontWeight: 800, textTransform: "none", bgcolor: glass, boxShadow: 2, color: "text.primary", minWidth: 0,
                    "&:hover": { bgcolor: "background.paper" }, "& .MuiButton-startIcon": { mr: { xs: 0, sm: 1 } } }}>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Start simulation</Box>
            </Button>
            <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { borderRadius: 3, width: 340, maxWidth: "calc(100vw - 16px)" } } }}>
                <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
                    <Typography sx={{ fontWeight: 900 }}>Watch a shop day happen</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        A day of the Main Store, played by the simulator through the real app: about 100,000 birr of sales, the morning shipment,
                        keys, cash and closing. Made-up staff and customers; nothing real changes.
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 800, display: "block", mt: 1.5, mb: 0.5 }}>Speed</Typography>
                    <ToggleButtonGroup size="small" exclusive fullWidth value={speed} onChange={(_, next: number | null) => next && setSpeed(next)} aria-label="Speed">
                        {SIM_SPEEDS.map((s) => (
                            <ToggleButton key={s.value} value={s.value} sx={{ textTransform: "none", fontWeight: 800, flexDirection: "column", lineHeight: 1.2, py: 0.5 }}>
                                {s.short}
                                <Box component="span" sx={{ fontSize: "0.65rem", fontWeight: 600, opacity: 0.8 }}>{s.label}</Box>
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>
                <Divider />
                <ListSubheader sx={{ lineHeight: "32px", fontWeight: 800 }}>Start a day from now</ListSubheader>
                {days.map((day) => (
                    <MenuItem key={day} onClick={() => { setAnchor(null); onStart(day, speed); }} sx={{ gap: 1, fontWeight: 700 }}>
                        <PlayArrowRounded fontSize="small" color="primary" />
                        {dayName(day)}
                    </MenuItem>
                ))}
                <Divider />
                <MenuItem onClick={() => { setAnchor(null); onBrowse(); }} sx={{ fontWeight: 700, color: "text.secondary" }}>
                    Or browse the whole week, event by event
                </MenuItem>
            </Menu>
        </>
    );
}

/** While it runs: the shop clock, the speed, pause and stop; when the day is over, start another. */
export function SimBar({ sim, clock, onSpeed, onPause, onResume, onStop, onAnother }: {
    sim: SimState; clock: string; onSpeed: (speed: number) => void; onPause: () => void; onResume: () => void; onStop: () => void; onAnother: () => void;
}) {
    const theme = useTheme();
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ pointerEvents: "auto", p: 0.5, pl: 1.25, borderRadius: 999, bgcolor: alpha(theme.palette.background.paper, 0.94), boxShadow: 3, border: "2px solid", borderColor: "secondary.main", maxWidth: "100%", overflowX: "auto", scrollbarWidth: "none" }}>
            <Chip size="small" color="secondary" label={sim.over ? "Day over" : sim.running ? "SIMULATION" : "Paused"} sx={{ fontWeight: 900 }} />
            <Typography sx={{ fontWeight: 900, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{dayName(sim.day).split(",")[0]} · {clock}</Typography>
            <ToggleButtonGroup size="small" exclusive value={sim.speed} onChange={(_, next: number | null) => next && onSpeed(next)} aria-label="Simulation speed">
                {SIM_SPEEDS.map((s) => (
                    <ToggleButton key={s.value} value={s.value} title={s.label} sx={{ textTransform: "none", fontWeight: 800, px: 1, py: 0.25 }}>{s.short}</ToggleButton>
                ))}
            </ToggleButtonGroup>
            {sim.over
                ? <Button size="small" variant="contained" color="secondary" onClick={onAnother} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none", whiteSpace: "nowrap" }}>Another day</Button>
                : (
                    <Tooltip title={sim.running ? "Pause" : "Carry on from here"}>
                        <IconButton size="small" onClick={sim.running ? onPause : onResume} aria-label={sim.running ? "Pause the simulation" : "Resume the simulation"}>
                            {sim.running ? <PauseRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                )}
            <Tooltip title="Stop: back to the real shop">
                <IconButton size="small" onClick={onStop} aria-label="Stop the simulation"><StopRounded fontSize="small" /></IconButton>
            </Tooltip>
        </Stack>
    );
}
