import type { IdentityKey } from "@/Components/Visual/identities";

/**
 * The Duka world: the places stock lives in and the roads the vans drive.
 * Pure data; DukaWorld draws it.
 *
 * One world unit is one metre. x runs east, z runs south (towards the
 * viewer). The Main Hub compound, laid out from the site photo, lies far to
 * the west: Hub A (20 × 20 m) at its west end, a building that is not ours in
 * the middle, Hub B (23 × 7 m) along the north fence, and the gate in the east
 * fence. Its hubs only send shipments, by van, to the store or the Remote Hub;
 * goods wait for the van on the 4 × 4 m platform between the two hub doors.
 * The Main Store stands to the east with the Remote Hub behind it.
 *
 * `chapters` are keys into the Guide's CHAPTERS.
 */

export type PlaceShape = "hub" | "platform" | "shelves" | "floor" | "counter" | "bay" | "houses" | "tower";

export type PlaceKey = "main_hub_a" | "main_hub_b" | "platform" | "store_shelf" | "store_floor" | "store_counter" | "remote_hub" | "loading_bay" | "customers" | "admin_hq";

/** Which wall a door is in, and where along it (metres from the wall's west or north end). */
export interface Door {
    wall: "north" | "south" | "east" | "west";
    at: number;
    width: number;
}

export interface Place {
    key: PlaceKey;
    label: string;
    does: string;
    happens: string[];
    /** Centre of the footprint, [x, z]. */
    position: [number, number];
    /** Footprint, [width along x, depth along z]. */
    size: [number, number];
    height?: number;
    shape: PlaceShape;
    /** Inside the store building, so it has no walls or roof of its own. */
    indoor?: boolean;
    /** Hubs: the double swing door, and whether the floor is laid out in 1 m cells. */
    door?: Door;
    cells?: boolean;
    /** Where the label floats, relative to the centre, when not straight above it. */
    labelAt?: [number, number, number];
    roles: IdentityKey[];
    chapters: string[];
}

/**
 * The Main Store, 6 × 6 m and 3.5 m high (the real shop measures about 6.05 ×
 * 6.8 m), open-topped so you can see in. The 2 m main door is in the south
 * wall, 3.6 m from the west wall, 2.1 m high. The counter stands on the right
 * as you walk in, against the east wall, 3.2 m long; a metal divider is fixed to
 * the front wall at the door's west edge. The racking is in storeLayout.ts:
 * floor to ceiling on the left and back walls, hanging from the ceiling on the
 * right wall and over the door, all 50 cm deep. The open floor between the
 * racks and the counter is the Store Floor.
 */
export const STORE = {
    label: "Main Store",
    position: [20, 9] as [number, number],
    size: [6, 6] as [number, number],
    wall: 3.5,
    door: { at: 3.6, width: 2, height: 2.1 },
    shelfDepth: 0.5,
    /** Height of the floor strip under the lowest shelf. */
    plinth: 0.5,
    counter: { width: 3.2, depth: 0.8, height: 1, z: 0 },
};

/** The fenced yard, as a polygon of [x, z] corners, and the double swing gate in its east fence. */
export const COMPOUND = {
    label: "Main Hub compound",
    corners: [[-94, -15], [-31, -15], [-31, -1], [-94, 12]] as Array<[number, number]>,
    gate: { at: [-31, -4] as [number, number], width: 4 },
};

/** The building between the hubs that is not ours: drawn grey, not clickable. */
export const NEIGHBOUR = { position: [-65, -8] as [number, number], size: [10, 10] as [number, number], height: 4 };

export const PLACES: Place[] = [
    {
        key: "main_hub_a",
        label: "Main Hub A",
        does: "The big central warehouse, 20 × 20 m. Bulk stock in cartons, cell by cell.",
        happens: ["Pick the shipment's list from the cells", "Put the goods out on the platform", "Hand them to the driver, who loads and signs"],
        position: [-82, -3],
        size: [20, 20],
        height: 7,
        shape: "hub",
        door: { wall: "east", at: 16, width: 3 },
        cells: true,
        roles: ["stock_keeper"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "main_hub_b",
        label: "Main Hub B",
        does: "The long warehouse on the north fence, 23 × 7 m.",
        happens: ["Pick the shipment's list from the cells", "Put the goods out on the platform", "Hand them to the driver, who loads and signs"],
        position: [-45.5, -9.5],
        size: [23, 7],
        height: 6,
        shape: "hub",
        door: { wall: "south", at: 8, width: 3 },
        cells: true,
        roles: ["stock_keeper"],
        chapters: ["moving"],
    },
    {
        key: "platform",
        label: "Platform",
        does: "The 4 × 4 m pickup platform between the hub doors.",
        happens: ["The origin hub puts the picked goods here", "They wait for the driver", "The driver checks them, loads the van and signs on the stock keeper's phone"],
        position: [-62, 1],
        size: [4, 4],
        shape: "platform",
        roles: ["stock_keeper", "delivery"],
        chapters: ["moving", "delivery"],
    },
    {
        key: "store_shelf",
        label: "Store Shelf",
        does: "The steel racking, 50 cm deep. Left wall a–c and back wall d–h, six rows from the floor up; right wall i–k and front wall l–o, three rows hanging from the ceiling.",
        happens: ["Each physical spot (like f6) carries up to four spots of the seller's shelf, named f6a to f6d once placed", "A seller-shelf spot at its refill line raises a refill from the floor", "Tap a spot to see what is on it"],
        position: [20, 9],
        size: [6, 6],
        shape: "shelves",
        indoor: true,
        labelAt: [0, 4.6, -2.6],
        roles: ["stock_keeper", "store_manager"],
        chapters: ["stock_keeper", "seller"],
    },
    {
        key: "store_floor",
        label: "Store Floor",
        does: "The open floor between the racks and the counter: boxes and cartons not yet on a shelf.",
        happens: ["Receive shipments and transfers", "Refill the shelf: no approval needed", "Pick & pack orders for delivery"],
        position: [20, 9],
        size: [6, 6],
        shape: "floor",
        indoor: true,
        labelAt: [-2, 2.6, -0.5],
        roles: ["stock_keeper"],
        chapters: ["stock_keeper"],
    },
    {
        key: "store_counter",
        label: "Counter",
        does: "The 3.2 m counter on the right as you walk in, against the east wall. Sales happen here.",
        happens: ["The customer asks; the seller finds the item on the shelf", "The seller builds the cart and checks out", "Payment is confirmed by a second person", "In-store orders are handed over here"],
        // Against the east wall (its inner face at x 23), from 0.2 m inside the front wall 3.2 m towards the back.
        position: [22.6, 10.2],
        size: [0.8, 3.2],
        shape: "counter",
        indoor: true,
        roles: ["seller", "customer"],
        chapters: ["seller"],
    },
    {
        key: "remote_hub",
        label: "Remote Hub",
        does: "The warehouse behind the store, as big as the store itself.",
        happens: ["Receive shipments from the Main Hubs", "Send stock into the store when the floor runs short", "Orders can be delivered straight from here"],
        position: [20, -8],
        size: [16, 10],
        height: 5,
        shape: "hub",
        door: { wall: "south", at: 11, width: 3 },
        cells: true,
        roles: ["stock_keeper", "store_manager"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "loading_bay",
        label: "Delivery",
        does: "Where couriers load orders: beside the store and the Remote Hub.",
        happens: ["Take a run from the list on offer", "Collect the parcel: custody is now the courier's", "Hand it over, or report why it failed"],
        position: [36, 0],
        size: [8, 8],
        shape: "bay",
        roles: ["delivery"],
        chapters: ["delivery"],
    },
    {
        key: "customers",
        label: "Customers",
        does: "Where delivered orders end up.",
        happens: ["Receive the parcel", "Pay on delivery if they chose to"],
        position: [62, 4],
        size: [12, 10],
        shape: "houses",
        roles: ["customer"],
        chapters: ["seller", "delivery"],
    },
    {
        key: "admin_hq",
        label: "Admin",
        does: "Runs the business: catalogue, prices, people and stock rules.",
        happens: ["Create shipments: the first of the four ticks", "Set shelf levels and refill routes", "Look after the people and their roles"],
        position: [0, 22],
        size: [6, 6],
        height: 9,
        shape: "tower",
        roles: ["admin", "store_manager"],
        chapters: ["admin", "moving"],
    },
];

/**
 * The Store Floor's pallet areas, relative to the store's centre: a strip on
 * the west with three pallets, and one by the back wall. Each is
 * [x, z, width, depth, pallets]; the pallets (1.2 × 1.2 m) are spaced 1.7 m
 * apart from 0.9 m inside the area's north edge. The scene draws them and
 * the worker walks round them.
 */
export const FLOOR_ZONES: Array<[number, number, number, number, number]> = [
    [-1.7, -0.4, 1.3, 4.4, 3],
    [0.2, -1.6, 1.3, 1.4, 1],
];
export const PALLET = 1.2;
/** Every pallet's centre, [x, z, its number within its area]. */
export function palletCentres(): Array<[number, number, number]> {
    return FLOOR_ZONES.flatMap(([x, z, , depth, pallets]) => Array.from({ length: pallets }, (_, i): [number, number, number] => [x, z - depth / 2 + 0.9 + i * 1.7, i]));
}

/** The customers' houses, relative to that place's centre: [x, z, height], each 3.2 m square. */
export const HOUSES: Array<[number, number, number]> = [[-3.5, -2, 3], [0.5, 2, 4], [3.8, -2.6, 3]];
export const HOUSE_SIZE = 3.2;

/** Where a van stops to unload at each shipment destination. */
export const PARKING: Partial<Record<PlaceKey, [number, number]>> = {
    store_floor: [22.5, 14.6],
    remote_hub: [25.8, -1.3],
};

/** Where unloaded goods are set down: just outside the door they go in by. */
export const DROP: Partial<Record<PlaceKey, [number, number]>> = {
    store_floor: [20.6, 13],
    remote_hub: [22, -2.1],
};

/** Where a van waits to load at the platform: alongside it, facing the gate. */
export const PLATFORM_BERTH: [number, number] = [-57.5, 1];

/**
 * The roads, as polylines of [x, z]: the main road from the gate along the
 * back of the store (past the Remote Hub) to the delivery bay and on to the
 * customers, and the street that loops round to the store's front door.
 */
export const ROADS: Array<Array<[number, number]>> = [
    [[-31, -4], [-12, -2.5], [6, -0.5], [24, 0], [31, -1], [36, -3.5], [44, -2], [52, 2], [58, 4]],
    [[6, -0.5], [10, 8], [15, 14.6], [30, 14.6], [44, 12], [54, 9]],
];

const YARD: Array<[number, number]> = [PLATFORM_BERTH, [-44, -1.5], [-36, -3.5], [-31, -4]];

/** A van's path from the platform, out of the gate, to where it unloads. */
export function vanRoute(destination: PlaceKey): Array<[number, number]> {
    switch (destination) {
        case "store_floor": return [...YARD, [-12, -2.5], [6, -0.5], [10, 8], [15, 14.6], PARKING.store_floor!];
        case "remote_hub": return [...YARD, [-12, -2.5], [6, -0.5], [20, -0.3], PARKING.remote_hub!];
        default: return YARD;
    }
}

export function placeFor(key: PlaceKey): Place {
    const place = PLACES.find((p) => p.key === key);
    if (!place) throw new Error(`Unknown place ${key}`);
    return place;
}

/** A door's hinge-to-hinge centre in world coordinates, and the direction it opens out to. */
export function doorPosition(place: Place): { at: [number, number]; out: [number, number] } | null {
    if (!place.door) return null;
    const [cx, cz] = place.position;
    const [w, d] = place.size;
    const { wall, at } = place.door;
    switch (wall) {
        case "east": return { at: [cx + w / 2, cz - d / 2 + at], out: [1, 0] };
        case "west": return { at: [cx - w / 2, cz - d / 2 + at], out: [-1, 0] };
        case "north": return { at: [cx - w / 2 + at, cz - d / 2], out: [0, -1] };
        case "south": return { at: [cx - w / 2 + at, cz + d / 2], out: [0, 1] };
    }
}

export interface Cell {
    name: string;
    /** Centre, relative to the hub's centre. */
    x: number;
    z: number;
}

export interface HubLayout {
    cells: Cell[];
    /** Walkway rectangles, relative to the hub's centre: [x0, z0, x1, z1]. */
    aisles: Array<[number, number, number, number]>;
}

/** A, B, … Z, AA, AB, …: the column letters of a grid. */
export function columnLetter(index: number): string {
    let n = index;
    let out = "";
    do {
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
}

/**
 * A hub's floor as 1 m cells, with a 2 m walkway down the middle of its length
 * and a 2 m path from the door to it. Cells are named like a spreadsheet:
 * letters across from the west wall, numbers down from the north wall (C4).
 * Walkway squares keep their letters and numbers but hold no cell.
 */
export function hubLayout(place: Place): HubLayout {
    const [w, d] = place.size;
    const x0 = -w / 2;
    const z0 = -d / 2;
    const aisles: HubLayout["aisles"] = [];

    // The walkway runs along the longer side, through the middle.
    if (w >= d) {
        const mid = Math.floor(d / 2) - 1;
        aisles.push([x0, z0 + mid, x0 + w, z0 + mid + 2]);
    } else {
        const mid = Math.floor(w / 2) - 1;
        aisles.push([x0 + mid, z0, x0 + mid + 2, z0 + d]);
    }

    // From the door straight in to the walkway.
    const door = place.door;
    if (door) {
        const [mx0, mz0, mx1, mz1] = aisles[0];
        const along = Math.round(door.at) - 1;
        const dz = z0 + along;
        const dx = x0 + along;
        switch (door.wall) {
            case "east": aisles.push([w >= d ? x0 + w - 2 : mx1, w >= d ? Math.min(dz, mz0) : dz, x0 + w, w >= d ? Math.max(dz + 2, mz1) : dz + 2]); break;
            case "west": aisles.push([x0, w >= d ? Math.min(dz, mz0) : dz, w >= d ? x0 + 2 : mx0, w >= d ? Math.max(dz + 2, mz1) : dz + 2]); break;
            case "south": aisles.push([w >= d ? dx : Math.min(dx, mx0), w >= d ? mz1 : z0 + d - 2, w >= d ? dx + 2 : Math.max(dx + 2, mx1), z0 + d]); break;
            case "north": aisles.push([w >= d ? dx : Math.min(dx, mx0), z0, w >= d ? dx + 2 : Math.max(dx + 2, mx1), w >= d ? mz0 : z0 + 2]); break;
        }
    }

    const inAisle = (x: number, z: number) => aisles.some(([ax0, az0, ax1, az1]) => x > ax0 && x < ax1 && z > az0 && z < az1);

    const cells: Cell[] = [];
    for (let row = 0; row < Math.floor(d); row++) {
        for (let col = 0; col < Math.floor(w); col++) {
            const x = x0 + col + 0.5;
            const z = z0 + row + 0.5;
            if (inAisle(x, z)) continue;
            cells.push({ name: `${columnLetter(col)}${row + 1}`, x, z });
        }
    }

    return { cells, aisles };
}
