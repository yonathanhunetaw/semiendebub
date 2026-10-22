import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { PLACES, PLATFORM_BERTH, STORE, doorPosition, palletCentres } from "../places";

/**
 * Where Play's jobs happen: floor patches you walk onto. A pickup zone is
 * where you take stock up; a drop zone, where it goes. Each is drawn as a
 * pulsing patch with a sign, and knows the point boxes fly from or to.
 *
 * The patches are where the worker can actually stand (round the pallets, in
 * front of the racks), checked against the walkable map in step 2.
 *
 *   floor   Store Floor, pick up: the open floor east of the west pallets.
 *   shelf   Store Shelf, put up: in front of the back wall (d–h), and in the
 *           front-left corner by the left wall's first column (a).
 *   hub_a   Main Hub A, pick up: just inside its door.
 *   hub_b   Main Hub B, pick up: just inside its door.
 *   truck   the freight car, load: on the platform, behind the car's open doors.
 *   remote       the Remote Hub, take out: just inside its door (the hub keeper).
 *   remote_door  outside the Remote Hub's door: hand it to the courier.
 *   store_door   outside the shop's front door: the courier hands it over, the
 *                store keeper receives it.
 */

export type ZoneKey = "floor" | "shelf" | "hub_a" | "hub_b" | "truck" | "remote" | "remote_door" | "store_door" | DeskKey;

/**
 * The desks (stations.ts): each module that is not a walk-and-carry job has one.
 * Two rows on the paved plaza south of the shop's street (clear of the van's
 * parking), the counter inside the shop, the delivery bay's desk, and the
 * arrivals desk on the hub platform. Each is a 3 × 2.2 m patch with a table.
 */
export const DESKS = [
    { key: "desk_arrivals", label: "Arrivals desk", rect: [-63.9, -0.3, -62.4, 2.3] },
    { key: "desk_counter", label: "Counter desk", rect: [20.7, 9.0, 22.0, 11.2] },
    { key: "desk_bay", label: "Delivery desk", rect: [34.5, -1.4, 37.5, 0.8] },
    { key: "desk_orders", label: "Orders desk", rect: [6, 16.6, 9, 18.8] },
    { key: "desk_receiving", label: "Receiving desk", rect: [9.4, 16.6, 12.4, 18.8] },
    { key: "desk_counts", label: "Counts & levels desk", rect: [12.8, 16.6, 15.8, 18.8] },
    { key: "desk_moves", label: "Transfers desk", rect: [16.2, 16.6, 19.2, 18.8] },
    { key: "desk_customers", label: "Customers desk", rect: [19.6, 16.6, 22.6, 18.8] },
    { key: "desk_cash", label: "Cash & payments desk", rect: [23, 16.6, 26, 18.8] },
    { key: "desk_shipments", label: "Shipments desk", rect: [26.4, 16.6, 29.4, 18.8] },
    { key: "desk_purchasing", label: "Purchasing desk", rect: [6, 20.4, 9, 22.6] },
    { key: "desk_approvals", label: "Approvals desk", rect: [9.4, 20.4, 12.4, 22.6] },
    { key: "desk_ideas", label: "Product ideas desk", rect: [12.8, 20.4, 15.8, 22.6] },
    { key: "desk_work", label: "Staff & keys desk", rect: [16.2, 20.4, 19.2, 22.6] },
    { key: "desk_catalogue", label: "Catalogue desk", rect: [19.6, 20.4, 22.6, 22.6] },
    { key: "desk_sites", label: "Stores & fleet desk", rect: [23, 20.4, 26, 22.6] },
    { key: "desk_office", label: "Calendar & office desk", rect: [26.4, 20.4, 29.4, 22.6] },
] as const satisfies ReadonlyArray<{ key: string; label: string; rect: [number, number, number, number] }>;
export type DeskKey = (typeof DESKS)[number]["key"];
export const isDesk = (key: ZoneKey | null): key is DeskKey => key !== null && DESKS.some((d) => d.key === key);

/**
 * Where the freight car stands: its open doors face west, just off the
 * platform's east edge, at the berth's z; the car runs east from there
 * (FreightPacker), as long as its hold needs.
 */
export const CAR = { rearX: -59.8, z: PLATFORM_BERTH[1], bed: 0.6 };

/** A patch just inside a hub's door, `depth` m deep and `span` m wide, and the point behind it where its stock stands. */
function insideDoor(key: "main_hub_a" | "main_hub_b" | "remote_hub", depth: number, span: number): { rect: [number, number, number, number]; point: [number, number, number] } {
    const door = doorPosition(PLACES.find((p) => p.key === key)!)!;
    const [x, z] = door.at;
    const [ox, oz] = door.out;
    // Inward is against the door's outward direction; the patch starts 0.6 m in, clear of the wall, and runs `span` along it.
    const near = [x - ox * 0.6, z - oz * 0.6];
    const far = [x - ox * (0.6 + depth), z - oz * (0.6 + depth)];
    const rect: [number, number, number, number] = ox !== 0
        ? [Math.min(near[0], far[0]), z - span / 2, Math.max(near[0], far[0]), z + span / 2]
        : [x - span / 2, Math.min(near[1], far[1]), x + span / 2, Math.max(near[1], far[1])];
    return { rect, point: [x - ox * (depth + 2), 1, z - oz * (depth + 2)] };
}
const HUB_A = insideDoor("main_hub_a", 3, 3.5);
const HUB_B = insideDoor("main_hub_b", 2.2, 3.5);
const REMOTE = insideDoor("remote_hub", 2.4, 3.5);

/** A patch just outside a door: `depth` m out, `span` m along it, and the point on the threshold where things change hands. */
function outsideDoor(at: [number, number], out: [number, number], depth: number, span: number): { rect: [number, number, number, number]; point: [number, number, number] } {
    const [x, z] = at;
    const [ox, oz] = out;
    const near = [x + ox * 0.6, z + oz * 0.6];
    const far = [x + ox * (0.6 + depth), z + oz * (0.6 + depth)];
    const rect: [number, number, number, number] = ox !== 0
        ? [Math.min(near[0], far[0]), z - span / 2, Math.max(near[0], far[0]), z + span / 2]
        : [x - span / 2, Math.min(near[1], far[1]), x + span / 2, Math.max(near[1], far[1])];
    return { rect, point: [x + ox * 0.8, 1, z + oz * 0.8] };
}
const remoteDoor = doorPosition(PLACES.find((p) => p.key === "remote_hub")!)!;
const REMOTE_DOOR = outsideDoor(remoteDoor.at, remoteDoor.out, 1.8, 3);
// The shop's front door: in the south wall, STORE.door.at from the west wall.
const STORE_DOOR = outsideDoor([STORE.position[0] - STORE.size[0] / 2 + STORE.door.at, STORE.position[1] + STORE.size[1] / 2 + 0.2], [0, 1], 1.8, STORE.door.width);

export interface Zone {
    key: ZoneKey;
    kind: "pickup" | "drop";
    label: string;
    /** Patches, [minX, minZ, maxX, maxZ]. */
    rects: Array<[number, number, number, number]>;
    /** Where boxes fly from (a pickup) or to (a drop), [x, y, z]. */
    point: [number, number, number];
    /** A desk (stations.ts): the scene puts a table on it. */
    desk?: boolean;
}

const [cx, cz] = STORE.position;
const [, depth] = STORE.size;
const north = cz - depth / 2;
const [westPallet] = palletCentres();

export const ZONES: Zone[] = [
    {
        key: "floor",
        kind: "pickup",
        label: "Store Floor · pick up",
        rects: [[18.6, 8.2, 20.6, 11.4]],
        // The middle west pallet, where the cartons stand.
        point: [cx + westPallet[0], 1, cz],
    },
    {
        key: "shelf",
        kind: "drop",
        label: "Store Shelf · put up",
        rects: [[20.9, north + 0.5, 22.9, north + 1.6], [17.5, 11.35, 19.4, 11.95]],
        point: [21.9, 1.6, north + 0.25],
    },
    { key: "hub_a", kind: "pickup", label: "Main Hub A · pick", rects: [HUB_A.rect], point: HUB_A.point },
    { key: "remote", kind: "pickup", label: "Remote Hub · take out", rects: [REMOTE.rect], point: REMOTE.point },
    { key: "remote_door", kind: "drop", label: "Hand to the courier", rects: [REMOTE_DOOR.rect], point: REMOTE_DOOR.point },
    { key: "store_door", kind: "drop", label: "Shop door · hand over", rects: [STORE_DOOR.rect], point: STORE_DOOR.point },
    { key: "hub_b", kind: "pickup", label: "Main Hub B · pick", rects: [HUB_B.rect], point: HUB_B.point },
    {
        key: "truck",
        kind: "drop",
        label: "Freight car · load",
        rects: [[CAR.rearX - 2.4, CAR.z - 1.3, CAR.rearX - 0.35, CAR.z + 1.3]],
        point: [CAR.rearX + 0.6, CAR.bed + 0.8, CAR.z],
    },
    ...DESKS.map((d): Zone => ({ key: d.key, kind: "pickup", label: d.label, rects: [[...d.rect] as [number, number, number, number]], point: [(d.rect[0] + d.rect[2]) / 2, 1, (d.rect[1] + d.rect[3]) / 2], desk: true })),
];

export function zoneAt(x: number, z: number): Zone | null {
    for (const zone of ZONES) {
        if (zone.rects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return zone;
    }
    return null;
}

/** Where to walk to reach a zone: the middle of its first patch. */
export function zoneEntrance(key: ZoneKey): [number, number] {
    const [x0, z0, x1, z1] = ZONES.find((z) => z.key === key)!.rects[0];
    return [(x0 + x1) / 2, (z0 + z1) / 2];
}

export interface ZoneMarks {
    /** Which zones are worth showing now (a pickup with nothing to take, or a drop with nothing to put, stays hidden). */
    show: (keys: ZoneKey[]) => void;
    /** Mark the zone the worker stands in. */
    setActive: (key: ZoneKey | null) => void;
    /** `at`: where the worker stands; a desk's sign shows only when they are near it and not on it (its card names it). */
    update: (time: number, at?: { x: number; z: number } | null) => void;
    dispose: () => void;
}

/** The patches and signs, added to the scene. Colours come from the theme: pickup info, drop success. */
export function drawZones(scene: THREE.Scene, tones: { pickup: THREE.Color; drop: THREE.Color }, reducedMotion: boolean): ZoneMarks {
    const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
    const deskTopMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e2d3, roughness: 0.6 });
    const marks = ZONES.map((zone) => {
        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({ color: zone.kind === "pickup" ? tones.pickup : tones.drop, transparent: true, opacity: 0.35, depthWrite: false });
        for (const [x0, z0, x1, z1] of zone.rects) {
            const patch = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set((x0 + x1) / 2, 0.16, (z0 + z1) / 2);
            patch.raycast = () => {};
            group.add(patch);
        }
        if (zone.desk) {
            // A table at the back of the patch, so the desk reads as a desk.
            const [x0, z0, x1, z1] = zone.rects[0];
            const table = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, x1 - x0 - 0.4), 0.8, 0.7), deskMaterial);
            table.position.set((x0 + x1) / 2, 0.4, z0 + 0.45);
            table.raycast = () => {};
            group.add(table);
            const top = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.3, x1 - x0 - 0.3), 0.06, 0.8), deskTopMaterial);
            top.position.set((x0 + x1) / 2, 0.83, z0 + 0.45);
            top.raycast = () => {};
            group.add(top);
        }
        const sign = document.createElement("div");
        sign.className = "world-badge world-badge--zone";
        sign.textContent = zone.label;
        const label = new CSS2DObject(sign);
        const [x0, z0, x1, z1] = zone.rects[0];
        label.position.set((x0 + x1) / 2, 2.4, (z0 + z1) / 2);
        group.add(label);
        group.visible = false;
        scene.add(group);
        return { zone, group, material, sign, active: false };
    });

    return {
        show: (keys) => marks.forEach((m) => (m.group.visible = keys.includes(m.zone.key))),
        setActive: (key) => marks.forEach((m) => {
            m.active = m.zone.key === key;
            m.sign.classList.toggle("is-active", m.active);
        }),
        update: (time, at) => {
            for (const m of marks) {
                if (!m.group.visible) continue;
                if (m.zone.desk && at) {
                    const [x0, z0, x1, z1] = m.zone.rects[0];
                    const near = Math.hypot(at.x - (x0 + x1) / 2, at.z - (z0 + z1) / 2) <= 9;
                    m.sign.style.display = near && !m.active ? "" : "none";
                }
                const base = m.active ? 0.55 : 0.3;
                m.material.opacity = reducedMotion ? base : base + 0.15 * Math.sin(time * 3);
            }
        },
        dispose: () => marks.forEach((m) => {
            scene.remove(m.group);
            m.sign.remove();
            m.group.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
            m.material.dispose();
            deskMaterial.dispose();
            deskTopMaterial.dispose();
        }),
    };
}
