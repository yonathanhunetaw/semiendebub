/**
 * Practice: the Play mode's rules, run on a snapshot and saving nothing.
 * The same rules the real routes apply, so practising teaches the real job;
 * Live (step 4) sends the same moves to the server instead. Pure: no
 * imports, `node --test` runs it.
 *
 * Store Floor → Store Shelf. A job is one floor → shelf transfer from the
 * stock keeper's shelving list. It is carried and shelved whole, as the
 * Shelving page shelves it: you pick it up at the floor, walk it to the
 * racks and put it up. How much you can carry is a volume (an armload); a
 * single job bigger than that may still be carried alone, as the whole of
 * one trip.
 */

export interface ShelveJob {
    transferId: number;
    reference: string;
    itemName: string;
    /** The item, to find its stack on the floor and its slot on the racks (0 when unknown). */
    itemId?: number;
    quantity: number;
    /** The transfer's unit, e.g. "Packet": its quantity is counted in it. */
    unit: string;
    /** One unit's size in m³; null when the item has none recorded. */
    unitCbm: number | null;
    urgent: boolean;
    /** How the shelving list says it: "6 Packets". */
    display: string;
}

export interface PracticeState {
    /** Jobs still on the floor, waiting to be picked up. */
    floor: ShelveJob[];
    /** Jobs in the worker's arms, in the order picked up. */
    carrying: ShelveJob[];
    /** Jobs shelved this session. */
    shelved: ShelveJob[];
}

/** An armload, in m³: about a big carton and a half. */
export const MAX_CBM = 0.6;
/** Boxes drawn on the worker's back at most, however many units they hold. */
export const MAX_BOXES = 8;
/** What one unit is taken to be when the item has no size recorded. */
export const GUESSED_UNIT_CBM = 0.01;

export function startPractice(jobs: ShelveJob[]): PracticeState {
    return { floor: [...jobs], carrying: [], shelved: [] };
}

/** How big a whole job is, and whether that size is a guess. */
export function jobCbm(job: ShelveJob): { cbm: number; guessed: boolean } {
    const unit = job.unitCbm ?? GUESSED_UNIT_CBM;
    return { cbm: unit * Math.max(1, job.quantity), guessed: job.unitCbm === null };
}

export function load(state: PracticeState): { cbm: number; guessed: boolean; jobs: number } {
    let cbm = 0;
    let guessed = false;
    for (const job of state.carrying) {
        const size = jobCbm(job);
        cbm += size.cbm;
        guessed = guessed || size.guessed;
    }
    return { cbm, guessed, jobs: state.carrying.length };
}

/** Why a job cannot be picked up now, in words for the worker; null when it can. */
export function cannotPickUp(state: PracticeState, transferId: number): string | null {
    const job = state.floor.find((j) => j.transferId === transferId);
    if (!job) return state.carrying.some((j) => j.transferId === transferId) ? "You are already carrying it." : "It is no longer on the floor.";
    if (state.carrying.length === 0) return null;
    const room = MAX_CBM - load(state).cbm;
    if (jobCbm(job).cbm > room + 1e-9) return `It does not fit: ${formatCbm(jobCbm(job).cbm)} m³, and you have room for ${formatCbm(Math.max(0, room))} m³. Shelve what you carry first.`;
    return null;
}

export type Result = { ok: true; state: PracticeState } | { ok: false; reason: string };

export function pickUp(state: PracticeState, transferId: number): Result {
    const reason = cannotPickUp(state, transferId);
    if (reason) return { ok: false, reason };
    const job = state.floor.find((j) => j.transferId === transferId)!;
    return { ok: true, state: { ...state, floor: state.floor.filter((j) => j !== job), carrying: [...state.carrying, job] } };
}

/** Put a carried job back on the floor, as it was. */
export function putBack(state: PracticeState, transferId: number): Result {
    const job = state.carrying.find((j) => j.transferId === transferId);
    if (!job) return { ok: false, reason: "You are not carrying it." };
    return { ok: true, state: { ...state, carrying: state.carrying.filter((j) => j !== job), floor: [job, ...state.floor] } };
}

/**
 * Pick up the waiting jobs in the order the shelving list puts them (urgent
 * first), as many as fit. Returns the state and how many were taken.
 */
export function fill(state: PracticeState): { state: PracticeState; taken: number } {
    let next = state;
    let taken = 0;
    const order = [...state.floor].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    for (const job of order) {
        const result = pickUp(next, job.transferId);
        if (!result.ok) continue;
        next = result.state;
        taken++;
    }
    return { state: next, taken };
}

/** Put everything carried up on the shelf: each job is shelved whole. */
export function shelveAll(state: PracticeState): { state: PracticeState; shelved: ShelveJob[] } {
    if (state.carrying.length === 0) return { state, shelved: [] };
    return { state: { ...state, carrying: [], shelved: [...state.shelved, ...state.carrying] }, shelved: state.carrying };
}

/**
 * Settle a put-up that the server answered job by job (Live): the ones it
 * shelved are done, the rest stay in the worker's arms.
 */
export function shelveSome(state: PracticeState, transferIds: number[]): PracticeState {
    const done = new Set(transferIds);
    return {
        ...state,
        carrying: state.carrying.filter((j) => !done.has(j.transferId)),
        shelved: [...state.shelved, ...state.carrying.filter((j) => done.has(j.transferId))],
    };
}

/**
 * A fresh list from the server, merged into a running practice: what you
 * carry or have shelved stays as it is; the floor becomes whatever else the
 * list now has waiting.
 */
export function refresh(state: PracticeState, jobs: ShelveJob[]): PracticeState {
    const held = new Set([...state.carrying, ...state.shelved].map((j) => j.transferId));
    return { ...state, floor: jobs.filter((j) => !held.has(j.transferId)) };
}

/**
 * The boxes to draw on the worker's back: one per unit carried, at most
 * MAX_BOXES in all, each sized from its unit. `side` is a cube's edge in metres.
 */
export function boxesToDraw(state: PracticeState): Array<{ key: number; side: number }> {
    const boxes: Array<{ key: number; side: number }> = [];
    for (const job of state.carrying) {
        const side = Math.min(0.5, Math.max(0.16, Math.cbrt(job.unitCbm ?? GUESSED_UNIT_CBM)));
        const count = Math.min(Math.max(1, job.quantity), MAX_BOXES - boxes.length);
        for (let i = 0; i < count; i++) boxes.push({ key: job.transferId, side });
        if (boxes.length >= MAX_BOXES) break;
    }
    return boxes;
}

export function formatCbm(cbm: number): string {
    return cbm >= 0.1 ? cbm.toFixed(2) : cbm.toFixed(3);
}
