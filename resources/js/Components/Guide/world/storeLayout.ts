import { STORE, rackSpan } from "./places.ts";

/**
 * The Main Store's physical racking, as it is built. Each run is one wall of
 * steel racks: its columns (named by the shop, a to o, carrying on from wall to
 * wall) and how many rows each column has, row 1 at the top.
 *
 * `columns` are listed in the order the wall is read standing inside the shop
 * facing it, left to right:
 *   left wall   a at the front (door end) to c at the back
 *   back wall   d at the left to h at the right
 *   right wall  i at the back to k at the front
 *   front wall  l at the right to o at the left, over the door
 *
 * Every run hangs, wall to wall: two rows' height of store floor stays under it
 * (UNDER_SHELF), where cartons can stand; the front wall's starts above the door.
 *
 * A physical spot is its column and row ("f6"). A spot of the seller's shelf
 * (the A–E × 1–10 grid) is placed on one of these: a spot can carry up to
 * four, named f6a to f6d once they are placed.
 */
export type RackWall = "west" | "north" | "east" | "south";

export interface RackRun {
    wall: RackWall;
    /** What the wall is called, from the seller's side. */
    label: string;
    columns: string[];
    rows: number;
    /** Hangs from the ceiling instead of standing on the floor. */
    suspended: boolean;
}

export const RACKS: RackRun[] = [
    { wall: "west", label: "Left wall", columns: ["a", "b", "c"], rows: 6, suspended: true },
    { wall: "north", label: "Back wall", columns: ["d", "e", "f", "g", "h"], rows: 6, suspended: true },
    { wall: "east", label: "Right wall", columns: ["i", "j", "k"], rows: 3, suspended: true },
    { wall: "south", label: "Front wall, over the door", columns: ["l", "m", "n", "o"], rows: 3, suspended: true },
];

/** How many seller-shelf spots one physical spot can carry (f6a to f6d). */
export const SPOT_CAPACITY = 4;

/** Height of one row, in metres. */
export const SHELF_ROW = 1.2;

/** The store floor left under a run: 1.2 m, three cartons high. */
export const UNDER_SHELF = 1.2;

/** Where every run's top is, so the four tops are level: the tallest run (6 rows) standing on the floor strip. */
export const RACK_TOP = UNDER_SHELF + Math.max(...RACKS.map((r) => r.rows)) * SHELF_ROW;

/** Where a run's bottom is: its top is level with the others', so a shorter run is pushed up (the right wall's, over the door's). */
export function rackBottom(run: RackRun): number {
    return RACK_TOP - run.rows * SHELF_ROW;
}

/** A run's face: how tall it is, where its middle is, and how tall each row is. */
export function rackFace(run: RackRun): { height: number; centerY: number; rowHeight: number } {
    const height = run.rows * SHELF_ROW;

    return { height, centerY: rackBottom(run) + height / 2, rowHeight: SHELF_ROW };
}

/** The spot under a point of a run's face: u runs left to right and v bottom to top, as three.js gives them. */
export function spotAt(run: RackRun, u: number, v: number): string {
    const col = Math.min(run.columns.length - 1, Math.max(0, Math.floor(u * run.columns.length)));
    const row = Math.min(run.rows - 1, Math.max(0, Math.floor((1 - v) * run.rows)));

    return `${run.columns[col]}${row + 1}`;
}

/** The slot (0 to 3, left to right) of a spot under a point of a run's face: u runs left to right across the whole face. */
export function slotAtU(run: RackRun, u: number): number {
    const across = Math.min(0.99999, Math.max(0, u)) * run.columns.length;

    return Math.min(SPOT_CAPACITY - 1, Math.floor((across - Math.floor(across)) * SPOT_CAPACITY));
}

/** The run a spot code belongs to, with its column and row. */
export function describeSpot(code: string): { run: RackRun; column: string; row: number } | null {
    const column = code.slice(0, 1);
    const row = Number(code.slice(1));
    const run = RACKS.find((r) => r.columns.includes(column));

    return run && row >= 1 && row <= run.rows ? { run, column, row } : null;
}

/** Every physical spot, in reading order, for counting. */
export const SPOT_COUNT = RACKS.reduce((sum, r) => sum + r.columns.length * r.rows, 0);

/** Where a point `alongM` metres along a run's face (from its left end, read from inside) and `out` metres from the wall stands, relative to the shop's centre: [x, z]. */
export function runPoint(run: RackRun, alongM: number, out: number): [number, number] {
    const [w, d] = STORE.size;
    const along = alongM - rackSpan(run.wall) / 2;
    switch (run.wall) {
        case "west": return [-w / 2 + out, -along];
        case "east": return [w / 2 - out, along];
        case "north": return [along, -d / 2 + out];
        case "south": return [-along, d / 2 - out];
    }
}

/** Which way is into the shop from a run, [x, z]. */
export const INTO_SHOP: Record<RackWall, [number, number]> = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] };

/** One slot of a spot (f6a to f6d): where it is along its run (metres from the left end), its width, and the floor of its row. */
export function slotFrame(code: string, slot: number): { run: RackRun; from: number; width: number; floorY: number; midY: number } | null {
    const found = describeSpot(code);
    if (!found) return null;
    const { run, column, row } = found;
    const spotWidth = rackSpan(run.wall) / run.columns.length;
    const width = spotWidth / SPOT_CAPACITY;
    // Row 1 is the top row.
    const floorY = rackBottom(run) + (run.rows - row) * SHELF_ROW;
    return { run, from: run.columns.indexOf(column) * spotWidth + slot * width, width, floorY, midY: floorY + SHELF_ROW / 2 };
}

/** The tiny carton on a shelf: the same size everywhere. */
export const SHELF_BOX = 0.2;

/** How many tiny cartons one slot holds: across its width, two deep, two high. */
export function slotCapacity(width: number): number {
    return Math.max(1, Math.floor((width - 0.1) / (SHELF_BOX + 0.04))) * 2 * 2;
}

/** Where tiny carton `i` of a slot stands: [x, y of its centre, z], relative to the shop's centre. They fill along the slot, then the second row back, then the second layer. */
export function slotBox(code: string, slot: number, i: number): [number, number, number] | null {
    const frame = slotFrame(code, slot);
    if (!frame) return null;
    const across = Math.max(1, Math.floor((frame.width - 0.1) / (SHELF_BOX + 0.04)));
    const step = SHELF_BOX + 0.04;
    const ia = i % across;
    const depth = Math.floor(i / across) % 2;
    const layer = Math.floor(i / (across * 2));
    const [x, z] = runPoint(frame.run, frame.from + 0.07 + (ia + 0.5) * step, 0.06 + SHELF_BOX / 2 + depth * step);
    return [x, frame.floorY + 0.02 + SHELF_BOX / 2 + layer * step, z];
}
