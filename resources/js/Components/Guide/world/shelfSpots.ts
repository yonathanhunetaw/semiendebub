import { RACKS, SPOT_CAPACITY } from "./storeLayout.ts";

/**
 * The seller's shelf (its bins, WorldFeed::shelf) laid onto the physical racks.
 * A shelf manager can put a bin on a slot ("f6c"; it is recorded: `spot`). A bin
 * with no recorded slot is placed in the order the shelf lists its bins, in the
 * slots nobody holds: spot a1, a2 … (a spot carries up to SPOT_CAPACITY, named
 * a1a to a1d), wall after wall. The racks' own numbers (refill line, low line,
 * how full) are the bins' real ones.
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
    /** The slot of the racks it was put on ("f6c"), or null/absent: the world places it. */
    spot?: string | null;
    band: { max: number; refill: number; critical: number; unit: string } | null;
}

/** Every physical spot, in the order bins are placed. */
export const SPOT_ORDER: string[] = RACKS.flatMap((run) => run.columns.flatMap((column) => Array.from({ length: run.rows }, (_, row) => `${column}${row + 1}`)));

/** The placement the world drew last (set when the shelf arrives), for the zones of the shelving job. */
export let shelfPlacement: Map<string, ShelfBin[]> = new Map();

/** Every slot of the racks, in reading order (a1a, a1b, a1c, a1d, a2a …). */
export const SLOT_ORDER: string[] = SPOT_ORDER.flatMap((spot) => Array.from({ length: SPOT_CAPACITY }, (_, i) => `${spot}${"abcd"[i]}`));
const SLOTS = new Set(SLOT_ORDER);

/**
 * The bins on each spot, by slot: `list[slot]` is the bin on slot 0 to 3 (a spot with only slot c taken has holes before it);
 * spots with none are left out. Recorded slots first; the rest fill the free slots in the shelf's order.
 */
export function placeBins(bins: ShelfBin[]): Map<string, ShelfBin[]> {
    const taken = new Map<string, ShelfBin>();
    const loose: ShelfBin[] = [];
    for (const bin of bins) {
        const slot = bin.spot ? bin.spot.toLowerCase() : null;
        if (slot && SLOTS.has(slot) && !taken.has(slot)) taken.set(slot, bin);
        else loose.push(bin);
    }
    let next = 0;
    for (const bin of loose) {
        while (next < SLOT_ORDER.length && taken.has(SLOT_ORDER[next])) next++;
        if (next >= SLOT_ORDER.length) break;
        taken.set(SLOT_ORDER[next++], bin);
    }
    const placed = new Map<string, ShelfBin[]>();
    for (const code of SLOT_ORDER) {
        const bin = taken.get(code);
        if (!bin) continue;
        const spot = code.slice(0, -1);
        const list = placed.get(spot) ?? [];
        list[code.slice(-1).charCodeAt(0) - 97] = bin;
        placed.set(spot, list);
    }
    return placed;
}

/** The slot ("f6c") an item's bin stands on in this placement, or null when it is not on the racks. */
export function slotOfItem(placed: Map<string, ShelfBin[]>, itemId: number): string | null {
    for (const [spot, list] of placed) {
        const slot = list.findIndex((bin) => bin?.item_id === itemId);
        if (slot >= 0) return `${spot}${"abcd"[slot]}`;
    }
    return null;
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
