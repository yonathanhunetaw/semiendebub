import { hubLayout, placeFor, type PlaceKey } from "./places.ts";

/**
 * The catalogue as the hubs show it: one box per item, in its biggest
 * packaging (WorldFeed::catalogue), stood on a 1 m cell of Main Hub A or B.
 * Where each item really lies is not recorded, so the boxes are shared out
 * by name: each hub gets its share of the items by how many cells it has, and
 * spreads them evenly over its cells.
 */

export interface CatalogueItem {
    item_id: number;
    name: string;
    variant_id: number;
    packaging: string | null;
    tier: string | null;
    pieces: number | null;
    cbm: number | null;
}

export interface HubBox {
    item: CatalogueItem;
    hub: PlaceKey;
    cell: string;
    /** Centre on the floor, world [x, z]. */
    at: [number, number];
    /** Side of the cube, metres. */
    side: number;
}

export const CATALOGUE_HUBS: PlaceKey[] = ["main_hub_a", "main_hub_b"];

/** A cube of the packaging's volume, kept inside its 1 m cell (and big enough to see). */
export function boxSide(cbm: number | null): number {
    if (cbm === null || !(cbm > 0)) return 0.5;
    return Math.min(0.9, Math.max(0.3, Math.cbrt(cbm)));
}

export function hubBoxes(items: CatalogueItem[]): HubBox[] {
    const hubs = CATALOGUE_HUBS.map((key) => {
        const place = placeFor(key);
        return { key, place, cells: hubLayout(place).cells };
    });
    const capacity = hubs.reduce((n, h) => n + h.cells.length, 0);
    const boxes: HubBox[] = [];
    let next = 0;
    hubs.forEach((hub, h) => {
        // The last hub takes what is left, so rounding never drops an item.
        const share = h === hubs.length - 1 ? items.length - next : Math.round((items.length * hub.cells.length) / capacity);
        const count = Math.min(share, hub.cells.length);
        const stride = hub.cells.length / Math.max(1, count);
        for (let i = 0; i < count; i++) {
            const cell = hub.cells[Math.floor(i * stride)];
            const item = items[next++];
            boxes.push({ item, hub: hub.key, cell: cell.name, at: [hub.place.position[0] + cell.x, hub.place.position[1] + cell.z], side: boxSide(item.cbm) });
        }
    });
    return boxes;
}

/** The boxes Play's worker cannot walk through (siteBlockers.ts); set when the catalogue arrives. */
export let catalogueBoxes: HubBox[] = [];
export function setCatalogueBoxes(boxes: HubBox[]): void {
    catalogueBoxes = boxes;
}
