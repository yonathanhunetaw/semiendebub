import { DEFAULT_TRUCK_CBM } from "./packer.ts";
import { GUESSED_UNIT_CBM } from "./practice.ts";

/**
 * Loading the freight car: the rules, pure (`node --test` runs them).
 *
 * The car loads one shipment: one from Main Hub A or B to the Main Store
 * that is scheduled or being picked (WorldFeed::loads). Loading it is the
 * stock keeper's pick: you take units of the manifest's lines in the hub,
 * carry them out to the platform and put them in the car. You can only take
 * what the manifest still needs (its quantity, less what is picked, loaded
 * or in your arms): the car takes nothing that is not on it, and no more
 * than it asks for, as recordPick caps a pick at the manifest's quantity.
 * Units, not whole lines: a line of 30 cartons is several armloads.
 *
 * Practice keeps what you loaded here and saves nothing. Live sends the
 * picks to the real route (actions.ts), which records a line whole: it is
 * ticked "picked" once all of it is in the car (ShipmentHandoffService
 * pick_line). Until then the units you loaded are kept here only.
 */

export type HubKey = "main_hub_a" | "main_hub_b";

export interface FreightLine {
    variantId: number;
    name: string;
    unit: string;
    quantity: number;
    /** Picked already (on the server): in the car when it is opened. */
    picked: number;
    /** One unit's size, m³: the manifest's line size shared out, else the packaging's, else a guess. */
    unitCbm: number;
    guessed: boolean;
    /** The floor area in the hub where the item sits, if the hub has a plan. */
    area: string | null;
}

export interface FreightLoad {
    shipmentId: number;
    reference: string;
    /** On the server: scheduled (not started) or picking. */
    status: string;
    /** May this viewer pick it for real (they work the origin hub's dock)? */
    canPick: boolean;
    origin: HubKey;
    destination: string;
    scheduledFor: string | null;
    vehicle: { name: string | null; plate: string | null; maxCbm: number | null; payloadKg: number | null };
    lines: FreightLine[];
}

export interface FreightState {
    load: FreightLoad;
    /** Units in the worker's arms, by variant. */
    carrying: Record<number, number>;
    /** Units put in the car this session (not yet picked on the server), by variant. */
    loaded: Record<number, number>;
}

export type FreightResult = { ok: true; state: FreightState; units: number } | { ok: false; reason: string };

/** A line's unit size from what the manifest and the packaging say. */
export function unitSize(quantity: number, lineCbm: number | null, unitCbm: number | null): { unitCbm: number; guessed: boolean } {
    if (lineCbm !== null && lineCbm > 0 && quantity > 0) return { unitCbm: lineCbm / quantity, guessed: false };
    if (unitCbm !== null && unitCbm > 0) return { unitCbm, guessed: false };
    return { unitCbm: GUESSED_UNIT_CBM, guessed: true };
}

export function startLoading(load: FreightLoad): FreightState {
    return { load, carrying: {}, loaded: {} };
}

const n = (record: Record<number, number>, variantId: number) => record[variantId] ?? 0;
const lineOf = (state: FreightState, variantId: number) => state.load.lines.find((l) => l.variantId === variantId);

/** Units of a line the manifest still needs that are neither in the car nor in your arms. */
export function leftAt(state: FreightState, variantId: number): number {
    const line = lineOf(state, variantId);
    if (!line) return 0;
    return Math.max(0, line.quantity - line.picked - n(state.loaded, variantId) - n(state.carrying, variantId));
}

export function carried(state: FreightState): { units: number; cbm: number; guessed: boolean } {
    let units = 0;
    let cbm = 0;
    let guessed = false;
    for (const line of state.load.lines) {
        const u = n(state.carrying, line.variantId);
        if (u === 0) continue;
        units += u;
        cbm += u * line.unitCbm;
        guessed = guessed || line.guessed;
    }
    return { units, cbm, guessed };
}

/**
 * Take up to `units` of a line, as many as your arms have `room` (m³) for.
 * With empty arms, one unit always goes, however big.
 */
export function take(state: FreightState, variantId: number, units: number, room: number, handsEmpty: boolean): FreightResult {
    const line = lineOf(state, variantId);
    if (!line) return { ok: false, reason: "That is not on this shipment's manifest." };
    const left = leftAt(state, variantId);
    if (left === 0) return { ok: false, reason: `Nothing more of ${line.name} is needed: the manifest asks for ${line.quantity} ${line.unit}.` };
    const byRoom = Math.floor(room / line.unitCbm + 1e-9);
    const fits = Math.max(byRoom, handsEmpty ? 1 : 0);
    const count = Math.min(units, left, fits);
    if (count <= 0) return { ok: false, reason: `Your arms are full: one ${line.unit} of ${line.name} is ${line.unitCbm.toFixed(3)} m³. Load what you carry first.` };
    return { ok: true, units: count, state: { ...state, carrying: { ...state.carrying, [variantId]: n(state.carrying, variantId) + count } } };
}

/** Take as much as fits, line by line in manifest order. */
export function takeWhatFits(state: FreightState, room: number, handsEmpty: boolean): { state: FreightState; units: number } {
    let next = state;
    let units = 0;
    let free = room;
    let empty = handsEmpty;
    for (const line of state.load.lines) {
        const result = take(next, line.variantId, Number.MAX_SAFE_INTEGER, free, empty);
        if (!result.ok) continue;
        next = result.state;
        units += result.units;
        free -= result.units * line.unitCbm;
        empty = false;
    }
    return { state: next, units };
}

/** Put everything you carry back where it came from. */
export function putBackAll(state: FreightState): FreightState {
    return { ...state, carrying: {} };
}

/** Units go from your arms into the car (those the hold had room for). */
export function loadIntoCar(state: FreightState, unitsByVariant: Record<number, number>): FreightState {
    const carrying = { ...state.carrying };
    const loaded = { ...state.loaded };
    for (const [key, units] of Object.entries(unitsByVariant)) {
        const id = Number(key);
        const moved = Math.min(units, n(carrying, id));
        if (moved <= 0) continue;
        carrying[id] = n(carrying, id) - moved;
        if (carrying[id] === 0) delete carrying[id];
        loaded[id] = n(loaded, id) + moved;
    }
    return { ...state, carrying, loaded };
}

/** What the car holds now: picked before plus loaded this session. */
export function inCar(state: FreightState): { units: number; of: number; cbm: number; capacity: number } {
    let units = 0;
    let of = 0;
    let cbm = 0;
    for (const line of state.load.lines) {
        const u = line.picked + n(state.loaded, line.variantId);
        units += u;
        of += line.quantity;
        cbm += u * line.unitCbm;
    }
    return { units, of, cbm, capacity: state.load.vehicle.maxCbm ?? DEFAULT_TRUCK_CBM };
}

/**
 * Lines now wholly in the car (all of it loaded) that the server has
 * not yet recorded as picked: the ones to tick for real.
 */
export function linesToRecord(state: FreightState): FreightLine[] {
    return state.load.lines.filter((line) => line.picked < line.quantity && line.picked + n(state.loaded, line.variantId) >= line.quantity);
}

/** Undo loading: units go from the car back into your arms (what the server refused). */
export function takeOutOfCar(state: FreightState, unitsByVariant: Record<number, number>): FreightState {
    const carrying = { ...state.carrying };
    const loaded = { ...state.loaded };
    for (const [key, units] of Object.entries(unitsByVariant)) {
        const id = Number(key);
        const moved = Math.min(units, n(loaded, id));
        if (moved <= 0) continue;
        loaded[id] = n(loaded, id) - moved;
        if (loaded[id] === 0) delete loaded[id];
        carrying[id] = n(carrying, id) + moved;
    }
    return { ...state, carrying, loaded };
}

/** Everything the manifest asks for is in the car. */
export function complete(state: FreightState): boolean {
    return state.load.lines.every((line) => line.picked + n(state.loaded, line.variantId) >= line.quantity);
}

/**
 * The same shipment, read again from the server: its picked figures are the
 * truth now. What was loaded or carried this session is kept as far as the
 * manifest still needs it, and no further.
 */
export function refreshLoad(state: FreightState, load: FreightLoad): FreightState {
    const next: FreightState = { load, carrying: {}, loaded: {} };
    for (const line of load.lines) {
        const room = Math.max(0, line.quantity - line.picked);
        const loaded = Math.min(n(state.loaded, line.variantId), room);
        const carrying = Math.min(n(state.carrying, line.variantId), room - loaded);
        if (loaded > 0) next.loaded[line.variantId] = loaded;
        if (carrying > 0) next.carrying[line.variantId] = carrying;
    }
    return next;
}

/** The boxes on the worker's back: one per unit carried, at most `max` in all, sized from the unit. */
export function freightBoxesToDraw(state: FreightState, max: number): Array<{ key: number; side: number }> {
    const boxes: Array<{ key: number; side: number }> = [];
    for (const line of state.load.lines) {
        const units = n(state.carrying, line.variantId);
        const side = Math.min(0.5, Math.max(0.16, Math.cbrt(line.unitCbm)));
        for (let i = 0; i < units && boxes.length < max; i++) boxes.push({ key: line.variantId, side });
    }
    return boxes;
}
