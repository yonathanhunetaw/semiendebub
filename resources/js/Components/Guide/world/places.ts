import type { IdentityColor, IdentityKey } from "@/Components/Visual/identities";

/**
 * The Duka world: the places stock lives in, and the roads it travels between
 * them. Pure data; DukaWorld draws it.
 *
 * One world unit is one metre. x runs across, z towards the viewer; the store
 * faces +z and the Remote Hub stands behind it. The two Main Hubs share a
 * compound far to the west and only ever send shipments, to the store or the
 * Remote Hub; orders go out to customers from the store or the Remote Hub.
 *
 * `chapters` are keys into the Guide's CHAPTERS, so a place can open the story
 * of the work done there.
 */

export type PlaceShape = "hub" | "shelves" | "floor" | "bay" | "houses" | "tower";

export type PlaceKey = "main_hub_a" | "main_hub_b" | "store_shelf" | "store_floor" | "remote_hub" | "loading_bay" | "customers" | "admin_hq";

export interface Place {
    key: PlaceKey;
    label: string;
    /** One line: what this place is for. */
    does: string;
    /** What happens here, in the order it usually happens. */
    happens: string[];
    /** Centre of the footprint, [x, z] in metres. */
    position: [number, number];
    /** Footprint, [width along x, depth along z] in metres. */
    size: [number, number];
    /** Wall height in metres, for the buildings that have walls. */
    height?: number;
    shape: PlaceShape;
    /** Inside the store building, so it has no walls or roof of its own. */
    indoor?: boolean;
    /** Who works here; the first one's colour tints the building. */
    roles: IdentityKey[];
    chapters: string[];
}

/** A point a road bends through: a place, or a bare [x, z] (a gate, a junction). */
export type Waypoint = PlaceKey | [number, number];

export type FlowKey = "shipment" | "refill" | "order";

export interface Flow {
    key: FlowKey;
    label: string;
    does: string;
    color: IdentityColor;
    paths: Waypoint[][];
}

/** The Main Store building: shelves at the front-left, its floor to the right. No roof, so you can see in. */
export const STORE = { label: "Main Store", position: [20, 8] as [number, number], size: [16, 10] as [number, number], wall: 2.6 };

/** The fenced yard both Main Hubs stand in. */
export const COMPOUND = { label: "Main Hub compound", position: [-58, 0] as [number, number], size: [34, 26] as [number, number] };

/** Where the compound's road leaves the gate. */
const GATE: [number, number] = [-39, 0];

export const PLACES: Place[] = [
    {
        key: "main_hub_a",
        label: "Main Hub A",
        does: "The big central warehouse, 15 × 15 m. Bulk stock in cartons.",
        happens: ["Hold bulk stock, carton by carton", "Pack shipments for the store and the Remote Hub", "Ships only; never sells or delivers to customers"],
        position: [-63, 0],
        size: [15, 15],
        height: 8,
        shape: "hub",
        roles: ["stock_keeper", "delivery"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "main_hub_b",
        label: "Main Hub B",
        does: "The second warehouse in the same compound, 4 × 12 m.",
        happens: ["Hold the overflow from Hub A", "Pack shipments for the store and the Remote Hub", "Ships only; never sells or delivers to customers"],
        position: [-49, 0],
        size: [4, 12],
        height: 6,
        shape: "hub",
        roles: ["stock_keeper"],
        chapters: ["moving"],
    },
    {
        key: "store_shelf",
        label: "Store Shelf",
        does: "The shelves inside the store. Customers buy here, a piece at a time.",
        happens: ["A seller finds the item and builds the cart", "Payment is taken and confirmed by a second person", "Each item has a bin; it raises an alert when it runs low"],
        position: [16, 8.5],
        size: [6, 7],
        shape: "shelves",
        indoor: true,
        roles: ["seller", "customer", "store_manager"],
        chapters: ["seller"],
    },
    {
        key: "store_floor",
        label: "Store Floor",
        does: "The store's floor: the boxes and cartons not yet on a shelf.",
        happens: ["Receive shipments from the Main Hubs", "Refill the shelf: no approval needed", "Pick & pack orders for delivery"],
        position: [24.5, 8],
        size: [6, 8],
        shape: "floor",
        indoor: true,
        roles: ["stock_keeper"],
        chapters: ["stock_keeper"],
    },
    {
        key: "remote_hub",
        label: "Remote Hub",
        does: "The warehouse behind the store, as big as the store itself.",
        happens: ["Receive shipments from the Main Hubs", "Send stock into the store when the floor runs short", "Orders can be delivered straight from here", "Sellers only see whether an item is stocked here"],
        position: [20, -8],
        size: [16, 10],
        height: 5,
        shape: "hub",
        roles: ["stock_keeper", "store_manager"],
        chapters: ["moving", "stock_keeper"],
    },
    {
        key: "loading_bay",
        label: "Delivery",
        does: "Where couriers load: beside the store and the Remote Hub.",
        happens: ["Take a run from the list on offer", "Collect the parcel: custody is now the courier's", "Hand it over, or report why it failed", "Drive shipments in from the Main Hubs"],
        position: [36, 0],
        size: [8, 8],
        shape: "bay",
        roles: ["delivery"],
        chapters: ["delivery", "moving"],
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
        happens: ["Keep the catalogue and set prices", "Set shelf levels and refill routes", "Build shipment manifests from the Main Hubs", "Look after the people and their roles"],
        position: [0, 22],
        size: [6, 6],
        height: 9,
        shape: "tower",
        roles: ["admin", "store_manager"],
        chapters: ["admin", "moving"],
    },
];

export const FLOWS: Flow[] = [
    {
        key: "shipment",
        label: "Shipments",
        does: "Bulk stock from the Main Hubs to the store or the Remote Hub. The only thing the hubs send.",
        color: "warning",
        paths: [
            ["main_hub_a", GATE, "remote_hub"],
            ["main_hub_a", GATE, "store_floor"],
            ["main_hub_b", GATE, "remote_hub"],
            ["main_hub_b", GATE, "store_floor"],
        ],
    },
    {
        key: "refill",
        label: "Refills",
        does: "The Remote Hub tops up the store floor; the floor tops up the shelf.",
        color: "success",
        paths: [
            ["remote_hub", "store_floor"],
            ["store_floor", "store_shelf"],
        ],
    },
    {
        key: "order",
        label: "Deliveries",
        does: "Orders go out to customers, from the store or straight from the Remote Hub.",
        color: "primary",
        paths: [
            ["store_floor", "loading_bay", "customers"],
            ["remote_hub", "loading_bay", "customers"],
        ],
    },
];

export function placeFor(key: PlaceKey): Place {
    const place = PLACES.find((p) => p.key === key);
    if (!place) throw new Error(`Unknown place ${key}`);
    return place;
}

/** Where a waypoint is on the ground. */
export function pointOf(waypoint: Waypoint): [number, number] {
    return typeof waypoint === "string" ? placeFor(waypoint).position : waypoint;
}

export function flowsThrough(key: PlaceKey): Flow[] {
    return FLOWS.filter((flow) => flow.paths.some((path) => path.includes(key)));
}
