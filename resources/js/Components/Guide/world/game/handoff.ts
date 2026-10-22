/**
 * The hand-off after Mark prepared: the rules, pure (`node --test` runs them).
 *
 * A shipment that is prepared goes through six more steps, the ones
 * ShipmentHandoffService takes after the pick. One worker plays each person
 * in turn, as in the Remote Hub relay:
 *
 *   courier    courier_start   starts the trip to the pickup
 *   courier    courier_check   checks the load against the manifest
 *   courier    courier_sign    signs and takes the load: the stock leaves the origin
 *   courier    courier_arrive  arrives at the destination
 *   receiver   receiver_check  checks the goods (and counts them: received, damaged)
 *   receiver   receiver_sign   signs them in: the stock lands, any difference is logged under Receiving
 *
 * The order is the server's (`isAvailable`): a step cannot be taken before
 * the one ahead of it, and the sign steps need a signature. Practice walks
 * the same order and saves nothing; Live sends each step to the real route
 * (actions.ts), and only offers the steps the server says the viewer may take.
 */

export type RunStep = "courier_start" | "courier_check" | "courier_sign" | "courier_arrive" | "receiver_check" | "receiver_sign";

export const RUN_STEPS: RunStep[] = ["courier_start", "courier_check", "courier_sign", "courier_arrive", "receiver_check", "receiver_sign"];

export type PlaceKey = "main_hub_a" | "main_hub_b" | "remote_hub" | "store_floor";

export interface RunLine {
    variantId: number;
    name: string;
    unit: string;
    quantity: number;
    /** A count already saved on the server. */
    received: number | null;
    damaged: number | null;
}

export interface RunJob {
    shipmentId: number;
    reference: string;
    /** The server's status: ready, dispatched, in_transit or delivered. */
    status: string;
    /** The server's one-word stage: prepared, driver_on_way, driver_checked, en_route, arrived, receiver_checked. */
    stage: string;
    origin: PlaceKey;
    destination: PlaceKey;
    courier: string | null;
    /** The steps this viewer can take now on the server (ShipmentHandoffService::stepsFor). */
    steps: string[];
    lines: RunLine[];
}

export interface Count {
    received: number;
    damaged: number;
}

export interface RunProgress {
    job: RunJob;
    /** How many of the six steps are done: 0 = prepared and waiting for the courier. */
    done: number;
    /** What the receiver counted, by variant; null until they start counting. */
    counts: Record<number, Count> | null;
    /** The count was saved (Live: on the server). */
    counted: boolean;
}

export type RunsState = Record<number, RunProgress>;

export type RunResult = { ok: true; state: RunsState } | { ok: false; reason: string };

/** How far the server says a shipment is, in steps done. */
export function doneOnServer(stage: string): number {
    switch (stage) {
        case "driver_on_way": return 1;
        case "driver_checked": return 2;
        case "en_route": return 3;
        case "arrived": return 4;
        case "receiver_checked": return 5;
        default: return 0;
    }
}

export function startRuns(jobs: RunJob[]): RunsState {
    const state: RunsState = {};
    for (const job of jobs) state[job.shipmentId] = freshProgress(job);
    return state;
}

function freshProgress(job: RunJob): RunProgress {
    const counted = job.lines.length > 0 && job.lines.every((l) => l.received !== null);
    return {
        job,
        done: doneOnServer(job.stage),
        counts: counted ? Object.fromEntries(job.lines.map((l) => [l.variantId, { received: l.received ?? l.quantity, damaged: l.damaged ?? 0 }])) : null,
        counted,
    };
}

/**
 * A fresh list: in Live the server is the truth, so every run is read again.
 * In Practice a run keeps the steps taken this session if they are ahead of
 * the server's; a run that left the list (signed in by someone else) goes.
 */
export function refreshRuns(state: RunsState, jobs: RunJob[], live: boolean): RunsState {
    const next: RunsState = {};
    for (const job of jobs) {
        const fresh = freshProgress(job);
        const old = state[job.shipmentId];
        next[job.shipmentId] = !live && old && old.done > fresh.done ? { ...old, job } : fresh;
    }
    return next;
}

/** The step a run is waiting for, or null when it has none left. */
export function nextStep(progress: RunProgress): RunStep | null {
    return RUN_STEPS[progress.done] ?? null;
}

export function actorOf(step: RunStep): "courier" | "receiver" {
    return step.startsWith("courier") ? "courier" : "receiver";
}

export const STEP_LABEL: Record<RunStep, string> = {
    courier_start: "Start the trip to the pickup",
    courier_check: "Check the load",
    courier_sign: "Sign & take the load",
    courier_arrive: "Arrived at the destination",
    receiver_check: "Check the goods",
    receiver_sign: "Sign & receive",
};

export const needsSignature = (step: RunStep) => step === "courier_sign" || step === "receiver_sign";

/** Which end of the run a step happens at: the courier's first three at the origin, the rest at the destination. */
export function endOf(step: RunStep): "origin" | "destination" {
    return step === "courier_start" || step === "courier_check" || step === "courier_sign" ? "origin" : "destination";
}

/** Whether a step is in the viewer's hands for real (Live): the server lists the steps it would let them take. */
export function mayTake(progress: RunProgress, step: RunStep): boolean {
    return progress.job.steps.includes(step);
}

/** A count that is fit to save: whole, not negative, damaged part of received. Null when fine, else the reason. */
export function badCount(count: Count): string | null {
    if (!Number.isInteger(count.received) || !Number.isInteger(count.damaged)) return "Counts are whole numbers.";
    if (count.received < 0 || count.damaged < 0) return "Counts cannot be negative.";
    if (count.damaged > count.received) return "Damaged units are part of what arrived, so they cannot be more than it.";
    return null;
}

/** What the receiver starts from: everything the manifest asked for, nothing damaged. */
export function expectedCounts(job: RunJob): Record<number, Count> {
    return Object.fromEntries(job.lines.map((l) => [l.variantId, { received: l.quantity, damaged: 0 }]));
}

export function setCount(state: RunsState, shipmentId: number, variantId: number, count: Count): RunResult {
    const run = state[shipmentId];
    if (!run) return { ok: false, reason: "That run is no longer on the list." };
    if (run.done !== 5) return { ok: false, reason: "Check the goods first, then count them." };
    const reason = badCount(count);
    if (reason) return { ok: false, reason };
    const counts = { ...(run.counts ?? expectedCounts(run.job)), [variantId]: count };
    return { ok: true, state: { ...state, [shipmentId]: { ...run, counts, counted: false } } };
}

/** The count was saved: the sign step may follow. */
export function markCounted(state: RunsState, shipmentId: number): RunsState {
    const run = state[shipmentId];
    if (!run) return state;
    return { ...state, [shipmentId]: { ...run, counts: run.counts ?? expectedCounts(run.job), counted: true } };
}

/** The lines whose count differs from the manifest: short, over or damaged. */
export function differences(progress: RunProgress): Array<{ line: RunLine; received: number; damaged: number }> {
    const counts = progress.counts ?? expectedCounts(progress.job);
    return progress.job.lines
        .map((line) => ({ line, received: counts[line.variantId]?.received ?? line.quantity, damaged: counts[line.variantId]?.damaged ?? 0 }))
        .filter((d) => d.received !== d.line.quantity || d.damaged > 0);
}

/** Why a step cannot be taken now, in words for the worker; null when it can. `signature` says whether one was drawn. */
export function cannotTake(progress: RunProgress | undefined, step: RunStep, signature: boolean): string | null {
    if (!progress) return "That run is no longer on the list.";
    const index = RUN_STEPS.indexOf(step);
    if (progress.done > index) return "That step is already done.";
    if (progress.done < index) {
        const ahead = RUN_STEPS[progress.done];
        return ahead === "courier_start" ? "The trip has not started: the courier starts it first."
            : ahead === "courier_check" ? "Check the load before signing for it."
            : ahead === "courier_sign" ? "The courier has not taken the load yet."
            : ahead === "courier_arrive" ? "Only a run on the road can arrive."
            : ahead === "receiver_check" ? "Check the goods once the driver has arrived."
            : "Check the goods before signing them in.";
    }
    if (step === "receiver_sign" && !progress.counted) return "Count the goods and save the count before signing them in.";
    if (needsSignature(step) && !signature) return "A signature is required: draw it first.";
    return null;
}

/** Take a step in Practice (or after the server accepted it in Live). Refused with the reason when it cannot be taken. */
export function advance(state: RunsState, shipmentId: number, step: RunStep, signature: boolean): RunResult {
    const run = state[shipmentId];
    const reason = cannotTake(run, step, signature);
    if (reason) return { ok: false, reason };
    return { ok: true, state: { ...state, [shipmentId]: { ...run!, done: run!.done + 1 } } };
}

/** The run is finished: the receiver signed it in. */
export const finished = (progress: RunProgress) => progress.done >= RUN_STEPS.length;

/** Runs that still have a step to take (a signed-in run is only kept to say so). */
export function open(state: RunsState): RunProgress[] {
    return Object.values(state).filter((r) => !finished(r));
}

/** The zone an end of the run is at. The Main Hubs are reached from the platform where the freight car stands. */
export function zoneOfPlace(place: PlaceKey): "truck" | "remote_door" | "store_door" {
    return place === "remote_hub" ? "remote_door" : place === "store_floor" ? "store_door" : "truck";
}

/** Where the next step of a run is taken. */
export function zoneOfStep(progress: RunProgress, step: RunStep): "truck" | "remote_door" | "store_door" {
    return zoneOfPlace(endOf(step) === "origin" ? progress.job.origin : progress.job.destination);
}
