import type { GuideApp } from "@/Components/Guide/chapters";
import { unitSize, type FreightLoad, type HubKey } from "./freight";
import type { ShelveJob } from "./practice";
import type { PlaceKey, RunJob } from "./handoff";
import type { LegJob, LegStage } from "./legs";
import type { Station } from "./stations";
import { relayUnit, type RelayJob } from "./relay";

/**
 * What Play can pick up now: the Guide world route with `?play=1`
 * (WorldFeed::play on the server). A read only, on the viewer's own app.
 */

export interface PlayFeed {
    /** The Main Store; null when the viewer is tied to another store (Watch only). */
    store: { id: number; name: string } | null;
    shelf: { id: number; name: string } | null;
    jobs: ShelveJob[];
    /** Shelf bins at or below their refill line with nothing on its way. */
    needs: Array<{ item_id: number; name: string; status: string; display: string }>;
    /** May this viewer shelve for real (Live, step 4)? */
    canShelve: boolean;
    /** The freight car's jobs: shipments from Hub A or B to the Main Store, scheduled or being picked, soonest first. */
    loads: FreightLoad[];
    /** Remote Hub → Store: what waits for a courier (none for a seller). */
    remote: RelayJob[];
    /** Shipments after Mark prepared: the courier's and the receiving dock's steps. */
    runs: RunJob[];
    /** Transfers between sites and refill legs to accept: the steps of the relay between keepers and couriers. */
    legs: LegJob[];
    /** The desks: what each module has waiting for this viewer, and the actions it offers (stations.ts). */
    stations: Station[];
}

interface RawRun {
    id: number;
    reference: string;
    status: string;
    stage: string;
    origin: PlaceKey;
    destination: PlaceKey;
    courier: string | null;
    steps: string[];
    lines: Array<{ variant_id: number; name: string; unit: string; quantity: number; received: number | null; damaged: number | null }>;
}

interface RawLeg {
    key: string;
    kind: "refill" | "transfer";
    id: number;
    reference: string;
    stage: LegStage;
    origin: PlaceKey;
    destination: PlaceKey;
    item_name: string;
    quantity: number;
    unit: string;
    unit_cbm: number | null;
    needs_courier: boolean;
    courier: string | null;
    awaits_approval: boolean;
    steps: string[];
}

interface RawRelay {
    key: string;
    reference: string;
    stage: "to_accept" | "pending";
    item_name: string;
    quantity: number;
    unit: string;
    unit_cbm: number | null;
    urgent: boolean;
}

interface RawLoad {
    id: number;
    reference: string;
    status: string;
    can_pick: boolean;
    origin: HubKey;
    destination: string;
    scheduled_for: string | null;
    vehicle: { name: string | null; plate: string | null; max_cbm: number | null; payload_kg: number | null };
    lines: Array<{ variant_id: number; name: string; unit: string; quantity: number; picked_quantity: number; line_cbm: number | null; unit_cbm: number | null; area: string | null }>;
}

interface RawJob {
    transfer_id: number;
    reference: string;
    item_name: string;
    quantity: number;
    unit: string;
    unit_cbm: number | null;
    urgent: boolean;
    display: string;
}

export async function loadPlayFeed(app: GuideApp): Promise<PlayFeed> {
    const response = await fetch(route(`${app}.guide.world`, { play: 1 }), { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { play } = (await response.json()) as { play: { store: PlayFeed["store"]; shelf: PlayFeed["shelf"]; to_shelve: RawJob[]; needs: PlayFeed["needs"]; can_shelve: boolean; loads: RawLoad[]; remote: RawRelay[]; runs: RawRun[]; legs: RawLeg[]; stations: Station[] } };
    return {
        store: play.store,
        shelf: play.shelf,
        jobs: play.to_shelve.map((row) => ({
            transferId: row.transfer_id,
            reference: row.reference,
            itemName: row.item_name,
            quantity: row.quantity,
            unit: row.unit,
            unitCbm: row.unit_cbm,
            urgent: row.urgent,
            display: row.display,
        })),
        needs: play.needs,
        canShelve: play.can_shelve,
        loads: play.loads.map((load) => ({
            shipmentId: load.id,
            reference: load.reference,
            status: load.status,
            canPick: load.can_pick,
            origin: load.origin,
            destination: load.destination,
            scheduledFor: load.scheduled_for,
            vehicle: { name: load.vehicle.name, plate: load.vehicle.plate, maxCbm: load.vehicle.max_cbm, payloadKg: load.vehicle.payload_kg },
            lines: load.lines.map((line) => ({
                variantId: line.variant_id,
                name: line.name,
                unit: line.unit,
                quantity: line.quantity,
                picked: line.picked_quantity,
                ...unitSize(line.quantity, line.line_cbm, line.unit_cbm),
                area: line.area,
            })),
        })),
        stations: play.stations ?? [],
        legs: (play.legs ?? []).map((leg) => ({
            key: leg.key,
            kind: leg.kind,
            id: leg.id,
            reference: leg.reference,
            stage: leg.stage,
            origin: leg.origin,
            destination: leg.destination,
            itemName: leg.item_name,
            quantity: leg.quantity,
            unit: leg.unit,
            unitCbm: leg.unit_cbm,
            needsCourier: leg.needs_courier,
            courier: leg.courier,
            awaitsApproval: leg.awaits_approval,
            steps: leg.steps,
        })),
        runs: (play.runs ?? []).map((run) => ({
            shipmentId: run.id,
            reference: run.reference,
            status: run.status,
            stage: run.stage,
            origin: run.origin,
            destination: run.destination,
            courier: run.courier,
            steps: run.steps,
            lines: run.lines.map((line) => ({ variantId: line.variant_id, name: line.name, unit: line.unit, quantity: line.quantity, received: line.received, damaged: line.damaged })),
        })),
        remote: play.remote.map((job) => ({
            key: job.key,
            reference: job.reference,
            serverStage: job.stage,
            itemName: job.item_name,
            quantity: job.quantity,
            unit: job.unit,
            ...relayUnit(job.unit_cbm),
            urgent: job.urgent,
        })),
    };
}
