import { RACKS, SPOT_CAPACITY } from "./storeLayout.ts";

/**
 * The seller's shelf (its bins, WorldFeed::shelf) laid onto the physical racks.
 * Which bin sits on which physical spot is not recorded, so the world places
 * them in the order the shelf lists its bins: spot a1, a2 … (a spot carries up
 * to SPOT_CAPACITY, named a1a to a1d), wall after wall. The racks' own
 * numbers (refill line, low line, how full) are the bins' real ones.
 */

export interface ShelfBin {
    item_id: number;
    name: string;
    display: string;
    /** 0..1 of the bin's maximum. */
    fill: number;
    /** How many of the bin's unit (the packaging its band counts in) are on the shelf. */
    in_unit?: number;
    status: "empty" | "critical" | "refill" | "ok";
    assigned: boolean;
    band: { max: number; refill: number; critical: number; unit: string } | null;
}

/** Every physical spot, in the order bins are placed. */
export const SPOT_ORDER: string[] = RACKS.flatMap((run) => run.columns.flatMap((column) => Array.from({ length: run.rows }, (_, row) => `${column}${row + 1}`)));

/** The placement the world drew last (set when the shelf arrives), for the zones of the shelving job. */
export let shelfPlacement: Map<string, ShelfBin[]> = new Map();

/** The bins on each spot (up to SPOT_CAPACITY, in order); spots with none are left out. */
export function placeBins(bins: ShelfBin[]): Map<string, ShelfBin[]> {
    const placed = new Map<string, ShelfBin[]>();
    bins.slice(0, SPOT_ORDER.length * SPOT_CAPACITY).forEach((bin, i) => {
        const code = SPOT_ORDER[Math.floor(i / SPOT_CAPACITY)];
        placed.set(code, [...(placed.get(code) ?? []), bin]);
    });
    return placed;
}

/** The world drew these bins on the racks: keep the placement for the shelving job's zones and tell its listeners. */
export function placeShelf(bins: ShelfBin[]): Map<string, ShelfBin[]> {
    shelfPlacement = placeBins(bins);
    stockDrawn();
    return shelfPlacement;
}

/** Where a bin's two lines sit along its bar, 0..1 of the maximum: the refill line and the low (critical) line. */
export function barLines(bin: ShelfBin): { refill: number; critical: number } | null {
    if (!bin.band || !(bin.band.max > 0)) return null;
    return { refill: Math.min(1, bin.band.refill / bin.band.max), critical: Math.min(1, bin.band.critical / bin.band.max) };
}

const listeners = new Set<() => void>();
/** Call `fn` whenever the world draws its stock again (floor stacks, shelf bins): the shelving job's zones follow them. Returns the way to stop. */
export function onStockDrawn(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function stockDrawn(): void {
    listeners.forEach((fn) => fn());
}
