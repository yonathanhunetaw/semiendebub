import { STORE } from "./places";

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
 * The right and front walls are suspended from the ceiling: three rows
 * hanging in the band above head height (the front wall's above the door).
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
    { wall: "west", label: "Left wall", columns: ["a", "b", "c"], rows: 6, suspended: false },
    { wall: "north", label: "Back wall", columns: ["d", "e", "f", "g", "h"], rows: 6, suspended: false },
    { wall: "east", label: "Right wall", columns: ["i", "j", "k"], rows: 3, suspended: true },
    { wall: "south", label: "Front wall, over the door", columns: ["l", "m", "n", "o"], rows: 3, suspended: true },
];

/** How many seller-shelf spots one physical spot can carry (f6a to f6d). */
export const SPOT_CAPACITY = 4;

/** Height of one row of a suspended run, in metres. */
export const SUSPENDED_ROW = 0.45;

/** The bottom of a standing run: a hand above the floor. */
const STANDING_BASE = 0.1;

/** A run's face: how tall it is, where its middle is, and how tall each row is. */
export function rackFace(run: RackRun): { height: number; centerY: number; rowHeight: number } {
    const height = run.suspended ? run.rows * SUSPENDED_ROW : STORE.wall - STANDING_BASE;

    return {
        height,
        centerY: run.suspended ? STORE.wall - height / 2 : STANDING_BASE + height / 2,
        rowHeight: height / run.rows,
    };
}

/** The spot under a point of a run's face: u runs left to right and v bottom to top, as three.js gives them. */
export function spotAt(run: RackRun, u: number, v: number): string {
    const col = Math.min(run.columns.length - 1, Math.max(0, Math.floor(u * run.columns.length)));
    const row = Math.min(run.rows - 1, Math.max(0, Math.floor((1 - v) * run.rows)));

    return `${run.columns[col]}${row + 1}`;
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
