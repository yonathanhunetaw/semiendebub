import { STORE, STORE_CORNER, hubLayout, placeFor, type PlaceKey } from "./places.ts";

/**
 * The stock as the world shows it: real boxes. An item stands in a place with
 * as many boxes as that place really holds of its biggest packaging
 * (WorldFeed::catalogue `boxes`: stock in pieces over the packaging's pieces),
 * every box the same size, stacked on one cell. Where an item lies inside a
 * hub is not recorded, so its cell is shared out by name over the hub's cells.
 * The shop's floor stock stands in rows in front of the back wall's racks.
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
}

export type StockPlace = "main_hub_a" | "main_hub_b" | "store_floor";

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

export const CATALOGUE_HUBS: PlaceKey[] = ["main_hub_a", "main_hub_b"];

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

/** The cells of the shop's floor stock: rows along the back wall, in front of the racks, clear of the pallets in the corner. */
export function storeFloorCells(): Array<{ name: string; x: number; z: number }> {
    const x0 = STORE_CORNER.nw[0] + 5;
    const x1 = STORE_CORNER.ne[0] - 2;
    const cells: Array<{ name: string; x: number; z: number }> = [];
    for (let row = 0; row < 4; row++) {
        for (let x = x0; x <= x1; x += 1) cells.push({ name: `F${row + 1}-${cells.length + 1}`, x, z: STORE_CORNER.nw[1] + STORE.shelfDepth + 0.9 + row * 1.2 });
    }
    return cells;
}

/** Share `items` (already those with boxes) over `cells`, evenly spread; items past the cells are left out. */
function spread<T>(items: CatalogueItem[], cells: T[], place: (item: CatalogueItem, cell: T) => HubBox): HubBox[] {
    const count = Math.min(items.length, cells.length);
    const stride = cells.length / Math.max(1, count);
    return Array.from({ length: count }, (_, i) => place(items[i], cells[Math.floor(i * stride)]));
}

export function hubBoxes(items: CatalogueItem[]): HubBox[] {
    const out: HubBox[] = [];
    for (const key of CATALOGUE_HUBS) {
        const place = placeFor(key);
        const here = items.filter((item) => (item.boxes?.[key as StockPlace] ?? 0) > 0);
        out.push(...spread(here, hubLayout(place).cells, (item, cell) => ({
            item, hub: key, cell: cell.name, at: [place.position[0] + cell.x, place.position[1] + cell.z], side: STACK_FOOTPRINT, count: item.boxes![key as StockPlace]!,
        })));
    }
    const floor = items.filter((item) => (item.boxes?.store_floor ?? 0) > 0);
    out.push(...spread(floor, storeFloorCells(), (item, cell) => ({
        item, hub: "store_floor", cell: cell.name, at: [cell.x, cell.z], side: STACK_FOOTPRINT, count: item.boxes!.store_floor!,
    })));
    return out;
}

/** The boxes Play's worker cannot walk through (siteBlockers.ts); set when the catalogue arrives. */
export let catalogueBoxes: HubBox[] = [];
export function setCatalogueBoxes(boxes: HubBox[]): void {
    catalogueBoxes = boxes;
}
