import type { PlaceKey } from "./places";

/**
 * Replaying shipments: what a shipment looks like in the world at a moment in
 * time, from the timestamps its parties left (App\Services\Guide\WorldShipmentFeed).
 *
 *   ticking    created; the four parties are ticking (creator, driver, origin, destination)
 *   picking    the origin hub is picking the list from its cells
 *   prepared   the goods wait on the platform for the driver
 *   loading    the driver checks and loads the van at the platform
 *   driving    signed for on the stock keeper's phone; the van is on the road
 *   arrived    at the destination, waiting to be checked and received
 *   done       received (or cancelled): nothing left to show
 *
 * A step with no timestamp is skipped; the phase is the latest step reached.
 */

export type PartyKey = "creator" | "fleet" | "origin" | "destination";

export interface WorldShipment {
    id: number;
    reference: string;
    status: string;
    origin: { place: PlaceKey | null; name: string | null };
    destination: { place: PlaceKey | null; name: string | null };
    vehicle: string | null;
    courier: string | null;
    creator: string | null;
    /** First names of who did the step (null: unknown). */
    preparer?: string | null;
    receiver?: string | null;
    items: number;
    cbm: number;
    /** The manifest's volume in m³ (recorded, else quantity × unit size) and what its vehicle takes (null: none chosen yet). */
    load_cbm?: number;
    load_guessed?: boolean;
    capacity?: number | null;
    created_at: string | null;
    scheduled_for: string | null;
    eta: string | null;
    cancelled_at: string | null;
    parties: Array<{ party: PartyKey; status: string; at: string | null }>;
    steps: Record<"picked" | "prepared" | "loading" | "signed" | "in_transit" | "delivered" | "received", string | null>;
}

/** A container being filled at the Storage hub (a consignment forming or at the overseas warehouse); WorldFeed::containers. */
export interface WorldContainer {
    id: number;
    reference: string;
    stage: string;
    container_number: string | null;
    lines: number;
    cbm: number;
    guessed: boolean;
    capacity: number;
}

export type Phase = "before" | "ticking" | "picking" | "prepared" | "loading" | "driving" | "arrived" | "done";

export interface ShipmentState {
    phase: Phase;
    /** 0–1 through the current phase, where it has a known end. */
    progress: number;
    /** How many of the four parties had ticked by then. */
    ticks: number;
}

export const PHASE_LABEL: Record<Phase, string> = {
    before: "Not created yet",
    ticking: "Collecting the four ticks",
    picking: "Picking at the hub",
    prepared: "On the platform",
    loading: "Driver loading",
    driving: "On the road",
    arrived: "Arrived, to be received",
    done: "Received",
};

export const PARTY_LABEL: Record<PartyKey, string> = {
    creator: "Creator",
    fleet: "Driver",
    origin: "Origin",
    destination: "Destination",
};

/** A van takes about this long, in ms, when the shipment didn't record its arrival. */
const DEFAULT_DRIVE_MS = 40 * 60 * 1000;

const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);

/** Every moment something happened to a shipment, in order, for the timeline's marks. */
export function eventsOf(s: WorldShipment): Array<{ at: number; label: string }> {
    const events: Array<{ at: number; label: string }> = [];
    const push = (iso: string | null, label: string) => {
        const at = ms(iso);
        if (at !== null) events.push({ at, label });
    };
    push(s.created_at, "Created");
    s.parties.forEach((p) => p.status === "accepted" && push(p.at, `${PARTY_LABEL[p.party]} ticked`));
    push(s.steps.picked, "Picking");
    push(s.steps.prepared, "On the platform");
    push(s.steps.loading, "Driver loading");
    push(s.steps.signed ?? s.steps.in_transit, "Signed, on the road");
    push(s.steps.delivered, "Arrived");
    push(s.steps.received, "Received");
    push(s.cancelled_at, "Cancelled");
    return events.sort((a, b) => a.at - b.at);
}

export function stateAt(s: WorldShipment, t: number): ShipmentState {
    const ticks = s.parties.filter((p) => p.status === "accepted" && (ms(p.at) ?? Infinity) <= t).length;
    const created = ms(s.created_at);
    const cancelled = ms(s.cancelled_at);

    if (created === null || t < created) return { phase: "before", progress: 0, ticks };
    if (cancelled !== null && t >= cancelled) return { phase: "done", progress: 1, ticks };

    const departed = ms(s.steps.signed) ?? ms(s.steps.in_transit);
    const order: Array<[Phase, number | null]> = [
        ["picking", ms(s.steps.picked)],
        ["prepared", ms(s.steps.prepared)],
        ["loading", ms(s.steps.loading)],
        ["driving", departed],
        ["arrived", ms(s.steps.delivered)],
        ["done", ms(s.steps.received)],
    ];

    let phase = "ticking" as Phase;
    let start = created;
    let index = -1;
    for (let i = 0; i < order.length; i++) {
        const [p, at] = order[i];
        if (at !== null && at <= t) {
            phase = p;
            start = at;
            index = i;
        }
    }

    // How far through the phase: up to the next recorded step, or a guess.
    const next = order.slice(index + 1).find(([, at]) => at !== null)?.[1] ?? null;
    let end = next;
    if (end === null && phase === "driving") end = ms(s.eta) ?? start + DEFAULT_DRIVE_MS;
    const progress = end !== null && end > start ? Math.min(phase === "driving" && next === null ? 0.95 : 1, (t - start) / (end - start)) : 1;

    return { phase, progress: Math.max(0, progress), ticks };
}

/* ------------------------------------------------------------------------ */
/* Refills                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * A shelf refill. From the floor it is one move inside the store; from the
 * Remote Hub a stock keeper carries it round to the store (its transfer's
 * dispatch → completion); from a shipment it waits for the van.
 *
 *   raised   the bin hit its refill line; waiting for someone
 *   moving   on its way (floor → shelf, or Remote Hub → store)
 *   done     on the shelf (or cancelled)
 */
export interface WorldRefill {
    id: number;
    reference: string;
    item_id: number;
    item: string | null;
    quantity: number;
    source: "floor" | "remote_hub" | "shipment" | string;
    destination: string;
    status: string;
    raised_at: string | null;
    accepted_at: string | null;
    raised_by?: string | null;
    accepted_by?: string | null;
    cancelled_by?: string | null;
    fulfilled_at: string | null;
    cancelled_at: string | null;
    transfer: { dispatched_at: string | null; handed_over_at: string | null; completed_at: string | null; cancelled_at: string | null } | null;
}

export type RefillPhase = "before" | "raised" | "moving" | "done";

export function refillStateAt(r: WorldRefill, t: number): { phase: RefillPhase; progress: number } {
    const raised = ms(r.raised_at);
    if (raised === null || t < raised) return { phase: "before", progress: 0 };
    const cancelled = ms(r.cancelled_at) ?? ms(r.transfer?.cancelled_at);
    if (cancelled !== null && t >= cancelled) return { phase: "done", progress: 1 };
    const end = ms(r.transfer?.completed_at) ?? ms(r.fulfilled_at);
    if (end !== null && t >= end) return { phase: "done", progress: 1 };
    // A floor refill with no record of being picked up moves in the last two minutes before it was shelved.
    const start = ms(r.transfer?.dispatched_at) ?? ms(r.accepted_at) ?? (end !== null ? Math.max(raised, end - 120_000) : null);
    if (start === null || t < start) return { phase: "raised", progress: 0 };
    const progress = end !== null && end > start ? (t - start) / (end - start) : Math.min(0.9, (t - start) / 600_000);
    return { phase: "moving", progress: Math.max(0, Math.min(1, progress)) };
}

export function refillEvents(r: WorldRefill): Array<{ at: number; label: string }> {
    const out: Array<{ at: number; label: string }> = [];
    const push = (iso: string | null | undefined, label: string) => {
        const at = ms(iso);
        if (at !== null) out.push({ at, label });
    };
    push(r.raised_at, "Refill raised");
    push(r.accepted_at, "Accepted");
    push(r.transfer?.dispatched_at, "On its way");
    push(r.transfer?.completed_at ?? r.fulfilled_at, "On the shelf");
    push(r.cancelled_at, "Cancelled");
    return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------------ */
/* Orders                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * A sale at the counter and its way to the customer.
 *
 *   cart       the seller is building the cart with the customer
 *   paying     payment taken: ticks 1 of 2 (claimed, then confirmed by a second person)
 *   paid       every payment confirmed; waiting to be picked
 *   picking    a stock keeper picks the lines (store floor or Remote Hub)
 *   packed     packed, waiting for the courier (or for the customer, in store)
 *   out        with the courier, on the road
 *   done       delivered, handed over, failed or cancelled
 */
export interface WorldOrder {
    id: number;
    reference: string;
    stage: string;
    total: number;
    items: number;
    created_at: string | null;
    seller?: string | null;
    picker?: string | null;
    courier?: string | null;
    payments: Array<{ method: string; status: string; amount: number; claimed_at: string | null; confirmed_at: string | null; claimed_by?: string | null; confirmed_by?: string | null }>;
    picking_started_at: string | null;
    packed_at: string | null;
    cancelled_at: string | null;
    delivery: { method: string; source: PlaceKey; picked_up_at: string | null; shipped_at: string | null; delivered_at: string | null; failed_at: string | null } | null;
}

export type OrderPhase = "before" | "cart" | "paying" | "paid" | "picking" | "packed" | "out" | "done";

const DEFAULT_RIDE_MS = 30 * 60 * 1000;

export function orderStateAt(o: WorldOrder, t: number): { phase: OrderPhase; progress: number; ticks: number } {
    const created = ms(o.created_at);
    const claimed = o.payments.map((p) => ms(p.claimed_at)).filter((x): x is number => x !== null);
    const confirmed = o.payments.map((p) => ms(p.confirmed_at));
    const ticks = (claimed.some((c) => c <= t) ? 1 : 0) + (confirmed.length > 0 && confirmed.every((c) => c !== null && c <= t) ? 1 : 0);

    if (created === null || t < created) return { phase: "before", progress: 0, ticks };
    const cancelled = ms(o.cancelled_at);
    if (cancelled !== null && t >= cancelled) return { phase: "done", progress: 1, ticks };

    const d = o.delivery;
    const finished = ms(d?.delivered_at) ?? ms(d?.failed_at);
    if (finished !== null && t >= finished) return { phase: "done", progress: 1, ticks };

    const leftAt = ms(d?.picked_up_at) ?? ms(d?.shipped_at);
    if (d && d.method !== "store" && leftAt !== null && t >= leftAt) {
        const end = finished ?? leftAt + DEFAULT_RIDE_MS;
        return { phase: "out", progress: Math.max(0, Math.min(finished === null ? 0.95 : 1, (t - leftAt) / Math.max(1, end - leftAt))), ticks };
    }
    const packed = ms(o.packed_at);
    if (packed !== null && t >= packed) return { phase: "packed", progress: 1, ticks };
    const picking = ms(o.picking_started_at);
    if (picking !== null && t >= picking) return { phase: "picking", progress: 1, ticks };
    if (ticks === 2) return { phase: "paid", progress: 1, ticks };
    if (ticks === 1) return { phase: "paying", progress: 1, ticks };
    return { phase: "cart", progress: 1, ticks };
}

export function orderEvents(o: WorldOrder): Array<{ at: number; label: string }> {
    const out: Array<{ at: number; label: string }> = [];
    const push = (iso: string | null | undefined, label: string) => {
        const at = ms(iso);
        if (at !== null) out.push({ at, label });
    };
    push(o.created_at, "Cart checked out");
    o.payments.forEach((p) => {
        push(p.claimed_at, `Payment taken (${p.method})`);
        push(p.confirmed_at, "Payment confirmed");
    });
    push(o.picking_started_at, "Picking");
    push(o.packed_at, "Packed");
    push(o.delivery?.picked_up_at ?? o.delivery?.shipped_at, o.delivery?.method === "store" ? "Ready at the counter" : "With the courier");
    push(o.delivery?.delivered_at, o.delivery?.method === "store" ? "Handed over" : "Delivered");
    push(o.delivery?.failed_at, "Delivery failed");
    push(o.cancelled_at, "Cancelled");
    return out.sort((a, b) => a.at - b.at);
}

export const REFILL_PHASE_LABEL: Record<RefillPhase, string> = {
    before: "Not raised yet",
    raised: "Waiting for a stock keeper",
    moving: "On its way to the shelf",
    done: "On the shelf",
};

export const ORDER_PHASE_LABEL: Record<OrderPhase, string> = {
    before: "Not yet",
    cart: "Cart at the counter",
    paying: "Paid, waiting for the second person to confirm",
    paid: "Paid and confirmed",
    picking: "Being picked",
    packed: "Packed, waiting for the courier",
    out: "With the courier",
    done: "Done",
};
