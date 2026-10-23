import { COMPOUND, HOUSES, HOUSE_SIZE, NEIGHBOUR, PALLET, PLACES, RACK_SPAN, STORE, doorPosition, palletCentres, type Place } from "../places";
import { RACKS } from "../storeLayout";
import { blockedAt, boxAt, type Blockers, type Box, type Wall } from "./collision";
import { makeGrid, type Grid } from "./pathfinding";
import { DESKS } from "./zones";

/**
 * Everything on the site the worker cannot walk through, from the same
 * numbers the scene is drawn from (places.ts, storeLayout.ts), so what
 * blocks is what you see:
 *
 *   hub walls, with their door gaps      the compound fence, with the gate gap
 *   the store's walls, with the door     the counter, the divider, the pallets
 *   the standing racks (left, back)      the neighbour, the admin tower, the houses
 *
 * Racks hanging from the ceiling (right wall, over the door) are above head
 * height, and the platform is a low step: neither blocks.
 */

const HUB_WALL = 0.25;
const STORE_WALL = 0.2;
const FENCE = 0.15;

function hubWalls(place: Place): Wall[] {
    const [cx, cz] = place.position;
    const [w, d] = place.size;
    const sides: Record<string, [number, number, number, number]> = {
        north: [cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2],
        south: [cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2],
        west: [cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2],
        east: [cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2],
    };
    const half = HUB_WALL / 2;
    const walls: Wall[] = [];
    for (const [name, [ax, az, bx, bz]] of Object.entries(sides)) {
        const door = place.door;
        if (!door || door.wall !== name) {
            walls.push({ ax, az, bx, bz, half });
            continue;
        }
        // The door is measured from the wall's west or north end, as places.ts says.
        const length = Math.hypot(bx - ax, bz - az);
        const a = (door.at - door.width / 2) / length;
        const b = (door.at + door.width / 2) / length;
        walls.push({ ax, az, bx: ax + (bx - ax) * a, bz: az + (bz - az) * a, half });
        walls.push({ ax: ax + (bx - ax) * b, az: az + (bz - az) * b, bx, bz, half });
    }
    return walls;
}

function storeBlockers(): Blockers {
    const [cx, cz] = STORE.position;
    const [w, d] = STORE.size;
    const t = STORE_WALL;
    const half = t / 2;
    const doorX = cx - w / 2 + STORE.door.at;
    const doorHalf = STORE.door.width / 2;
    const west = cx - w / 2;
    const east = cx + w / 2;
    const north = cz - d / 2;
    const south = cz + d / 2;

    const walls: Wall[] = [
        { ax: west - t, az: north - half, bx: east + t, bz: north - half, half },
        { ax: west - half, az: north - t, bx: west - half, bz: south + t, half },
        { ax: east + half, az: north - t, bx: east + half, bz: south + t, half },
        // The front wall, either side of the door.
        { ax: west - t, az: south + half, bx: doorX - doorHalf, bz: south + half, half },
        { ax: doorX + doorHalf, az: south + half, bx: east + t, bz: south + half, half },
    ];

    const boxes: Box[] = [
        // The metal divider at the door's west jamb, 1.2 m into the shop.
        { minX: doorX - doorHalf - 0.06, minZ: south - 1.2, maxX: doorX - doorHalf, maxZ: south },
        ...palletCentres().map(([x, z]) => boxAt(cx + x, cz + z, PALLET, PALLET)),
    ];
    const counter = PLACES.find((p) => p.key === "store_counter");
    if (counter) boxes.push(boxAt(counter.position[0], counter.position[1], counter.size[0], counter.size[1]));

    // Standing racks fill 50 cm along their wall; hanging ones are overhead.
    for (const run of RACKS) {
        if (run.suspended) continue;
        const dep = STORE.shelfDepth;
        switch (run.wall) {
            // Each run is the real shop's wall length (RACK_SPAN), centred on its wall.
            case "west": boxes.push({ minX: west, minZ: cz - RACK_SPAN / 2, maxX: west + dep, maxZ: cz + RACK_SPAN / 2 }); break;
            case "east": boxes.push({ minX: east - dep, minZ: cz - RACK_SPAN / 2, maxX: east, maxZ: cz + RACK_SPAN / 2 }); break;
            case "north": boxes.push({ minX: cx - RACK_SPAN / 2, minZ: north, maxX: cx + RACK_SPAN / 2, maxZ: north + dep }); break;
            case "south": boxes.push({ minX: cx - RACK_SPAN / 2, minZ: south - dep, maxX: cx + RACK_SPAN / 2, maxZ: south }); break;
        }
    }
    return { boxes, walls };
}

function fence(): Wall[] {
    const [gx, gz] = COMPOUND.gate.at;
    const gateHalf = COMPOUND.gate.width / 2;
    const corners = COMPOUND.corners;
    const walls: Wall[] = [];
    for (let i = 0; i < corners.length; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % corners.length];
        if (ax === gx && bx === gx) {
            const [lo, hi] = [Math.min(az, bz), Math.max(az, bz)];
            walls.push({ ax: gx, az: lo, bx: gx, bz: gz - gateHalf, half: FENCE / 2 });
            walls.push({ ax: gx, az: gz + gateHalf, bx: gx, bz: hi, half: FENCE / 2 });
        } else {
            walls.push({ ax, az, bx, bz, half: FENCE / 2 });
        }
    }
    return walls;
}

export function siteBlockers(): Blockers {
    const store = storeBlockers();
    const boxes: Box[] = [...store.boxes, boxAt(NEIGHBOUR.position[0], NEIGHBOUR.position[1], NEIGHBOUR.size[0], NEIGHBOUR.size[1])];
    // Each desk's table, at the back of its patch (zones.ts draws it there).
    for (const { rect: [x0, z0, x1] } of DESKS.filter((d) => d.table)) boxes.push(boxAt((x0 + x1) / 2, z0 + 0.45, Math.min(2.3, x1 - x0 - 0.3), 0.8));
    const walls: Wall[] = [...store.walls, ...fence()];

    for (const place of PLACES) {
        const [x, z] = place.position;
        const [w, d] = place.size;
        switch (place.shape) {
            case "hub": walls.push(...hubWalls(place)); break;
            case "tower": boxes.push(boxAt(x, z, w, d)); break;
            case "houses": HOUSES.forEach(([hx, hz]) => boxes.push(boxAt(x + hx, z + hz, HOUSE_SIZE, HOUSE_SIZE))); break;
            default: break;
        }
    }
    return { boxes, walls };
}

/** The worker's size for bumping into things: shoulders about 45 cm wide, so they fit the 50 cm gap past the counter. */
export const WORKER_RADIUS = 0.22;
/** Path cells: small enough to find the narrow ways in the shop (past a pallet to the divider is 64 cm). */
const PATH_CELL = 0.2;

let cached: { key: string; blockers: Blockers; grid: Grid } | null = null;

/**
 * The site's blockers and its walkable grid, plus `extra` boxes (the freight
 * car, whose length depends on the vehicle). Building them takes a few tens of
 * ms, so they are kept until the extras change.
 */
export function siteMap(bounds: [number, number, number, number], extra: Box[] = []): { blockers: Blockers; grid: Grid } {
    const key = JSON.stringify(extra);
    if (cached?.key === key) return cached;
    const site = siteBlockers();
    const blockers: Blockers = { boxes: [...site.boxes, ...extra], walls: site.walls };
    // A cell is open when the worker fits there with a little room to spare.
    const grid = makeGrid(bounds[0], bounds[1], bounds[2], bounds[3], PATH_CELL, (x, z) => !blockedAt(x, z, WORKER_RADIUS + 0.01, blockers));
    cached = { key, blockers, grid };
    return cached;
}

/** Where doors and the gate are, so they can swing open as the worker comes near: [x, z] of each opening's middle. */
export function openings(): Array<{ key: string; at: [number, number] }> {
    const list: Array<{ key: string; at: [number, number] }> = [{ key: "gate", at: COMPOUND.gate.at }];
    for (const place of PLACES) {
        const door = place.shape === "hub" ? doorPosition(place) : null;
        if (door) list.push({ key: place.key, at: door.at });
    }
    return list;
}
