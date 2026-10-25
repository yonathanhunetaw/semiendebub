import { STORE } from "../places";
import { INTO_SHOP, slotFrame, runPoint, SHELF_ROW } from "../storeLayout";
import { catalogueBoxes } from "../catalogue";
import { shelfPlacement } from "../shelfSpots";

/**
 * Where the Store Floor → Shelf job's two zones stand: the pick-up in front of the item's own stack on the floor, the
 * put-up in front of the item's own slot on the racks. Pure geometry over what the world drew (the floor's stacks and the
 * shelf's placed bins); null when the item is on neither (the zones then stay where zones.ts put them).
 */
export interface Site {
    /** The patch to stand on, [minX, minZ, maxX, maxZ]. */
    rect: [number, number, number, number];
    /** Where boxes fly from (pick up) or to (put up), [x, y, z]. */
    point: [number, number, number];
}

const PATCH = 1.5;
const DEPTH = 1.3;

/** A patch `reach` m from (x, z) towards (dx, dz), PATCH wide across and DEPTH deep along it. */
function patchAt(x: number, z: number, dx: number, dz: number, reach: number): [number, number, number, number] {
    const cx = x + dx * (reach + DEPTH / 2);
    const cz = z + dz * (reach + DEPTH / 2);
    const hx = dx !== 0 ? DEPTH / 2 : PATCH / 2;
    const hz = dz !== 0 ? DEPTH / 2 : PATCH / 2;
    return [cx - hx, cz - hz, cx + hx, cz + hz];
}

/** The way into the shop from the wall nearest a point on the floor. */
function awayFromWall(x: number, z: number): [number, number] {
    const [cx, cz] = STORE.position;
    const [w, d] = STORE.size;
    const gaps: Array<[number, [number, number]]> = [[x - (cx - w / 2), [1, 0]], [cx + w / 2 - x, [-1, 0]], [z - (cz - d / 2), [0, 1]], [cz + d / 2 - z, [0, -1]]];
    return gaps.sort((p, q) => p[0] - q[0])[0][1];
}

/** In front of the floor stack of the first of these items that has one. */
export function floorSite(itemIds: number[]): Site | null {
    for (const id of itemIds) {
        const box = catalogueBoxes.find((b) => b.hub === "store_floor" && b.item.item_id === id);
        if (!box) continue;
        const [dx, dz] = awayFromWall(box.at[0], box.at[1]);
        return { rect: patchAt(box.at[0], box.at[1], dx, dz, box.side / 2 + 0.05), point: [box.at[0], 1, box.at[1]] };
    }
    return null;
}

/** In front of the slot of the first of these items that has one on the racks. */
export function shelfSite(itemIds: number[]): Site | null {
    for (const id of itemIds) {
        for (const [code, bins] of shelfPlacement) {
            const slot = bins.findIndex((b) => b?.item_id === id);
            const frame = slot < 0 ? null : slotFrame(code, slot);
            if (!frame) continue;
            const [rx, rz] = runPoint(frame.run, frame.from + frame.width / 2, STORE.shelfDepth / 2);
            const [dx, dz] = INTO_SHOP[frame.run.wall];
            const x = STORE.position[0] + rx;
            const z = STORE.position[1] + rz;
            // Stood clear of the floor stacks that lean on the racks (they reach 1.4 m out).
            return { rect: patchAt(x, z, dx, dz, 1.5), point: [x, frame.floorY + SHELF_ROW / 2, z] };
        }
    }
    return null;
}
