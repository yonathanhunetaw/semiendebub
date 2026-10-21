import { useCallback, useEffect, useRef } from "react";
import { Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GuideApp } from "@/Components/Guide/chapters";
import { shipmentStepLive } from "./actions";
import { carried, complete, freightBoxesToDraw, inCar, leftAt, linesToRecord, loadIntoCar, putBackAll, refreshLoad, startLoading, take, takeOutOfCar, takeWhatFits, type FreightLoad, type FreightState, type HubKey } from "./freight";
import type { GameScene } from "./GameScene";
import { getGame, kept, setGame, type CarView } from "./gameStore";
import { boxesFor, holdFor, packAll, place, startPacking, type Packing, type Placed } from "./packer";
import { canLoadLive } from "./permissions";
import { MAX_BOXES, MAX_CBM, formatCbm } from "./practice";
import type { ZoneKey } from "./zones";

/**
 * The freight car's side of Play (freight.ts for the rules, packer.ts for
 * the hold): the hook that keeps the car's load and its packing, the list in
 * a hub of what the shipment still needs from it, and the gauge of how full
 * the car is.
 *
 * Practice keeps everything here. Live (someone who works the origin hub's
 * dock, permissions.ts) records the real hand-off as the Shipment page does
 * (actions.ts): picking starts with the first load, a line is ticked picked
 * once all of it is in the car, and "Mark prepared" hands the shipment to
 * the courier. A step the server refuses is undone in the car.
 */

export const HUB_OF: Record<"hub_a" | "hub_b", HubKey> = { hub_a: "main_hub_a", hub_b: "main_hub_b" };
export const ZONE_OF: Record<HubKey, "hub_a" | "hub_b"> = { main_hub_a: "hub_a", main_hub_b: "hub_b" };
const HUB_NAME: Record<HubKey, string> = { main_hub_a: "Main Hub A", main_hub_b: "Main Hub B" };
const PLACE_NAME: Record<string, string> = { remote_hub: "the Remote Hub", store_floor: "the Main Store" };

export type FreightNote = { tone: "success" | "info" | "warning"; text: string };

/** The boxes of what is in the car now, in the order the hold is filled when the car is opened. */
function boxesInCar(state: FreightState) {
    return state.load.lines.flatMap((line) => boxesFor(line.variantId, line.picked + (state.loaded[line.variantId] ?? 0), line.unitCbm));
}

/** Units per line in a packing, to tell whether a fresh list changed what is in the car. */
const unitsIn = (p: Packing | null) => (p ? p.placed.reduce<Record<number, number>>((acc, b) => ({ ...acc, [b.key]: (acc[b.key] ?? 0) + b.units }), {}) : {});
const sameUnits = (a: Record<number, number>, b: Record<number, number>) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => (a[Number(k)] ?? 0) === (b[Number(k)] ?? 0));
};

export function useFreightCar(loads: FreightLoad[] | null, scene: () => GameScene | null, note: (n: FreightNote) => void, app: GuideApp, reread: () => Promise<void>) {
    const packing = useRef<Packing | null>(null);
    /** The shipment just marked prepared: it leaves the list, and that is no surprise. */
    const prepared = useRef<number | null>(null);

    const viewOf = (state: FreightState, p: Packing): CarView => ({
        hold: p.hold,
        label: `${state.load.reference} · ${state.load.vehicle.name ?? "Freight car"}`,
        placed: p.placed,
    });
    const show = useCallback((state: FreightState | null, fresh: Placed[] = []) => {
        const view = state && packing.current ? viewOf(state, packing.current) : null;
        kept.car = view;
        scene()?.setCar(view, fresh);
    }, [scene]);

    /** Pack the car again from scratch: when it is opened, or when the server's figures changed what is in it. */
    const repack = useCallback((state: FreightState | null) => {
        if (!state) {
            packing.current = null;
            return show(null);
        }
        const wanted = boxesInCar(state);
        const units = wanted.reduce<Record<number, number>>((acc, b) => ({ ...acc, [b.key]: (acc[b.key] ?? 0) + b.units }), {});
        const sameCar = packing.current && packing.current.hold.length === holdFor(state.load.vehicle.maxCbm).length;
        if (!sameCar || !sameUnits(unitsIn(packing.current), units)) {
            packing.current = startPacking(holdFor(state.load.vehicle.maxCbm));
            packAll(packing.current, wanted);
        }
        show(state);
    }, [show]);

    // A fresh list: the same shipment carries on with the server's figures; a shipment gone (dispatched) gives way to the next.
    useEffect(() => {
        if (!loads) return;
        const current = getGame().freight;
        const same = current ? loads.find((l) => l.shipmentId === current.load.shipmentId) : undefined;
        const next = same ? refreshLoad(current!, same) : loads[0] ? startLoading(loads[0]) : null;
        if (current && !same && prepared.current !== current.load.shipmentId) note({ tone: "info", text: `${current.load.reference} is no longer waiting to be loaded.` });
        setGame({ freight: next });
        repack(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loads]);

    const choose = (shipmentId: number) => {
        const load = loads?.find((l) => l.shipmentId === shipmentId);
        if (!load) return;
        const next = startLoading(load);
        setGame({ freight: next });
        packing.current = null;
        repack(next);
    };

    const room = () => {
        const state = getGame().freight;
        return state ? MAX_CBM - carried(state).cbm : 0;
    };
    const stack = (state: FreightState, from: ZoneKey | null) => {
        kept.boxes = freightBoxesToDraw(state, MAX_BOXES);
        scene()?.setCarried(kept.boxes, from);
    };

    const takeLine = (variantId: number, units: number, from: ZoneKey) => {
        const state = getGame().freight;
        if (!state) return;
        const result = take(state, variantId, units, room(), carried(state).units === 0);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        setGame({ freight: result.state });
        stack(result.state, from);
    };
    const takeAll = (from: ZoneKey) => {
        const state = getGame().freight;
        if (!state) return;
        const { state: next, units } = takeWhatFits(state, room(), carried(state).units === 0);
        if (units === 0) return note({ tone: "warning", text: "Nothing more fits, or nothing more is needed. Load what you carry first." });
        setGame({ freight: next });
        stack(next, from);
    };
    const putBack = () => {
        const state = getGame().freight;
        if (!state) return;
        const next = putBackAll(state);
        setGame({ freight: next });
        stack(next, null);
    };

    /** Into the car: everything flies in; what the hold has no room for comes back out. In Live, finished lines are recorded. */
    const load = async () => {
        const state = getGame().freight;
        const p = packing.current;
        if (!state || !p || carried(state).units === 0 || getGame().saving) return;
        const live = getGame().live;
        if (live && !canLoadLive(app, state.load)) return note({ tone: "warning", text: "You do not work this hub's dock, so you cannot load it for real. Switch to Practice to try it." });
        const placedNow: Placed[] = [];
        const units: Record<number, number> = {};
        for (const line of state.load.lines) {
            for (const box of boxesFor(line.variantId, state.carrying[line.variantId] ?? 0, line.unitCbm)) {
                const spot = place(p, box);
                if (!spot) continue;
                placedNow.push(spot);
                units[box.key] = (units[box.key] ?? 0) + box.units;
            }
        }
        await scene()?.unloadAt("truck");
        const next = loadIntoCar(state, units);
        setGame({ freight: next });
        show(next, placedNow);
        const loaded = Object.values(units).reduce((a, b) => a + b, 0);
        const left = carried(next).units;
        if (left > 0) stack(next, "truck");
        const full = left > 0 ? ` The car has no room left for ${left} of what you carried: the hold is full for that size.` : "";

        if (!live) {
            const car = inCar(next);
            note({ tone: left > 0 ? "warning" : "success", text: `Loaded ${loaded}. ${state.load.reference}: ${car.units} / ${car.of} in the car. Practice: nothing was picked for real.${full}` });
            return;
        }

        // Live: start picking with the first load, then tick every line now wholly in the car, one by one.
        setGame({ saving: true });
        const toRecord = linesToRecord(next);
        const refused: Array<{ variantId: number; name: string; message: string }> = [];
        let started = state.load.status !== "scheduled" || toRecord.length === 0;
        if (!started) {
            const answer = await shipmentStepLive(state.load, "start_picking");
            started = answer.ok;
            if (!answer.ok) toRecord.forEach((line) => refused.push({ variantId: line.variantId, name: line.name, message: answer.message }));
        }
        if (started) {
            for (const line of toRecord) {
                const answer = await shipmentStepLive(state.load, "pick_line", { variant_id: line.variantId, picked: true });
                if (!answer.ok) refused.push({ variantId: line.variantId, name: line.name, message: answer.message });
            }
        }

        let settled = getGame().freight ?? next;
        if (refused.length > 0) {
            // What the server would not record comes back out of the car, this trip's units of it.
            settled = takeOutOfCar(settled, Object.fromEntries(refused.map((r) => [r.variantId, units[r.variantId] ?? 0])));
            setGame({ freight: settled });
            repack(settled);
            stack(settled, "truck");
            note({ tone: "warning", text: `${refused[0].message} ${refused.map((r) => r.name).join(", ")} came back out of the car.` });
        } else {
            note({
                tone: "success",
                text: toRecord.length > 0
                    ? `Recorded for real: ${toRecord.map((l) => l.name).join(", ")} picked on ${state.load.reference}.${full}`
                    : `Loaded ${loaded}. A line is recorded as picked once all of it is in the car.${full}`,
            });
        }
        setGame({ saving: false });
        await reread();
    };

    /** Live: everything is in; hand the shipment to the courier (ready for pickup). */
    const prepare = async () => {
        const state = getGame().freight;
        if (!state || !getGame().live || !canLoadLive(app, state.load) || getGame().saving) return;
        setGame({ saving: true });
        const answer = await shipmentStepLive(state.load, "prepared");
        setGame({ saving: false });
        if (answer.ok) prepared.current = state.load.shipmentId;
        note(answer.ok
            ? { tone: "success", text: `${state.load.reference} is prepared: the courier checks and signs for it, and then it leaves the hub.` }
            : { tone: "warning", text: answer.message });
        await reread();
    };

    return { choose, takeLine, takeAll, putBack, load, prepare };
}

/** What the car holds against what it can, and of the manifest. */
export function FreightGauge({ state, loads, onChoose, live, canLoad, saving, onPrepare }: {
    state: FreightState;
    loads: FreightLoad[];
    onChoose: (shipmentId: number) => void;
    live: boolean;
    /** May this viewer load it for real (in Live)? */
    canLoad: boolean;
    saving: boolean;
    onPrepare: () => void;
}) {
    const car = inCar(state);
    const share = Math.min(1, car.cbm / car.capacity);
    const untouched = Object.keys(state.loaded).length === 0 && carried(state).units === 0;
    const vehicle = state.load.vehicle;

    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", px: 1.5, py: 1, borderRadius: 4, boxShadow: 3, width: "100%", maxWidth: 420 }}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                    {state.load.reference} → {PLACE_NAME[state.load.destination] ?? state.load.destination}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                    {vehicle.name ?? "Freight car"}{vehicle.plate ? ` · ${vehicle.plate}` : ""}
                </Typography>
            </Stack>
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
                {/* A few small pieces are well under 1%: say so, not "0%". */}
                <Typography sx={{ fontWeight: 900, fontSize: "1.4rem", lineHeight: 1 }}>{car.cbm > 0 && share < 0.01 ? "<1" : Math.round(share * 100)}%</Typography>
                <Tooltip title={vehicle.maxCbm ? "The hold's shape is estimated from the car's volume." : "No volume is recorded for this car: 20 m³ is assumed."}>
                    <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {formatCbm(car.cbm)} / {car.capacity.toFixed(1)} m³ · {car.units} / {car.of} units in the car
                    </Typography>
                </Tooltip>
            </Stack>
            <LinearProgress variant="determinate" value={share * 100} color={share >= 1 ? "error" : share >= 0.95 ? "warning" : share >= 0.8 ? "secondary" : "success"} sx={{ mt: 0.75, height: 10, borderRadius: 999 }} />
            {complete(state) && !(live && canLoad) && (
                <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 0.5, fontWeight: 800 }}>
                    Everything on the manifest is in the car.{live ? "" : " In Live, the next step is to mark it prepared for the courier."}
                </Typography>
            )}
            {complete(state) && live && canLoad && (
                <Button fullWidth variant="contained" color="error" disabled={saving} onClick={onPrepare} sx={{ mt: 1, borderRadius: 999, fontWeight: 900, textTransform: "none" }}>
                    Mark prepared: ready for the courier
                </Button>
            )}
            {live && canLoad && !complete(state) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Live: a line is recorded as picked once all of it is in the car.
                </Typography>
            )}
            {live && !canLoad && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    You do not work {HUB_NAME[state.load.origin]}'s dock, so in Live you can watch this car but not load it. Practice lets you try.
                </Typography>
            )}
            {loads.length > 1 && untouched && (
                <ToggleButtonGroup size="small" exclusive value={state.load.shipmentId} onChange={(_, id: number | null) => id && onChoose(id)} sx={{ mt: 0.75, flexWrap: "wrap" }} aria-label="Which shipment">
                    {loads.map((l) => <ToggleButton key={l.shipmentId} value={l.shipmentId} sx={{ textTransform: "none", fontWeight: 800, py: 0.25 }}>{l.reference}</ToggleButton>)}
                </ToggleButtonGroup>
            )}
        </Paper>
    );
}

/** In a hub: the shipment's lines this hub sends, how many are still needed, and where each sits. */
export function HubPicker({ state, hub, disabled, onTake, onTakeAll, onPutBack, onClose }: {
    state: FreightState;
    hub: HubKey;
    disabled: boolean;
    onTake: (variantId: number, units: number) => void;
    onTakeAll: () => void;
    onPutBack: () => void;
    onClose: () => void;
}) {
    const here = state.load.origin === hub;
    const holding = carried(state).units;

    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: { xs: "34dvh", sm: "40dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }} noWrap>{HUB_NAME[hub]}: for {state.load.reference}</Typography>
                {here && <Button size="small" onClick={onTakeAll} disabled={disabled} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Take what fits</Button>}
                <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {!here && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                        {state.load.reference} leaves from {HUB_NAME[state.load.origin]}: nothing for it here.
                    </Typography>
                )}
                {here && state.load.lines.map((line) => {
                    const left = leftAt(state, line.variantId);
                    const inArms = state.carrying[line.variantId] ?? 0;
                    return (
                        <Stack key={line.variantId} direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", opacity: left === 0 && inArms === 0 ? 0.55 : 1 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{line.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {left} of {line.quantity} {line.unit} still needed · {formatCbm(line.unitCbm)} m³ each{line.guessed ? " (guessed)" : ""}
                                    {inArms > 0 ? ` · ${inArms} in your arms` : ""}
                                </Typography>
                            </Box>
                            {line.area && <Chip size="small" label={`Area ${line.area}`} />}
                            <Button size="small" variant="contained" disabled={disabled || left === 0} onClick={() => onTake(line.variantId, 1)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none", minWidth: 0 }}>Take 1</Button>
                        </Stack>
                    );
                })}
                {holding > 0 && (
                    <Stack direction="row" justifyContent="flex-end" sx={{ px: 1.5, py: 1 }}>
                        <Button size="small" onClick={onPutBack} disabled={disabled} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Put back all {holding}</Button>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
}
