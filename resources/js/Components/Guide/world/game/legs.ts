import type { PlaceKey } from "./handoff.ts";

/**
 * Transfer legs: the rules, pure (`node --test` runs them).
 *
 * A transfer between two sites (hub → store, Remote Hub → floor …) is a
 * relay between different people, each on their own app:
 *
 *   keeper at the origin    accept   a refill leg on the Remote Hub list becomes a transfer (stock keeper)
 *   courier                 claim    takes on a transfer nobody carries yet (delivery)
 *   keeper at the origin    dispatch hands it over; the stock leaves into the courier's custody (stock keeper)
 *   courier                 handover gives it to the destination (delivery); nothing moves yet
 *   keeper at destination   complete takes it in with a count; what arrived lands, a shortfall is logged (stock keeper)
 *   either end              cancel   stock already with the courier comes back to the origin
 *
 * Live offers only the steps the server lists for the viewer, so a stock
 * keeper and a courier each play their own part. Practice walks the same
 * order and saves nothing. A transfer that never leaves its site needs no
 * courier: it goes straight from dispatch to complete.
 */

export type LegStep = "accept" | "claim" | "dispatch" | "handover" | "complete" | "cancel";

export const LEG_STEP_LABEL: Record<LegStep, string> = {
    accept: "Accept the refill",
    claim: "Take it on (claim)",
    dispatch: "Hand it to the courier (dispatch)",
    handover: "Hand it over at the destination",
    complete: "Check & receive",
    cancel: "Cancel the transfer",
};

/** Where on the server a leg stands. */
export type LegStage = "to_accept" | "waiting" | "claimed" | "in_transit" | "handed_over";

export interface LegJob {
    key: string;
    kind: "refill" | "transfer";
    id: number;
    reference: string;
    stage: LegStage;
    origin: PlaceKey;
    destination: PlaceKey;
    itemName: string;
    quantity: number;
    unit: string;
    unitCbm: number | null;
    /** Does it leave its site (so a courier carries it)? */
    needsCourier: boolean;
    courier: string | null;
    /** An automated proposal that a store manager has not approved: it cannot be dispatched. */
    awaitsApproval: boolean;
    /** The steps this viewer can take now on the server. */
    steps: string[];
}

export interface LegProgress {
    job: LegJob;
    stage: LegStage;
    received: number;
    damaged: number;
    /** How it ended this session: taken in, or cancelled. */
    closed: "received" | "cancelled" | null;
}

export type LegsState = Record<string, LegProgress>;
export type LegResult = { ok: true; state: LegsState } | { ok: false; reason: string };

export function startLegs(jobs: LegJob[]): LegsState {
    const state: LegsState = {};
    for (const job of jobs) state[job.key] = fresh(job);
    return state;
}

const fresh = (job: LegJob): LegProgress => ({ job, stage: job.stage, received: job.quantity, damaged: 0, closed: null });

/** A fresh list: Live reads the server; Practice keeps a leg that is further along than the server says. */
export function refreshLegs(state: LegsState, jobs: LegJob[], live: boolean): LegsState {
    const next: LegsState = {};
    for (const job of jobs) {
        const old = state[job.key];
        const base = fresh(job);
        next[job.key] = !live && old && old.closed === null && order(old.stage) > order(base.stage) ? { ...old, job } : base;
    }
    return next;
}

const STAGES: LegStage[] = ["to_accept", "waiting", "claimed", "in_transit", "handed_over"];
const order = (stage: LegStage) => STAGES.indexOf(stage);

/** The step a leg is waiting for next. */
export function nextLegStep(progress: LegProgress): LegStep | null {
    if (progress.closed) return null;
    const { job, stage } = progress;
    switch (stage) {
        case "to_accept": return "accept";
        case "waiting": return job.needsCourier ? "claim" : "dispatch";
        case "claimed": return "dispatch";
        case "in_transit": return job.needsCourier ? "handover" : "complete";
        case "handed_over": return "complete";
    }
}

/** Which end of the leg a step is taken at. */
export const legEnd = (step: LegStep): "origin" | "destination" => (step === "handover" || step === "complete" ? "destination" : "origin");

/** Is this step in the viewer's hands for real? */
export const mayTakeLeg = (progress: LegProgress, step: LegStep) => progress.job.steps.includes(step);

export function badLegCount(received: number, damaged: number): string | null {
    if (!Number.isInteger(received) || !Number.isInteger(damaged)) return "Counts are whole numbers.";
    if (received < 0 || damaged < 0) return "Counts cannot be negative.";
    if (damaged > received) return "Damaged units are part of what arrived, so they cannot be more than it.";
    return null;
}

/** Why a step cannot be taken now (the server's own wording where it has one); null when it can. */
export function cannotTakeLeg(progress: LegProgress | undefined, step: LegStep, live = false): string | null {
    if (!progress) return "That transfer is no longer on the list.";
    if (progress.closed) return progress.closed === "cancelled" ? "That transfer is cancelled." : "That transfer is already received.";
    if (step === "cancel") return null;
    // Live: the server's list of steps for this viewer is the truth (the real page lets the destination receive an unhanded transfer too).
    if (live && mayTakeLeg(progress, step)) return step === "complete" ? badLegCount(progress.received, progress.damaged) : null;
    const next = nextLegStep(progress);
    if (next === step) {
        if (step === "dispatch" && progress.job.awaitsApproval) return "This is an automated replenishment proposal. A store manager must approve it before it can be dispatched.";
        if (step === "complete") return badLegCount(progress.received, progress.damaged);
        return null;
    }
    if (next === null) return "Nothing is left to do on it.";
    if (step === "dispatch" && next === "claim") return "This transfer leaves the site, so a courier has to carry it. A courier claims it first (Delivery).";
    if (step === "handover" && (next === "claim" || next === "dispatch")) return "Only a transfer the courier has collected can be handed over: the origin dispatches it first.";
    if (step === "complete" && next === "handover") return "The courier has to hand it over at the door first.";
    if (order(progress.stage) > order(stageOf(step))) return "That step is already done.";
    return `Not yet: it is waiting for "${LEG_STEP_LABEL[next].toLowerCase()}".`;
}

const stageOf = (step: LegStep): LegStage => ({ accept: "to_accept", claim: "waiting", dispatch: "claimed", handover: "in_transit", complete: "handed_over", cancel: "waiting" } as const)[step];

/** Move a leg on by one step (Practice, or once the server has accepted it in Live). */
export function advanceLeg(state: LegsState, key: string, step: LegStep): LegResult {
    const progress = state[key];
    const reason = cannotTakeLeg(progress, step);
    if (reason) return { ok: false, reason };
    if (step === "cancel") return { ok: true, state: { ...state, [key]: { ...progress, closed: "cancelled" } } };
    if (step === "complete") return { ok: true, state: { ...state, [key]: { ...progress, closed: "received" } } };
    const next: LegStage = step === "accept" ? "waiting" : step === "claim" ? "claimed" : step === "dispatch" ? "in_transit" : "handed_over";
    return { ok: true, state: { ...state, [key]: { ...progress, stage: next } } };
}

export function setLegCount(state: LegsState, key: string, received: number, damaged: number): LegResult {
    const progress = state[key];
    if (!progress) return { ok: false, reason: "That transfer is no longer on the list." };
    const reason = badLegCount(received, damaged);
    if (reason) return { ok: false, reason };
    return { ok: true, state: { ...state, [key]: { ...progress, received, damaged } } };
}

/** Legs that still have a step to take. */
export const openLegs = (state: LegsState) => Object.values(state).filter((p) => p.closed === null && nextLegStep(p) !== null);

/** Is it the Remote Hub → floor job the Practice relay (relay.ts) already plays, at its start? */
export const coveredByRelay = (job: LegJob, stage: LegStage) =>
    job.origin === "remote_hub" && job.destination === "store_floor" && (stage === "to_accept" || stage === "waiting");

/** The zone a step is taken in: the origin's or the destination's door. */
export function zoneOfLeg(progress: LegProgress, step: LegStep): "truck" | "remote" | "remote_door" | "store_door" {
    const place = legEnd(step) === "origin" ? progress.job.origin : progress.job.destination;
    if (place === "remote_hub") return step === "accept" ? "remote" : "remote_door";
    if (place === "store_floor") return "store_door";
    return "truck";
}
