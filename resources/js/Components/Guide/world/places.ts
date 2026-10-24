import type { IdentityKey } from "@/Components/Visual/identities";

/**
 * The Duka world: the places stock lives in and the roads the vans drive.
 * Pure data; DukaWorld draws it.
 *
 * One world unit is one metre. x runs east, z runs south (towards the
 * viewer). One street runs west to east; every place stands on its north side,
 * in the order stock moves: the Suppliers (where orders come in), the Storage
 * hub (where it is gathered and put in a container), the Main Hub compound
 * (Hub A and Hub B, with the platform in their yard and an open way in, no
 * gate), the Remote Hub, the Main Store (the Delivery platform in front), the
 * Customer parking (customers wait in their car; walk-ins come to the
 * counter), the Shops we deliver to, and Admin at the east end. There are no
 * home deliveries.
 *
 * `chapters` are keys into the Guide's CHAPTERS.
 */

export type PlaceShape = "hub" | "platform" | "shelves" | "floor" | "counter" | "cars" | "tower" | "shops";

export type PlaceKey = "main_hub_a" | "main_hub_b" | "platform" | "store_shelf" | "store_floor" | "store_counter" | "remote_hub" | "office" | "admin_hq" | "loading_bay" | "customers" | "supplier" | "storage_hub" | "shops";

/** Which way out of a building each side faces, [x, z]. */
export const SIDE_OUT: Record<"north" | "south" | "east" | "west", [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

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
    /** A sign over the door, outside (the office says OFFICE). */
    sign?: string;
    cells?: boolean;
    /** Shops: the buildings, relative to the centre, [x, z, width, depth, height, the side their door is on]. */
    blocks?: Array<[number, number, number, number, number, "north" | "south" | "east" | "west"]>;
    /** Which side faces the street (and has the way in): north-row places face south, south-row places north. */
    faces?: "north" | "south";
    /** Where the label floats, relative to the centre, when not straight above it. */
    labelAt?: [number, number, number];
    roles: IdentityKey[];
    chapters: string[];
}

/**
 * The Main Store: 16 × 18 m (roomy, so there is space to move about), 5.2 m
 * high, open-topped so you can see in. The 2.2 m main door is in the south wall,
 * 7 m from the west wall. The counter stands in the middle, facing the door as you
 * walk in, 4 m long, with the Delivery platform beside it; a metal divider is fixed
 * to the front wall at the door's west edge. The racking (storeLayout.ts) runs
 * wall to wall on all four walls, 50 cm deep, and hangs: two rows' height of
 * store floor stays under it (over the door, it starts above the door). The rest
 * of the floor is the Store Floor, with the pallets in the north-west corner.
 */
export const STORE = {
    label: "Main Store",
    // In the north row: its front (and door) on the street side, at z = -FRONT.
    position: [-8, -18] as [number, number],
    size: [16, 18] as [number, number],
    wall: 5.2,
    door: { at: 7, width: 2.2, height: 2.3 },
    shelfDepth: 0.5,
    /** Height of the floor strip under the lowest shelf. */
    plinth: 0.5,
    counter: { width: 4, depth: 0.8, height: 1, z: 0 },
};

/** How long one wall's run of racks is: wall to wall, less a rack's depth at each end where it meets the next wall's run. */
export function rackSpan(wall: "west" | "north" | "east" | "south"): number {
    return (wall === "north" || wall === "south" ? STORE.size[0] : STORE.size[1]) - 2 * STORE.shelfDepth;
}

/** The store's corners, [x, z]: things are placed against a wall, so they are measured from the corner they stand in. */
export const STORE_CORNER = {
    nw: [STORE.position[0] - STORE.size[0] / 2, STORE.position[1] - STORE.size[1] / 2] as [number, number],
    ne: [STORE.position[0] + STORE.size[0] / 2, STORE.position[1] - STORE.size[1] / 2] as [number, number],
    sw: [STORE.position[0] - STORE.size[0] / 2, STORE.position[1] + STORE.size[1] / 2] as [number, number],
    se: [STORE.position[0] + STORE.size[0] / 2, STORE.position[1] + STORE.size[1] / 2] as [number, number],
};

/**
 * The site is a zigzag along one street, running west to east along z = 0:
 * the places alternate between its north row (fronts at z = -FRONT, facing
 * south) and its south row (fronts at z = +FRONT, facing north), in the order
 * stock moves. Between each front and the street is the apron, where the
 * place's platform is: vans park and goods change hands there.
 *
 * The whole site is about 160 × 90 m: a phone held upright sees it top (west)
 * to bottom (east), the south row on the left, Suppliers at the top left; a
 * wide screen sees it west to east.
 */
export const STREET_Z = 0;
export const FRONT = 9;
/** The street, west end to east end. */
export const STREET: [number, number] = [-80, 78];

/** The Main Hub's fenced yard (south row), an upright rectangle of [x, z] corners, with the open way in (no gate) in its north fence. */
export const COMPOUND = {
    label: "Main Hub compound",
    corners: [[-48, FRONT], [-14, FRONT], [-14, 56], [-48, 56]] as Array<[number, number]>,
    opening: { at: [-23, FRONT] as [number, number], width: 6 },
};

/**
 * A fence line from (x1, z1) to (x2, z2) as the pieces either side of the
 * compound's opening, when the opening is on it; otherwise the whole line.
 */
export function fenceRuns(x1: number, z1: number, x2: number, z2: number): Array<[number, number, number, number]> {
    const [gx, gz] = COMPOUND.opening.at;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length < 1e-6) return [];
    const [ux, uz] = [(x2 - x1) / length, (z2 - z1) / length];
    const along = (gx - x1) * ux + (gz - z1) * uz;
    const off = Math.abs((gx - x1) * uz - (gz - z1) * ux);
    if (off > 0.01 || along <= 0 || along >= length) return [[x1, z1, x2, z2]];
    const half = COMPOUND.opening.width / 2;
    return [
        [x1, z1, x1 + ux * (along - half), z1 + uz * (along - half)],
        [x1 + ux * (along + half), z1 + uz * (along + half), x2, z2],
    ];
}

const STORE_DOOR_X = STORE_CORNER.sw[0] + STORE.door.at;

export const PLACES: Place[] = [
    {
        key: "supplier",
        label: "Suppliers",
        does: "The suppliers we buy from: where the orders come in, at the head of the street.",
        happens: ["Procurement checks prices and asks for quotes", "A purchase is agreed", "The goods are collected and taken to the Storage hub"],
        position: [-65, FRONT + 11],
        size: [14, 22],
        shape: "shops",
        faces: "north",
        // Three premises one behind the other, their doors on a lane along the east side.
        blocks: [[-2.5, -7, 9, 6, 3.5, "east"], [-2.5, 0, 9, 6, 3, "east"], [-2.5, 7, 9, 6, 4, "east"]],
        roles: ["procurement"],
        chapters: [],
    },
    {
        key: "storage_hub",
        label: "Storage hub",
        does: "Where bought stock is gathered, counted and checked, then put in a container to ship to the Main Hub.",
        happens: ["Receive the goods from each supplier", "Count and check them; set aside what is short or damaged", "Pack and load the container"],
        position: [-53, -FRONT - 11],
        size: [14, 22],
        height: 5,
        shape: "hub",
        door: { wall: "south", at: 7, width: 4 },
        roles: ["procurement", "stock_keeper"],
        chapters: [],
    },
    {
        key: "main_hub_a",
        label: "Main Hub A",
        does: "The big central warehouse, 20 × 20 m. Bulk stock in cartons, cell by cell.",
        happens: ["Pick the shipment's list from the cells", "Put the goods out on the platform", "Hand them to the driver, who loads and signs"],
        position: [-37, 45],
        size: [20, 20],
        height: 7,
        shape: "hub",
        door: { wall: "north", at: 10, width: 3 },
        cells: true,
        faces: "north",
        roles: ["stock_keeper"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "main_hub_b",
        label: "Main Hub B",
        does: "The long warehouse, 7 × 23 m, standing beside Hub A.",
        happens: ["Pick the shipment's list from the cells", "Put the goods out on the platform", "Hand them to the driver, who loads and signs"],
        position: [-18.5, 43.5],
        size: [7, 23],
        height: 6,
        shape: "hub",
        door: { wall: "north", at: 3.5, width: 3 },
        cells: true,
        faces: "north",
        roles: ["stock_keeper"],
        chapters: ["moving"],
    },
    {
        key: "platform",
        label: "Platform",
        does: "The 4 × 4 m pickup platform in the yard, in front of the hub doors.",
        happens: ["The origin hub puts the picked goods here", "They wait for the driver", "The driver checks them, loads the van and signs on the stock keeper's phone"],
        position: [-31, 24],
        size: [4, 4],
        shape: "platform",
        faces: "north",
        roles: ["stock_keeper", "delivery"],
        chapters: ["moving", "delivery"],
    },
    {
        key: "store_shelf",
        label: "Store Shelf",
        does: "The steel racking, 50 cm deep, wall to wall on all four walls, hanging with two rows' height of store floor under it.",
        happens: ["Each physical spot (like f6) carries up to four spots of the seller's shelf, named f6a to f6d once placed", "A seller-shelf spot at its refill line raises a refill from the floor", "Tap a spot to see what is on it"],
        position: STORE.position,
        size: STORE.size,
        shape: "shelves",
        indoor: true,
        labelAt: [0, STORE.wall + 1.1, -STORE.size[1] / 2 + 0.4],
        roles: ["stock_keeper", "store_manager"],
        chapters: ["stock_keeper", "seller"],
    },
    {
        key: "store_floor",
        label: "Store Floor",
        does: "The open floor between the racks and the counter: boxes and cartons not yet on a shelf.",
        happens: ["Receive shipments and transfers", "Refill the shelf: no approval needed", "Pick & pack orders for delivery"],
        position: STORE.position,
        size: STORE.size,
        shape: "floor",
        indoor: true,
        labelAt: [-2.5, 2.6, -2.2],
        roles: ["stock_keeper"],
        chapters: ["stock_keeper"],
    },
    {
        key: "store_counter",
        label: "Counter",
        does: "The 4 m counter in the middle of the shop, facing the door as you walk in. Sales happen here.",
        happens: ["The customer asks; the seller finds the item on the shelf", "The seller builds the cart and checks out", "Payment is confirmed by a second person", "In-store orders are handed over here"],
        // Across the shop, 5 m in from the front wall, a little east of the door: customers come up to it from the door.
        position: [STORE_DOOR_X + 2.6, STORE_CORNER.sw[1] - 5],
        size: [4, 0.8],
        shape: "counter",
        indoor: true,
        roles: ["seller", "customer"],
        chapters: ["seller"],
    },
    {
        key: "loading_bay",
        label: "Delivery",
        does: "The delivery platform inside the shop, beside the counter: couriers load orders here and take them out along the street to the customers' cars.",
        happens: ["Take a run from the list on offer", "Collect the parcel: custody is now the courier's", "Hand it over, or report why it failed"],
        position: [STORE_DOOR_X - 3.4, STORE_CORNER.sw[1] - 5.4],
        size: [3.6, 3.6],
        shape: "platform",
        indoor: true,
        roles: ["delivery"],
        chapters: ["delivery"],
    },
    {
        key: "remote_hub",
        label: "Remote Hub",
        does: "The store's own warehouse, across the street from it.",
        happens: ["Receive shipments from the Main Hubs", "Send stock into the store when the floor runs short", "Orders can be delivered straight from here"],
        position: [3, FRONT + 8],
        size: [10, 16],
        height: 5,
        shape: "hub",
        door: { wall: "north", at: 5, width: 3 },
        cells: true,
        faces: "north",
        roles: ["stock_keeper", "store_manager"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "office",
        label: "Office",
        does: "The back office: a desk for every part of the business, and the staff board with the shifts and who holds each key.",
        happens: ["Count in what arrived, settle what was short", "Confirm payments and approve orders, counts and purchases", "Read the board: who works when, and who holds which key"],
        position: [14, -FRONT - 12],
        size: [16, 24],
        height: 4,
        shape: "hub",
        // The entrance, in the south wall facing the street; the sign over it says OFFICE.
        door: { wall: "south", at: 8, width: 3 },
        sign: "OFFICE",
        roles: ["admin", "store_manager"],
        chapters: ["admin"],
    },
    {
        key: "customers",
        label: "Customer parking",
        does: "Ten numbered parking stops: a customer waits in their vehicle and the order is brought out to it. (Walk-in customers are served at the counter; there are no home deliveries.)",
        happens: ["Park at a numbered stop", "The courier brings the order to the vehicle and checks the receiver's name and phone", "Pay on delivery if they chose to"],
        position: [29.5, FRONT + 10],
        size: [20, 20],
        shape: "cars",
        faces: "north",
        roles: ["customer"],
        chapters: ["seller", "delivery"],
    },
    {
        key: "admin_hq",
        label: "Admin",
        does: "Runs the business: catalogue, prices, people and stock rules.",
        happens: ["Create shipments: the first of the four ticks", "Set shelf levels and refill routes", "Look after the people and their roles"],
        position: [42, -FRONT - 7],
        size: [10, 14],
        height: 14,
        shape: "tower",
        roles: ["admin", "store_manager"],
        chapters: ["admin", "moving"],
    },
    {
        key: "shops",
        label: "Shops",
        does: "The shops we deliver to, at the end of the street: two rows facing each other across a road.",
        happens: ["A shop orders from the store", "The order is delivered to the shop's door"],
        position: [58, FRONT + 14],
        size: [26, 28],
        shape: "shops",
        faces: "north",
        blocks: [[-7.5, -9, 9, 8, 4, "east"], [-7.5, 0, 9, 8, 3.5, "east"], [-7.5, 9, 9, 8, 4.5, "east"], [7.5, -9, 9, 8, 3.5, "west"], [7.5, 0, 9, 8, 4.5, "west"], [7.5, 9, 9, 8, 4, "west"]],
        roles: ["customer"],
        chapters: ["seller", "delivery"],
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
    // As in the real shop, measured from the north-west corner: 1.3 m from the west wall, 0.4 m from the back wall.
    [-STORE.size[0] / 2 + 1.3, -STORE.size[1] / 2 + 2.6, 1.3, 4.4, 3],
    [-STORE.size[0] / 2 + 3.2, -STORE.size[1] / 2 + 1.4, 1.3, 1.4, 1],
];
export const PALLET = 1.2;
/** Every pallet's centre, [x, z, its number within its area]. */
export function palletCentres(): Array<[number, number, number]> {
    return FLOOR_ZONES.flatMap(([x, z, , depth, pallets]) => Array.from({ length: pallets }, (_, i): [number, number, number] => [x, z - depth / 2 + 0.9 + i * 1.7, i]));
}

/** The vehicles customers wait in: [length, width, height], metres. An Isuzu is a light truck: a cab and a box. */
export type VehicleKind = "isuzu" | "minivan" | "sedan";
export const VEHICLE: Record<VehicleKind, [number, number, number]> = {
    isuzu: [6.6, 2.1, 2.9],
    minivan: [4.9, 1.9, 1.9],
    sedan: [4.6, 1.8, 1.45],
};

/**
 * The customers' parking stops, relative to that place's centre: two columns
 * of five either side of a lane up the middle, [x, z, what waits there (null:
 * free)]. Each stop is BAY_SIZE (along x, along z); a vehicle lies across it,
 * its nose to the lane. Numbered 1… from the street (north), the west column
 * first.
 */
export const BAY_SIZE: [number, number] = [7.5, 3.6];
const BAY_X = BAY_SIZE[0] / 2 + 2;
const BAY_Z = [-7.2, -3.6, 0, 3.6, 7.2];
const WAITING: Array<VehicleKind | null> = ["isuzu", "minivan", "isuzu", "sedan", "isuzu", "isuzu", null, "minivan", "isuzu", "minivan"];
export const CUSTOMER_BAYS: Array<[number, number, VehicleKind | null]> = [
    ...BAY_Z.map((z, i): [number, number, VehicleKind | null] => [-BAY_X, z, WAITING[i]]),
    ...BAY_Z.map((z, i): [number, number, VehicleKind | null] => [BAY_X, z, WAITING[i + 5]]),
];

/** A 40 ft container, [length, width, height]. */
export const CONTAINER: [number, number, number] = [12, 2.4, 2.6];
/** The container truck loading on the Storage hub's apron, along the street, cab to the east: [x, z]. */
export const CONTAINER_TRUCK: [number, number] = [-56, -FRONT + 3.5];

const doorX = (key: PlaceKey) => {
    const place = PLACES.find((p) => p.key === key)!;
    return place.position[0] - place.size[0] / 2 + place.door!.at;
};
const REMOTE_DOOR_X = doorX("remote_hub");

/** Where a van stops to unload at each shipment destination: on the apron, beside the door. */
export const PARKING: Partial<Record<PlaceKey, [number, number]>> = {
    store_floor: [STORE_DOOR_X + 3.5, -FRONT + 4],
    remote_hub: [REMOTE_DOOR_X + 3.5, FRONT - 4],
};

/** Where unloaded goods are set down: just outside the door they go in by. */
export const DROP: Partial<Record<PlaceKey, [number, number]>> = {
    store_floor: [STORE_DOOR_X, -FRONT + 1],
    remote_hub: [REMOTE_DOOR_X, FRONT - 1.5],
};

/** Where a van waits to load at the platform: alongside its east edge. */
export const PLATFORM_BERTH: [number, number] = [-26.5, 24];

const YARD: Array<[number, number]> = [PLATFORM_BERTH, [COMPOUND.opening.at[0], 20], [COMPOUND.opening.at[0], 12], [COMPOUND.opening.at[0], FRONT - 1], [COMPOUND.opening.at[0] + 4, STREET_Z]];

/**
 * The roads, as polylines of [x, z]: the one street; the Main Hub's yard from
 * the platform out to it; the lane up the customers' parking; and the road
 * between the two rows of shops.
 */
const parking = PLACES.find((p) => p.key === "customers")!;
const shops = PLACES.find((p) => p.key === "shops")!;
export const ROADS: Array<Array<[number, number]>> = [
    [[STREET[0], STREET_Z], [STREET[1], STREET_Z]],
    [[PLATFORM_BERTH[0] + 1, PLATFORM_BERTH[1] - 2], [COMPOUND.opening.at[0], 18], [COMPOUND.opening.at[0], FRONT + 1], [COMPOUND.opening.at[0], STREET_Z + 1]],
    [[parking.position[0], STREET_Z + 1], [parking.position[0], parking.position[1] + parking.size[1] / 2 - 1]],
    [[shops.position[0], STREET_Z + 1], [shops.position[0], shops.position[1] + shops.size[1] / 2 - 1]],
];

/** A van's path from the platform, out of the compound and along the street, to where it unloads. */
export function vanRoute(destination: PlaceKey): Array<[number, number]> {
    const to = PARKING[destination];
    if (!to) return YARD;
    return [...YARD, [to[0] - 12, STREET_Z], [to[0] - 4, Math.sign(to[1]) * 2], to];
}

/** The room (a hub, the shop, the office) whose walls stand round (x, z), as [minX, minZ, maxX, maxZ]; null outdoors. */
export function roomAt(x: number, z: number): [number, number, number, number] | null {
    const rooms: Array<{ position: [number, number]; size: [number, number] }> = [STORE, ...PLACES.filter((p) => p.shape === "hub")];
    for (const { position: [cx, cz], size: [w, d] } of rooms) {
        if (x > cx - w / 2 && x < cx + w / 2 && z > cz - d / 2 && z < cz + d / 2) return [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
    }
    return null;
}

/**
 * Where a worker stands to go into a place: outside its door, facing it (yaw 0
 * faces south, +z). The shop's own places use the shop's door; a place with no
 * door, the middle of its street side.
 */
export function doorPose(key: PlaceKey): { x: number; z: number; yaw: number } {
    const place = placeFor(key);
    if (place.indoor) return { x: STORE_DOOR_X, z: STORE_CORNER.sw[1] + 3.2, yaw: Math.PI };
    const door = doorPosition(place);
    if (door) {
        const [ox, oz] = door.out;
        return { x: door.at[0] + ox * 3.2, z: door.at[1] + oz * 3.2, yaw: Math.atan2(-ox, -oz) };
    }
    // Facing the place from its street side: a north-row place faces south, so the worker stands south of it, facing north.
    const out = place.faces === "north" ? -1 : 1;
    return { x: place.position[0], z: place.position[1] + out * (place.size[1] / 2 + 2.5), yaw: out > 0 ? Math.PI : 0 };
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
