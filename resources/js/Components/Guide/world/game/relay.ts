import { GUESSED_UNIT_CBM, MAX_CBM } from "./practice.ts";

/**
 * Remote Hub → Store: the rules, pure (`node --test` runs them). Practice only.
 *
 * Stock that leaves a site travels in a courier's hands ("In Delivery"), so
 * this one move takes three people, and the worker plays each in turn:
 *
 *   hub keeper    takes the job out of the Remote Hub (accepting a leg on
 *                 the Remote Hub list, or a transfer waiting for its courier)
 *   courier       is handed it at the Remote Hub's door, carries it round to
 *                 the shop's front door and hands it over there
 *   store keeper  checks what was handed over and receives it onto the floor
 *
 * Carrying it round yourself, skipping the courier, is refused with the
 * reason: that is the lesson. A job is carried whole, as a transfer is.
 */

export type RelayRole = "hub_keeper" | "courier" | "store_keeper";

export interface RelayJob {
    key: string;
    reference: string;
    /** Where it stands on the server: a leg for the hub to accept, or a transfer waiting for its courier. */
    serverStage: "to_accept" | "pending";
    itemName: string;
    quantity: number;
    unit: string;
    unitCbm: number;
    guessed: boolean;
    urgent: boolean;
}

export interface RelayState {
    /** Still in the Remote Hub. */
    waiting: RelayJob[];
    /** In the worker's arms, and as whom. */
    carrying: RelayJob[];
    carrier: "hub_keeper" | "courier" | null;
    /** Handed over at the shop's door, waiting for the store keeper to check and receive. */
    handedOver: RelayJob[];
    received: RelayJob[];
}

export type RelayResult = { ok: true; state: RelayState } | { ok: false; reason: string };

export function startRelay(jobs: RelayJob[]): RelayState {
    return { waiting: [...jobs], carrying: [], carrier: null, handedOver: [], received: [] };
}

export const jobSize = (job: RelayJob) => job.unitCbm * Math.max(1, job.quantity);
export const relayLoad = (state: RelayState) => state.carrying.reduce((n, j) => n + jobSize(j), 0);

/** Who the worker is now: whoever carries the jobs, or the store keeper while something waits at the door. */
export function roleNow(state: RelayState): RelayRole | null {
    if (state.carrying.length > 0) return state.carrier;
    return state.handedOver.length > 0 ? "store_keeper" : null;
}

/** As the hub keeper: take a job out of the Remote Hub (whole; one bigger than an armload only alone). */
export function takeAtHub(state: RelayState, key: string): RelayResult {
    if (state.carrier === "courier") return { ok: false, reason: "The courier has these now. Take them round to the shop first." };
    const job = state.waiting.find((j) => j.key === key);
    if (!job) return { ok: false, reason: "It is no longer waiting in the Remote Hub." };
    if (state.carrying.length > 0 && relayLoad(state) + jobSize(job) > MAX_CBM + 1e-9) {
        return { ok: false, reason: "It does not fit with what you carry. Hand this lot to the courier first." };
    }
    return { ok: true, state: { ...state, waiting: state.waiting.filter((j) => j !== job), carrying: [...state.carrying, job], carrier: "hub_keeper" } };
}

/** Put what the hub keeper carries back in the Remote Hub. */
export function putBackAtHub(state: RelayState): RelayResult {
    if (state.carrier !== "hub_keeper") return { ok: false, reason: "Only the hub keeper puts things back in the Remote Hub." };
    return { ok: true, state: { ...state, waiting: [...state.carrying, ...state.waiting], carrying: [], carrier: null } };
}

/** At the Remote Hub's door: the hub keeper hands everything to the courier; the worker is now the courier. */
export function handToCourier(state: RelayState): RelayResult {
    if (state.carrying.length === 0) return { ok: false, reason: "Nothing to hand over: take a job out of the Remote Hub first." };
    if (state.carrier === "courier") return { ok: false, reason: "The courier already has it. Carry it round to the shop's front door." };
    return { ok: true, state: { ...state, carrier: "courier" } };
}

/** At the shop's door: the courier hands it over. Refused if it never went through a courier. */
export function handOver(state: RelayState): RelayResult {
    if (state.carrying.length === 0) return { ok: false, reason: "Nothing to hand over." };
    if (state.carrier !== "courier") {
        return { ok: false, reason: "It is leaving the Remote Hub's site, so a courier carries it: hand it to the courier at the Remote Hub's door first (In Delivery)." };
    }
    return { ok: true, state: { ...state, handedOver: [...state.handedOver, ...state.carrying], carrying: [], carrier: null } };
}

/** As the store keeper: check what was handed over and receive it onto the floor. */
export function receive(state: RelayState): RelayResult {
    if (state.handedOver.length === 0) return { ok: false, reason: "Nothing has been handed over at the door." };
    return { ok: true, state: { ...state, received: [...state.received, ...state.handedOver], handedOver: [] } };
}

/** A fresh list: what is moving or done this session stays; what waits becomes the list's. */
export function refreshRelay(state: RelayState, jobs: RelayJob[]): RelayState {
    const moving = new Set([...state.carrying, ...state.handedOver, ...state.received].map((j) => j.key));
    return { ...state, waiting: jobs.filter((j) => !moving.has(j.key)) };
}

/** A job's unit size, from what the server knows, or a guess. */
export function relayUnit(unitCbm: number | null): { unitCbm: number; guessed: boolean } {
    return unitCbm !== null && unitCbm > 0 ? { unitCbm, guessed: false } : { unitCbm: GUESSED_UNIT_CBM, guessed: true };
}

/** The boxes on the worker's back: one per unit carried, at most `max`, sized from the unit; keys stay apart from other jobs'. */
export function relayBoxesToDraw(state: RelayState, max: number): Array<{ key: number; side: number }> {
    const boxes: Array<{ key: number; side: number }> = [];
    state.carrying.forEach((job, i) => {
        const side = Math.min(0.5, Math.max(0.16, Math.cbrt(job.unitCbm)));
        for (let u = 0; u < Math.max(1, job.quantity) && boxes.length < max; u++) boxes.push({ key: 900_000 + i, side });
    });
    return boxes;
}
