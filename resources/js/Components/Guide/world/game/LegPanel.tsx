import { useCallback, useEffect, useRef } from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GuideApp } from "@/Components/Guide/chapters";
import { legStepLive } from "./actions";
import type { PlaceKey } from "./handoff";
import {
    LEG_STEP_LABEL, advanceLeg, badLegCount, cannotTakeLeg, coveredByRelay, mayTakeLeg, nextLegStep, openLegs, refreshLegs, setLegCount, startLegs, zoneOfLeg,
    type LegJob, type LegProgress, type LegStep, type LegsState,
} from "./legs";
import { getGame, setGame } from "./gameStore";
import { runApp } from "./permissions";
import type { ZoneKey } from "./zones";

/**
 * Transfers between sites, the screen side (legs.ts for the rules): accept a
 * refill, claim, dispatch, hand over, check & receive, or cancel. Each person
 * does their own step on their own app, so Live offers only the steps the
 * server lists for the viewer and the world reads the list again after each.
 * Practice walks the same order with nothing saved; the Remote Hub → floor
 * start stays with the relay (relay.ts) there.
 */

export type LegNote = { tone: "success" | "info" | "warning" | "error"; text: string };

const PLACE_NAME: Record<PlaceKey, string> = { main_hub_a: "Main Hub A", main_hub_b: "Main Hub B", remote_hub: "the Remote Hub", store_floor: "the shop" };

export const ZONES_OF_LEGS: ZoneKey[] = ["truck", "remote", "remote_door", "store_door"];

/** The legs with a step the viewer can take (Live), or any step (Practice, except what the relay plays). */
function actionable(state: LegsState | null, live: boolean): Array<{ leg: LegProgress; step: LegStep }> {
    if (!state) return [];
    const out: Array<{ leg: LegProgress; step: LegStep }> = [];
    for (const leg of openLegs(state)) {
        const step = nextLegStep(leg);
        if (!step) continue;
        if (live ? !mayTakeLeg(leg, step) : coveredByRelay(leg.job, leg.stage)) continue;
        out.push({ leg, step });
    }
    return out;
}

export function legZones(state: LegsState | null, live: boolean): ZoneKey[] {
    return [...new Set(actionable(state, live).map(({ leg, step }) => zoneOfLeg(leg, step) as ZoneKey))];
}

/** The legs whose next step is taken at this zone. */
export function legsAt(state: LegsState | null, zone: ZoneKey | null, live: boolean): LegProgress[] {
    if (!state || !zone) return [];
    return actionable(state, live).filter(({ leg, step }) => zoneOfLeg(leg, step) === zone).map(({ leg }) => leg);
}

export function legGoal(leg: LegProgress, live: boolean): { text: string; go: ZoneKey } | null {
    const step = nextLegStep(leg);
    if (!step || (live ? !mayTakeLeg(leg, step) : coveredByRelay(leg.job, leg.stage))) return null;
    return { text: `${leg.job.reference}: ${LEG_STEP_LABEL[step].toLowerCase()} →`, go: zoneOfLeg(leg, step) as ZoneKey };
}

export function useLegs(app: GuideApp, jobs: LegJob[] | null, note: (n: LegNote) => void, reread: () => void) {
    useEffect(() => {
        if (!jobs) return;
        const current = getGame().legs;
        setGame({ legs: current ? refreshLegs(current, jobs, getGame().live) : startLegs(jobs) });
    }, [jobs]);

    const busy = useRef(false);

    const perform = useCallback(async (key: string, step: LegStep) => {
        const legs = getGame().legs;
        const leg = legs?.[key];
        if (!legs || !leg || busy.current) return;
        const live = getGame().live;
        const reason = cannotTakeLeg(leg, step, live);
        if (reason) return note({ tone: "warning", text: reason });
        if (live && (!runApp(app) || !mayTakeLeg(leg, step))) return note({ tone: "warning", text: "Not your step: someone else on this transfer takes it." });

        if (live) {
            busy.current = true;
            setGame({ saving: true });
            const answer = await legStepLive(app, leg.job, step, step === "complete" ? { received: leg.received, damaged: leg.damaged } : undefined);
            busy.current = false;
            setGame({ saving: false });
            if (!answer.ok) return note({ tone: "error", text: answer.message });
            note({ tone: "success", text: `${answer.message} (for real)` });
            reread();
        } else {
            note({ tone: "info", text: `${leg.job.reference}: ${LEG_STEP_LABEL[step].toLowerCase()}. Practice: nothing was saved.` });
        }
        const result = advanceLeg(getGame().legs ?? legs, key, step);
        if (result.ok) setGame({ legs: result.state });
    }, [app, note, reread]);

    const count = useCallback((key: string, received: number, damaged: number) => {
        const legs = getGame().legs;
        if (!legs) return;
        const result = setLegCount(legs, key, received, damaged);
        if (result.ok) setGame({ legs: result.state });
        else note({ tone: "warning", text: result.reason });
    }, [note]);

    return { perform, count };
}

export function LegCards({ legs, zone, live, saving, onStep, onCount, onClose }: {
    legs: LegProgress[];
    zone: ZoneKey;
    live: boolean;
    saving: boolean;
    onStep: (key: string, step: LegStep) => void;
    onCount: (key: string, received: number, damaged: number) => void;
    onClose: () => void;
}) {
    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: { xs: "40dvh", sm: "46dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }} noWrap>{zone === "store_door" || zone === "remote_door" ? "At the door: transfers" : "Transfers"}</Typography>
                <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {legs.map((leg) => <LegCard key={leg.job.key} leg={leg} live={live} saving={saving} onStep={onStep} onCount={onCount} />)}
            </Box>
        </Paper>
    );
}

function LegCard({ leg, live, saving, onStep, onCount }: {
    leg: LegProgress;
    live: boolean;
    saving: boolean;
    onStep: (key: string, step: LegStep) => void;
    onCount: (key: string, received: number, damaged: number) => void;
}) {
    const step = nextLegStep(leg);
    if (!step) return null;
    const { job } = leg;
    const blocked = cannotTakeLeg(leg, step, live);
    const bad = step === "complete" ? badLegCount(leg.received, leg.damaged) : null;
    const canCancel = !live || mayTakeLeg(leg, "cancel");

    return (
        <Stack spacing={1} sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }} data-testid={`leg-${job.reference}`}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>{job.itemName} · {job.quantity} {job.unit}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {job.reference} · {PLACE_NAME[job.origin]} → {PLACE_NAME[job.destination]}{job.courier ? ` · ${job.courier}` : ""}
                    </Typography>
                </Box>
                {job.awaitsApproval && <Chip size="small" color="warning" label="Awaits approval" />}
            </Stack>
            {step === "complete" && (
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Count what arrived (damaged is part of it).</Typography>
                    <TextField size="small" type="number" label="Got" value={leg.received} error={bad !== null} disabled={saving}
                        onChange={(e) => onCount(job.key, Number(e.target.value), leg.damaged)} slotProps={{ htmlInput: { min: 0, "data-testid": "leg-got" } }} sx={{ width: 76 }} />
                    <TextField size="small" type="number" label="Bad" value={leg.damaged} error={bad !== null} disabled={saving}
                        onChange={(e) => onCount(job.key, leg.received, Number(e.target.value))} slotProps={{ htmlInput: { min: 0, "data-testid": "leg-bad" } }} sx={{ width: 76 }} />
                </Stack>
            )}
            <Stack direction="row" spacing={1}>
                <Button variant="contained" color={live ? "error" : "primary"} disabled={saving || (blocked !== null && step === "complete")} onClick={() => onStep(job.key, step)}
                    sx={{ flex: 1, borderRadius: 999, fontWeight: 900, textTransform: "none" }}>
                    {live ? `${LEG_STEP_LABEL[step]} (for real)` : LEG_STEP_LABEL[step]}
                </Button>
                {canCancel && step !== "accept" && (
                    <Button variant="outlined" color="inherit" disabled={saving} onClick={() => onStep(job.key, "cancel")} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Cancel</Button>
                )}
            </Stack>
            {blocked !== null && step !== "complete" && <Typography variant="caption" color="text.secondary">{blocked}</Typography>}
        </Stack>
    );
}
