import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { FLOOR_ZONES, PLACES, PLATFORM_BERTH, RACK_SPAN, STORE, STORE_CORNER, doorPosition, palletCentres } from "../places";

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
 * The counter desk stands by the counter in the shop, the delivery desk on the
 * delivery platform and the arrivals desk on the hub platform; every other desk
 * is in the Office, the room behind the shop beside the Remote Hub: three rows
 * of five, with the staff board on the west wall. Each is a patch with a table.
 */
const OFFICE = PLACES.find((p) => p.key === "office")!;
const [officeX, officeZ] = OFFICE.position;
const [officeW, officeD] = OFFICE.size;
const officeWest = officeX - officeW / 2;
const officeNorth = officeZ - officeD / 2;
/** A desk of the office's grid: 3 × 2.2 m, columns 3.5 m apart from 4.4 m inside the west wall (clear of the board), rows 3.3 m apart from 0.8 m inside the back wall. */
const inOffice = (col: number, row: number): [number, number, number, number] => {
    const x = officeWest + 4.4 + col * 3.5;
    const z = officeNorth + 0.8 + row * 3.3;
    return [x, z, x + 3, z + 2.2];
};

/** Where the office's desks stand: [key, sign, column, row]. */
const OFFICE_SLOTS = [
    ["desk_purchasing", "Purchasing desk", 0, 0], ["desk_cash", "Cash & payments desk", 1, 0], ["desk_ideas", "Product ideas desk", 2, 0], ["desk_catalogue", "Catalogue desk", 3, 0], ["desk_sites", "Stores & fleet desk", 4, 0],
    ["desk_orders", "Orders desk", 0, 1], ["desk_receiving", "Receiving desk", 1, 1], ["desk_counts", "Counts & levels desk", 2, 1], ["desk_moves", "Transfers desk", 3, 1], ["desk_shipments", "Shipments desk", 4, 1],
    ["desk_customers", "Customers desk", 0, 2], ["desk_work", "Staff & keys desk", 1, 2], ["desk_office", "Calendar & office desk", 2, 2],
] as const;

export type DeskKey = "desk_arrivals" | "desk_counter" | "desk_bay" | "desk_board" | (typeof OFFICE_SLOTS)[number][0];

export interface Desk {
    key: DeskKey;
    label: string;
    /** The patch to stand on, [minX, minZ, maxX, maxZ]. */
    rect: [number, number, number, number];
    /** How high its surface is: the platforms are a step up. */
    rise: number;
    /** Has a table at the back of its patch (the board hangs on the wall instead). */
    table: boolean;
}

/** The counter desk: west of the counter, which stands against the east wall at the front. */
const COUNTER = PLACES.find((p) => p.key === "store_counter")!;
const LOADING = PLACES.find((p) => p.key === "loading_bay")!;

export const DESKS: ReadonlyArray<Desk> = [
    { key: "desk_arrivals", label: "Arrivals desk", rect: [-63.9, -0.3, -62.4, 2.3], rise: 0.3, table: true },
    { key: "desk_counter", label: "Counter desk", rect: [COUNTER.position[0] - 2.8, COUNTER.position[1] - 1.2, COUNTER.position[0] - 0.7, COUNTER.position[1] + 1.2], rise: 0, table: true },
    { key: "desk_bay", label: "Delivery desk", rect: [LOADING.position[0] - 1.5, LOADING.position[1] - 1.4, LOADING.position[0] + 1.5, LOADING.position[1] + 0.8], rise: 0.3, table: true },
    { key: "desk_board", label: "Staff board", rect: [officeWest + 0.6, officeZ - 2, officeWest + 3.2, officeZ + 2], rise: 0, table: false },
    ...OFFICE_SLOTS.map(([key, label, col, row]): Desk => ({ key, label, rect: inOffice(col, row), rise: 0, table: true })),
];
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
    /** A desk (stations.ts): the scene puts a table on it, unless `table` is false (the board hangs on a wall). */
    desk?: boolean;
    table?: boolean;
    /** How far above the ground the surface under it is (a platform is a step up); the patch lies just over it. */
    rise?: number;
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
        // East of the west pallets, in the shop's north-west corner (1.6 m from the west wall, 2.2 m from the back wall).
        rects: [[STORE_CORNER.nw[0] + 1.6, STORE_CORNER.nw[1] + 2.2, STORE_CORNER.nw[0] + 3.6, STORE_CORNER.nw[1] + 5.4]],
        // The middle west pallet, where the cartons stand.
        point: [cx + westPallet[0], 1, STORE_CORNER.nw[1] + 3],
    },
    {
        key: "shelf",
        kind: "drop",
        label: "Store Shelf · put up",
        // In front of the back racks' middle, and at the front end of the west run (column a), whose run is RACK_SPAN long and centred on its wall.
        rects: [[cx + 0.9, north + 0.5, cx + 2.9, north + 1.6], [STORE_CORNER.nw[0] + 0.5, cz + RACK_SPAN / 2 - 0.15, STORE_CORNER.nw[0] + 2.4, cz + RACK_SPAN / 2 + 0.45]],
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
    ...DESKS.map((d): Zone => ({ key: d.key, kind: "pickup", label: d.label, rects: [[...d.rect] as [number, number, number, number]], point: [(d.rect[0] + d.rect[2]) / 2, 1, (d.rect[1] + d.rect[3]) / 2], desk: true, table: d.table, rise: d.rise })),
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
        // polygonOffset: a decal on a floor must always win the depth test against it (it flickered, drawn 2 cm above it).
        const material = new THREE.MeshBasicMaterial({ color: zone.kind === "pickup" ? tones.pickup : tones.drop, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        // The surface under it: a hub or shop floor is about 14 cm up, a platform 30 cm.
        // Outside a door it lies on the street or the ground (a road is 4–6 cm up).
        const outdoors = zone.key === "remote_door" || zone.key === "store_door";
        const base = zone.rise !== undefined && zone.rise > 0 ? zone.rise : zone.key === "truck" ? 0.3 : outdoors ? 0.08 : 0.14;
        for (const [x0, z0, x1, z1] of zone.rects) {
            const patch = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set((x0 + x1) / 2, base + 0.05, (z0 + z1) / 2);
            patch.renderOrder = 2;
            patch.raycast = () => {};
            group.add(patch);
        }
        if (zone.desk && zone.table !== false) {
            // A table at the back of the patch, so the desk reads as a desk.
            const [x0, z0, x1, z1] = zone.rects[0];
            const table = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, x1 - x0 - 0.4), 0.8, 0.7), deskMaterial);
            table.position.set((x0 + x1) / 2, base + 0.4, z0 + 0.45);
            table.raycast = () => {};
            group.add(table);
            const top = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.3, x1 - x0 - 0.3), 0.06, 0.8), deskTopMaterial);
            top.position.set((x0 + x1) / 2, base + 0.83, z0 + 0.45);
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
