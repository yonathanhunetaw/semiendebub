import { SHELF_TIERS, STORE } from "./places";

/**
 * Where a Store Shelf bin sits in the world, so a refill can be shown at its
 * own bin. Mirrors the layout DukaWorld's makeShelves draws (see SHELF_TIERS):
 * the west, north and east tiers are 5 across × 10 down above the floor
 * strip; the south tier is two rows of 25 over the door.
 */
export function binWorldPosition(index: number): { x: number; y: number; z: number } {
    const tier = Math.max(0, Math.min(3, Math.floor(index / 50)));
    const j = ((index % 50) + 50) % 50;
    const side = SHELF_TIERS[tier].wall;
    const south = side === "south";
    const [w, d] = STORE.size;
    const [cx, cz] = STORE.position;
    const dep = STORE.shelfDepth;
    const span = (side === "west" || side === "east" ? d : w) - 2 * dep;
    const cols = south ? 25 : 5;
    const rows = south ? 2 : 10;
    const faceHeight = south ? 0.6 : STORE.wall - STORE.plinth;
    const faceY = south ? STORE.wall - 0.3 : STORE.plinth + faceHeight / 2;

    const row = Math.floor(j / 5);
    const [col, physicalRow] = south ? [(row % 5) * 5 + (j % 5), row < 5 ? 0 : 1] : [j % 5, row];
    const u = (col + 0.5) / cols;
    const y = faceY + (0.5 - (physicalRow + 0.5) / rows) * faceHeight;
    // Just in front of the face, inside the room.
    const out = dep + 0.25;

    switch (side) {
        case "west": return { x: cx - w / 2 + out, y, z: cz + span / 2 - u * span };
        case "east": return { x: cx + w / 2 - out, y, z: cz - span / 2 + u * span };
        case "north": return { x: cx - span / 2 + u * span, y, z: cz - d / 2 + out };
        case "south": return { x: cx + span / 2 - u * span, y, z: cz + d / 2 - out };
    }
}
