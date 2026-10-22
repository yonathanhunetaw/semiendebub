import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GuideApp } from "@/Components/Guide/chapters";
import { runCountLive, runStepLive } from "./actions";
import {
    RUN_STEPS, STEP_LABEL, actorOf, advance, badCount, cannotTake, differences, expectedCounts, markCounted, mayTake, needsSignature, nextStep, open, refreshRuns, setCount, startRuns, zoneOfStep,
    type Count, type PlaceKey, type RunProgress, type RunStep, type RunsState,
} from "./handoff";
import type { GameScene } from "./GameScene";
import { getGame, setGame } from "./gameStore";
import { runApp } from "./permissions";
import type { ZoneKey } from "./zones";

/**
 * The hand-off after Mark prepared, the screen side (handoff.ts for the
 * rules): the courier starts, checks, signs and arrives; the receiving dock
 * checks, counts and signs. One worker plays each person in turn (the vest
 * changes colour with the courier). Practice saves nothing. Live sends each
 * step to the viewer's own app (actions.ts), only for the steps the server
 * lists for them, then reads the list again: the server is the truth.
 */

export type RunNote = { tone: "success" | "info" | "warning" | "error"; text: string };

const PLACE_NAME: Record<PlaceKey, string> = { main_hub_a: "Main Hub A", main_hub_b: "Main Hub B", remote_hub: "the Remote Hub", store_floor: "the shop" };

export const ZONES_OF_RUNS: ZoneKey[] = ["truck", "remote_door", "store_door"];

/** The zones where a run has a step waiting (for the viewer, in Live). */
export function runZones(runs: RunsState | null, live: boolean): ZoneKey[] {
    if (!runs) return [];
    const keys = new Set<ZoneKey>();
    for (const run of open(runs)) {
        const step = nextStep(run);
        if (step && (!live || mayTake(run, step))) keys.add(zoneOfStep(run, step));
    }
    return [...keys];
}

/** The runs that have a step waiting at this zone. */
export function runsAt(runs: RunsState | null, zone: ZoneKey | null, live: boolean): RunProgress[] {
    if (!runs || !zone) return [];
    return open(runs).filter((run) => {
        const step = nextStep(run);
        return step !== null && zoneOfStep(run, step) === zone && (!live || mayTake(run, step));
    });
}

export function useRuns(app: GuideApp, jobs: import("./handoff").RunJob[] | null, scene: () => GameScene | null, note: (n: RunNote) => void, reread: () => void) {
    // A fresh list: Live reads the server's; Practice keeps the steps taken this session.
    useEffect(() => {
        if (!jobs) return;
        const current = getGame().runs;
        setGame({ runs: current ? refreshRuns(current, jobs, getGame().live) : startRuns(jobs) });
    }, [jobs]);

    const busy = useRef(false);

    /** Take a step. `signature` is the drawn PNG when the step signs. */
    const perform = useCallback(async (shipmentId: number, step: RunStep, signature?: string) => {
        const runs = getGame().runs;
        const run = runs?.[shipmentId];
        if (!runs || !run || busy.current) return;
        const reason = cannotTake(run, step, signature !== undefined);
        if (reason) return note({ tone: "warning", text: reason });
        const live = getGame().live;
        if (live && (!runApp(app) || !mayTake(run, step))) return note({ tone: "warning", text: `Not your step: ${STEP_LABEL[step].toLowerCase()} belongs to ${actorOf(step) === "courier" ? "the driver carrying this run" : "the people who work the receiving dock"}.` });

        if (live) {
            busy.current = true;
            setGame({ saving: true });
            const answer = await runStepLive(app, run.job, step, signature);
            busy.current = false;
            setGame({ saving: false });
            if (!answer.ok) return note({ tone: "error", text: answer.message });
            note({ tone: "success", text: `${answer.message} (for real)` });
            reread();
        }

        const result = advance(getGame().runs ?? runs, shipmentId, step, signature !== undefined);
        if (result.ok) setGame({ runs: result.state });
        if (actorOf(step) === "courier") scene()?.setCourier(true);
        if (step === "receiver_check") scene()?.setCourier(false);
        if (!live) note({ tone: "info", text: `${run.job.reference}: ${STEP_LABEL[step].toLowerCase()}. Practice: nothing was saved.` });
    }, [app, scene, note, reread]);

    /** Change one line's count (a number typed); refused with the reason. */
    const count = useCallback((shipmentId: number, variantId: number, next: Count) => {
        const runs = getGame().runs;
        if (!runs) return;
        const result = setCount(runs, shipmentId, variantId, next);
        if (result.ok) setGame({ runs: result.state });
        else note({ tone: "warning", text: result.reason });
    }, [note]);

    /** Save the count: Live posts it to the Receiving route first; the sign step opens after. */
    const saveCount = useCallback(async (shipmentId: number) => {
        const runs = getGame().runs;
        const run = runs?.[shipmentId];
        if (!runs || !run || busy.current) return;
        if (run.done !== 5) return note({ tone: "warning", text: "Check the goods first, then count them." });
        const counts = run.counts ?? expectedCounts(run.job);
        for (const line of run.job.lines) {
            const reason = badCount(counts[line.variantId] ?? { received: line.quantity, damaged: 0 });
            if (reason) return note({ tone: "warning", text: `${line.name}: ${reason}` });
        }
        if (getGame().live) {
            // Only the stock keeper app has the count route (Receiving); another app signs the goods in as the manifest says.
            if (app !== "stock_keeper") {
                note({ tone: "info", text: "Your app has no count page: the goods are signed in as the manifest says." });
                setGame({ runs: markCounted(getGame().runs ?? runs, shipmentId) });
                return;
            }
            busy.current = true;
            setGame({ saving: true });
            const answer = await runCountLive(run.job, counts);
            busy.current = false;
            setGame({ saving: false });
            if (!answer.ok) return note({ tone: "error", text: answer.message });
            note({ tone: "success", text: `${answer.message} (for real)` });
        } else {
            note({ tone: "info", text: "Count saved. Practice: nothing was saved." });
        }
        setGame({ runs: markCounted(getGame().runs ?? runs, shipmentId) });
    }, [app, note]);

    return { perform, count, saveCount };
}

/** A pad to sign on: pointer drawn, handed on as a PNG data URL once something is drawn. */
export function SignaturePad({ onChange, disabled = false }: { onChange: (png: string | null) => void; disabled?: boolean }) {
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const inked = useRef(false);

    const at = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        return { x: ((event.clientX - box.left) / box.width) * event.currentTarget.width, y: ((event.clientY - box.top) / box.height) * event.currentTarget.height };
    };
    const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const ctx = event.currentTarget.getContext("2d");
        if (!ctx) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        const p = at(event);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#111";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        // A dot for a tap.
        ctx.lineTo(p.x + 0.1, p.y + 0.1);
        ctx.stroke();
    };
    const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        const ctx = event.currentTarget.getContext("2d");
        if (!ctx) return;
        const p = at(event);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        inked.current = true;
    };
    const up = () => {
        if (!drawing.current) return;
        drawing.current = false;
        if (inked.current && canvas.current) onChange(canvas.current.toDataURL("image/png"));
    };
    const clear = () => {
        const el = canvas.current;
        el?.getContext("2d")?.clearRect(0, 0, el.width, el.height);
        inked.current = false;
        onChange(null);
    };

    return (
        <Box>
            <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", touchAction: "none" }}>
                <canvas ref={canvas} data-testid="signature-pad" width={360} height={110} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                    style={{ width: "100%", height: 90, display: "block", touchAction: "none" }} />
            </Box>
            <Button size="small" onClick={clear} sx={{ textTransform: "none", fontWeight: 800 }}>Clear</Button>
        </Box>
    );
}

/** The run's six steps as dots: done, next, to come. */
function Steps({ run }: { run: RunProgress }) {
    return (
        <Stack direction="row" spacing={0.5} alignItems="center" aria-label={`${run.done} of ${RUN_STEPS.length} steps done`}>
            {RUN_STEPS.map((step, i) => (
                <Box key={step} title={STEP_LABEL[step]} sx={{ flex: 1, height: 6, borderRadius: 999, bgcolor: i < run.done ? "success.main" : i === run.done ? "primary.main" : "action.disabledBackground" }} />
            ))}
        </Stack>
    );
}

/** What is waiting at the zone you stand in: each run's next step, with its signature or count. */
export function RunCards({ runs, zone, live, saving, onStep, onCount, onSaveCount, onClose }: {
    runs: RunProgress[];
    zone: ZoneKey;
    live: boolean;
    saving: boolean;
    onStep: (shipmentId: number, step: RunStep, signature?: string) => void;
    onCount: (shipmentId: number, variantId: number, count: Count) => void;
    onSaveCount: (shipmentId: number) => void;
    onClose: () => void;
}) {
    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: { xs: "46dvh", sm: "52dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }} noWrap>{zone === "truck" ? "At the platform: the courier's steps" : "At the door: the hand-off"}</Typography>
                <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {runs.map((run) => <RunCard key={run.job.shipmentId} run={run} live={live} saving={saving} onStep={onStep} onCount={onCount} onSaveCount={onSaveCount} />)}
            </Box>
        </Paper>
    );
}

function RunCard({ run, live, saving, onStep, onCount, onSaveCount }: {
    run: RunProgress;
    live: boolean;
    saving: boolean;
    onStep: (shipmentId: number, step: RunStep, signature?: string) => void;
    onCount: (shipmentId: number, variantId: number, count: Count) => void;
    onSaveCount: (shipmentId: number) => void;
}) {
    const step = nextStep(run);
    const [signature, setSignature] = useState<string | null>(null);
    useEffect(() => setSignature(null), [step, run.job.shipmentId]);
    if (!step) return null;

    const id = run.job.shipmentId;
    const counting = run.done === 5;
    const counts = run.counts ?? expectedCounts(run.job);
    const diffs = differences(run);
    const signing = needsSignature(step);
    const blocked = cannotTake(run, step, signature !== null);
    const actor = actorOf(step);

    return (
        <Stack spacing={1} sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }} data-testid={`run-${run.job.reference}`}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>{run.job.reference}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {PLACE_NAME[run.job.origin]} → {PLACE_NAME[run.job.destination]}{run.job.courier ? ` · ${run.job.courier}` : ""}
                    </Typography>
                </Box>
                <Chip size="small" color={actor === "courier" ? "secondary" : "default"} label={actor === "courier" ? "As the courier" : "As the receiving dock"} sx={{ fontWeight: 800 }} />
            </Stack>
            <Steps run={run} />

            {counting && (
                <Stack spacing={0.75}>
                    <Typography variant="caption" color="text.secondary">Count what arrived. Damaged units are part of what arrived.</Typography>
                    {run.job.lines.map((line) => {
                        const c = counts[line.variantId] ?? { received: line.quantity, damaged: 0 };
                        const bad = badCount(c);
                        return (
                            <Stack key={line.variantId} direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }} noWrap>{line.name} <Typography component="span" variant="caption" color="text.secondary">({line.quantity} {line.unit})</Typography></Typography>
                                <TextField size="small" type="number" label="Got" value={c.received} disabled={saving || run.counted} error={bad !== null}
                                    onChange={(e) => onCount(id, line.variantId, { ...c, received: Number(e.target.value) })} slotProps={{ htmlInput: { min: 0, "data-testid": `got-${line.variantId}` } }} sx={{ width: 76 }} />
                                <TextField size="small" type="number" label="Bad" value={c.damaged} disabled={saving || run.counted} error={bad !== null}
                                    onChange={(e) => onCount(id, line.variantId, { ...c, damaged: Number(e.target.value) })} slotProps={{ htmlInput: { min: 0, "data-testid": `bad-${line.variantId}` } }} sx={{ width: 76 }} />
                            </Stack>
                        );
                    })}
                    {diffs.length > 0 && <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700 }}>{diffs.length} {diffs.length === 1 ? "line differs" : "lines differ"} from the manifest: the difference is logged under Receiving when you sign.</Typography>}
                    {!run.counted && (
                        <Button variant="outlined" size="small" disabled={saving} onClick={() => onSaveCount(id)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>
                            {live ? "Save the count for real" : "Save the count"}
                        </Button>
                    )}
                    {run.counted && <Typography variant="caption" color="success.main" sx={{ fontWeight: 800 }}>Count saved. Sign to land the goods.</Typography>}
                </Stack>
            )}

            {signing && (!counting || run.counted) && <SignaturePad onChange={setSignature} disabled={saving} />}

            {(!counting || step === "receiver_sign") && (
                <Button variant="contained" color={live ? "error" : "primary"} disabled={saving || (counting && !run.counted) || blocked !== null && !signing}
                    onClick={() => onStep(id, step, signature ?? undefined)} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none" }}>
                    {live ? `${STEP_LABEL[step]} (for real)` : STEP_LABEL[step]}
                </Button>
            )}
            {signing && blocked !== null && (!counting || run.counted) && <Typography variant="caption" color="text.secondary">{blocked}</Typography>}
        </Stack>
    );
}

/** The run's next step as a line for the goals list. */
export function runGoal(run: RunProgress, live: boolean): { text: string; go: ZoneKey } | null {
    const step = nextStep(run);
    if (!step) return null;
    if (live && !mayTake(run, step)) return null;
    return { text: `${run.job.reference}: ${STEP_LABEL[step].toLowerCase()} →`, go: zoneOfStep(run, step) };
}
