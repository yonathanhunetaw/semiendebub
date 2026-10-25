import { STORE, STORE_CORNER, hubLayout, placeFor, type PlaceKey } from "./places.ts";
import { stockDrawn } from "./shelfSpots.ts";

/**
 * The stock as the world shows it: real boxes. An item stands in a place with
 * as many boxes as that place really holds of its biggest packaging
 * (WorldFeed::catalogue `boxes`: stock in pieces over the packaging's pieces),
 * every box the same size, stacked on one cell. Where an item lies inside a
 * hub is not recorded, so its cell is shared out by name over the hub's cells.
 * The shop's floor stock stands in a ring round the foot of the racks.
 */

export interface CatalogueItem {
    item_id: number;
    name: string;
    variant_id: number;
    packaging: string | null;
    tier: string | null;
    pieces: number | null;
    cbm: number | null;
    /** How many boxes each place holds (a place with none is missing). */
    boxes?: Partial<Record<StockPlace, number>>;
    /** What a carton holds, biggest packaging first: [{ Carton, 1000 }, { Packet, 50 }, { Piece, 1 }]. */
    pack?: Array<{ name: string; pieces: number }>;
}

export type StockPlace = "main_hub_a" | "main_hub_b" | "remote_hub" | "store_floor";

/** The lines written under an item's name: "1 Carton", "= 20 Packets", "= 1000 Pieces". Empty when the item has no packaging data. */
export function packLines(pack: CatalogueItem["pack"]): string[] {
    const tiers = (pack ?? []).filter((t) => t.pieces >= 1);
    if (tiers.length === 0) return [];
    const plural = (name: string, n: number) => (n === 1 || /s$/i.test(name) ? name : `${name}s`);
    const [top, ...rest] = tiers;
    const lines = [`1 ${top.name}`];
    for (const tier of rest) {
        if (tier.pieces === top.pieces) continue;
        const n = Math.round((top.pieces / tier.pieces) * 100) / 100;
        lines.push(`= ${n} ${plural(tier.name, n)}`);
    }
    // The total in pieces, unless the last line already says it.
    if (top.pieces > 1 && !(tiers[tiers.length - 1].pieces === 1)) lines.push(`= ${top.pieces} pieces`);
    return lines;
}

export interface HubBox {
    item: CatalogueItem;
    hub: PlaceKey;
    cell: string;
    /** Centre of the stack on the floor, world [x, z]. */
    at: [number, number];
    /** Width of the stack's footprint, metres (what blocks the worker). */
    side: number;
    /** The real number of boxes there; at most STACK_MAX are drawn. */
    count: number;
}

export const CATALOGUE_HUBS: PlaceKey[] = ["main_hub_a", "main_hub_b", "remote_hub"];

/** Every box is the same carton: 40 cm a side. */
export const BOX_SIDE = 0.4;
/** A stack is two boxes across, two deep and up to three high on a 1 m cell. */
export const STACK_ACROSS = 2;
export const STACK_MAX = STACK_ACROSS * STACK_ACROSS * 3;
export const STACK_FOOTPRINT = STACK_ACROSS * BOX_SIDE;

/** How many boxes are drawn for a count (the rest is said in the label). */
export const shown = (count: number): number => Math.min(STACK_MAX, Math.max(0, Math.floor(count)));

/** Where box number i (from 0) of a stack stands, relative to the cell's centre: [x, y of its centre above the floor, z]. */
export function stackSlot(i: number): [number, number, number] {
    const layer = Math.floor(i / (STACK_ACROSS * STACK_ACROSS));
    const k = i % (STACK_ACROSS * STACK_ACROSS);
    const offset = (n: number) => (n - (STACK_ACROSS - 1) / 2) * BOX_SIDE;
    return [offset(k % STACK_ACROSS), BOX_SIDE / 2 + layer * BOX_SIDE, offset(Math.floor(k / STACK_ACROSS))];
}

/**
 * The cells of the shop's floor stock: a ring round the foot of the racks, in front of them, three cartons high under the run:
 * the west wall first (columns a, b, c), then the back wall, the right wall and the front wall either side of the door.
 */
export function storeFloorCells(): Array<{ name: string; x: number; z: number }> {
    const [nx, nz] = STORE_CORNER.nw;
    const [ex, sz] = STORE_CORNER.se;
    const doorX = nx + STORE.door.at;
    const inset = STORE.shelfDepth + 0.55;
    const edge = inset + 0.5;
    const raw: Array<{ wall: string; x: number; z: number }> = [];
    for (let z = sz - edge - 1.2; z >= nz + edge; z -= 1) raw.push({ wall: "W", x: nx + inset, z });
    for (let x = nx + edge; x <= ex - edge; x += 1) raw.push({ wall: "N", x, z: nz + inset });
    for (let z = nz + edge; z <= sz - edge - 1.2; z += 1) raw.push({ wall: "E", x: ex - inset, z });
    for (let x = ex - edge; x >= nx + edge; x -= 1) if (Math.abs(x - doorX) > STORE.door.width / 2 + 1.6) raw.push({ wall: "S", x, z: sz - inset });
    return raw.map((c, i) => ({ name: `${c.wall}${i + 1}`, x: c.x, z: c.z }));
}

/**
 * Stand an item's boxes on consecutive cells, a full stack (STACK_MAX) to a cell, so a place with a lot of stock fills its floor
 * and the count on the floor is the count in stock. Items follow each other in name order; boxes past the last cell are left out.
 */
function fill(items: CatalogueItem[], key: PlaceKey & StockPlace, cells: Array<{ name: string; x: number; z: number }>, origin: [number, number]): HubBox[] {
    const out: HubBox[] = [];
    let next = 0;
    for (const item of items) {
        for (let left = item.boxes?.[key] ?? 0; left > 0 && next < cells.length; left -= STACK_MAX) {
            const cell = cells[next++];
            out.push({ item, hub: key, cell: cell.name, at: [origin[0] + cell.x, origin[1] + cell.z], side: STACK_FOOTPRINT, count: Math.min(STACK_MAX, left) });
        }
    }
    return out;
}

export function hubBoxes(items: CatalogueItem[]): HubBox[] {
    const out: HubBox[] = [];
    for (const key of CATALOGUE_HUBS) {
        const place = placeFor(key);
        const here = items.filter((item) => (item.boxes?.[key as StockPlace] ?? 0) > 0);
        out.push(...fill(here, key as PlaceKey & StockPlace, hubLayout(place).cells, place.position));
    }
    // From the west wall round: the foot of the racks fills up in order.
    const floor = items.filter((item) => (item.boxes?.store_floor ?? 0) > 0);
    out.push(...fill(floor, "store_floor" as PlaceKey & StockPlace, storeFloorCells(), [0, 0]));
    return out;
}

/** The boxes Play's worker cannot walk through (siteBlockers.ts); set when the catalogue arrives. */
export let catalogueBoxes: HubBox[] = [];
export function setCatalogueBoxes(boxes: HubBox[]): void {
    catalogueBoxes = boxes;
    stockDrawn();
}
