import type { IdentityKey } from "@/Components/Visual/identities";
import { placeFor, type PlaceKey } from "./places";
import type { WorldOrder, WorldRefill, WorldShipment } from "./replay";

/**
 * The world's timeline as a list of things that happened: every timestamp a
 * shipment, an order or a refill left, turned into one event that says what
 * happened, where in the world, and who did it. The timeline steps through
 * these one at a time; the world flies to each and lights the spot up.
 */

export type EventKind = "shipment" | "order" | "refill";

export interface WorldEvent {
    /** Unique within a day's list: kind, subject and step. */
    key: string;
    at: number;
    kind: EventKind;
    subject: number;
    reference: string;
    /** What happened, as one short sentence. */
    what: string;
    /** The subject in a few words: the route, the order's size, the item. */
    detail: string;
    where: PlaceKey | null;
    who: IdentityKey;
    /** It ended there: received, delivered, shelved. */
    final?: boolean;
    /** It went wrong: cancelled, failed. */
    bad?: boolean;
}

export const KIND_LABEL: Record<EventKind, string> = {
    shipment: "Shipment",
    order: "Order",
    refill: "Refill",
};

export const KIND_PLURAL: Record<EventKind, string> = {
    shipment: "Shipments",
    order: "Orders",
    refill: "Refills",
};

/** The palette colour each kind of event wears. */
export const KIND_COLOR: Record<EventKind, "warning" | "success" | "info"> = {
    shipment: "warning",
    order: "success",
    refill: "info",
};

const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);

const placeName = (key: PlaceKey | null, fallback: string | null) => (key ? placeFor(key).label : fallback ?? "somewhere else");

function shipmentEvents(s: WorldShipment): WorldEvent[] {
    const out: WorldEvent[] = [];
    const from = s.origin.place;
    const to = s.destination.place;
    const fromName = placeName(from, s.origin.name);
    const toName = placeName(to, s.destination.name);
    const detail = `${s.origin.name ?? fromName} → ${s.destination.name ?? toName}`;
    const push = (step: string, iso: string | null | undefined, what: string, where: PlaceKey | null, who: IdentityKey, extra: Partial<WorldEvent> = {}) => {
        const at = ms(iso);
        if (at !== null) out.push({ key: `shipment-${s.id}-${step}`, at, kind: "shipment", subject: s.id, reference: s.reference, what, detail, where, who, ...extra });
    };

    push("created", s.created_at, `Shipment created${s.creator ? ` by ${s.creator}` : ""}`, "admin_hq", "admin");

    // The four ticks, counted in the order they came in.
    const ticks = s.parties
        .filter((p) => p.status === "accepted" && ms(p.at) !== null)
        .sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0));
    const tickWho: Record<string, [string, PlaceKey | null, IdentityKey]> = {
        creator: ["The creator agrees", "admin_hq", "admin"],
        fleet: [`The driver agrees${s.courier ? ` (${s.courier})` : ""}`, "platform", "delivery"],
        origin: [`${fromName} agrees to send it`, from, "stock_keeper"],
        destination: [`${toName} agrees to take it`, to, "store_manager"],
    };
    ticks.forEach((p, i) => {
        const [what, where, who] = tickWho[p.party];
        push(`tick-${p.party}`, p.at, `${what} · tick ${i + 1} of 4`, where, who);
    });

    push("picked", s.steps.picked, `Picking starts at ${fromName}`, from, "stock_keeper");
    push("prepared", s.steps.prepared, "The goods are out on the platform", "platform", "stock_keeper");
    push("loading", s.steps.loading, "The driver checks the goods and loads the van", "platform", "delivery");
    push("signed", s.steps.signed ?? s.steps.in_transit, "The driver signs; the van leaves", "platform", "delivery");
    push("delivered", s.steps.delivered, `The van arrives at ${toName}`, to, "delivery");
    push("received", s.steps.received, `Received at ${toName}`, to, "stock_keeper", { final: true });
    push("cancelled", s.cancelled_at, "Shipment cancelled", from, "admin", { final: true, bad: true });
    return out;
}

function orderEventsOf(o: WorldOrder): WorldEvent[] {
    const out: WorldEvent[] = [];
    const inStore = o.delivery?.method === "store";
    const source = o.delivery?.source ?? "store_floor";
    const detail = `${o.items} ${o.items === 1 ? "line" : "lines"} · ${o.total.toLocaleString()}`;
    const push = (step: string, iso: string | null | undefined, what: string, where: PlaceKey | null, who: IdentityKey, extra: Partial<WorldEvent> = {}) => {
        const at = ms(iso);
        if (at !== null) out.push({ key: `order-${o.id}-${step}`, at, kind: "order", subject: o.id, reference: o.reference, what, detail, where, who, ...extra });
    };

    push("created", o.created_at, "The seller checks the cart out at the counter", "store_counter", "seller");
    o.payments.forEach((p, i) => {
        push(`claimed-${i}`, p.claimed_at, `Payment taken · ${p.method.replace(/_/g, " ")}`, "store_counter", "seller");
        push(`confirmed-${i}`, p.confirmed_at, "A second person confirms the payment", "store_counter", "store_manager");
    });
    push("picking", o.picking_started_at, `Picking starts at ${placeFor(source).label}`, source, "stock_keeper");
    push("packed", o.packed_at, inStore ? "Packed for the customer at the counter" : "Packed for the courier", source, "stock_keeper");
    push("out", o.delivery?.picked_up_at ?? o.delivery?.shipped_at, inStore ? "Ready at the counter" : "The courier collects it", inStore ? "store_counter" : "loading_bay", inStore ? "seller" : "delivery");
    push("delivered", o.delivery?.delivered_at, inStore ? "Handed over at the counter" : "Delivered to the customer", inStore ? "store_counter" : "customers", inStore ? "customer" : "delivery", { final: true });
    push("failed", o.delivery?.failed_at, "Delivery failed", "customers", "delivery", { final: true, bad: true });
    push("cancelled", o.cancelled_at, "Order cancelled", "store_counter", "seller", { final: true, bad: true });
    return out;
}

function refillEventsOf(r: WorldRefill): WorldEvent[] {
    const out: WorldEvent[] = [];
    const from: PlaceKey = r.source === "remote_hub" ? "remote_hub" : "store_floor";
    const detail = `${r.quantity} × ${r.item ?? "item"}`;
    const push = (step: string, iso: string | null | undefined, what: string, where: PlaceKey | null, who: IdentityKey, extra: Partial<WorldEvent> = {}) => {
        const at = ms(iso);
        if (at !== null) out.push({ key: `refill-${r.id}-${step}`, at, kind: "refill", subject: r.id, reference: r.reference, what, detail, where, who, ...extra });
    };

    const source = r.source === "remote_hub" ? "from the Remote Hub" : r.source === "shipment" ? "from a shipment" : "from the floor";
    push("raised", r.raised_at, `The bin hit its refill line: refill ${source} raised`, "store_shelf", "store_manager");
    push("accepted", r.accepted_at, "A stock keeper takes the refill", from, "stock_keeper");
    push("dispatched", r.transfer?.dispatched_at, "On its way from the Remote Hub", "remote_hub", "stock_keeper");
    push("handed", r.transfer?.handed_over_at, "Handed over at the store", "store_floor", "stock_keeper");
    push("shelved", r.transfer?.completed_at ?? r.fulfilled_at, "On the shelf", "store_shelf", "stock_keeper", { final: true });
    push("cancelled", r.cancelled_at ?? r.transfer?.cancelled_at, "Refill cancelled", "store_shelf", "store_manager", { final: true, bad: true });
    return out;
}

const KIND_ORDER: Record<EventKind, number> = { shipment: 0, refill: 1, order: 2 };

/** Every event of the day's shipments, orders and refills, oldest first. */
export function buildEvents(shipments: WorldShipment[], orders: WorldOrder[], refills: WorldRefill[]): WorldEvent[] {
    return [...shipments.flatMap(shipmentEvents), ...orders.flatMap(orderEventsOf), ...refills.flatMap(refillEventsOf)]
        .sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** The index of the last event at or before `t`, or null when none has happened yet. */
export function lastBefore(events: WorldEvent[], t: number): number | null {
    let found: number | null = null;
    for (let i = 0; i < events.length && events[i].at <= t; i++) found = i;
    return found;
}

/** "14:05" in the viewer's time zone. */
export function hhmm(at: number): string {
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
