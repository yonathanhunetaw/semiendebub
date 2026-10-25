import { COMPOUND, VEHICLE, CONTAINER, CONTAINER_TRUCK, CUSTOMER_BAYS, PALLET, PLACES, STORE, doorPosition, fenceRuns, palletCentres, rackSpan, type Place } from "../places";
import { RACKS, rackBottom } from "../storeLayout";
import { blockedAt, boxAt, type Blockers, type Box, type Wall } from "./collision";
import { makeGrid, type Grid } from "./pathfinding";
import { catalogueBoxes } from "../catalogue";
import { worldMarkers } from "../worldModel";
import { DESKS, tableZ } from "./zones";

/**
 * Everything on the site the worker cannot walk through, from the same
 * numbers the scene is drawn from (places.ts, storeLayout.ts), so what
 * blocks is what you see:
 *
 *   hub walls, with their door gaps      the compound fence, with its way in
 *   the store's walls, with the door     the counter, the divider, the pallets
 *   the standing racks (left, back)
 *   the customers' parked cars           the suppliers' and the shops' buildings
 *   the container truck by the Storage hub
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

    // The racks hang wall to wall; under one too low to walk beneath (two rows of store floor), its 50 cm strip blocks.
    // The front wall's starts above the door, so nothing blocks there.
    for (const run of RACKS) {
        if (rackBottom(run) >= 2) continue;
        const dep = STORE.shelfDepth;
        const span = rackSpan(run.wall);
        switch (run.wall) {
            case "west": boxes.push({ minX: west, minZ: cz - span / 2, maxX: west + dep, maxZ: cz + span / 2 }); break;
            case "east": boxes.push({ minX: east - dep, minZ: cz - span / 2, maxX: east, maxZ: cz + span / 2 }); break;
            case "north": boxes.push({ minX: cx - span / 2, minZ: north, maxX: cx + span / 2, maxZ: north + dep }); break;
            case "south": boxes.push({ minX: cx - span / 2, minZ: south - dep, maxX: cx + span / 2, maxZ: south }); break;
        }
    }
    return { boxes, walls };
}

function fence(): Wall[] {
    const corners = COMPOUND.corners;
    return corners.flatMap(([ax, az], i) => {
        const [bx, bz] = corners[(i + 1) % corners.length];
        return fenceRuns(ax, az, bx, bz).map(([x1, z1, x2, z2]): Wall => ({ ax: x1, az: z1, bx: x2, bz: z2, half: FENCE / 2 }));
    });
}

export function siteBlockers(): Blockers {
    const store = storeBlockers();
    const boxes: Box[] = [
        ...store.boxes,
        // The truck with its container lies along the street, cab to the east.
        boxAt(CONTAINER_TRUCK[0] + 1, CONTAINER_TRUCK[1], CONTAINER[0] + 2.5, CONTAINER[1]),
    ];
    // Each desk's table, at the back of its patch (zones.ts draws it there).
    for (const desk of DESKS.filter((d) => d.table)) boxes.push(boxAt((desk.rect[0] + desk.rect[2]) / 2, tableZ(desk), Math.min(2.3, desk.rect[2] - desk.rect[0] - 0.3), 0.8));
    const walls: Wall[] = [...store.walls, ...fence()];

    for (const place of PLACES) {
        const [x, z] = place.position;
        const [w, d] = place.size;
        switch (place.shape) {
            case "hub": walls.push(...hubWalls(place)); break;
            case "tower": boxes.push(boxAt(x, z, w, d)); break;
            // The cars lie across their stops, along x.
            case "cars": CUSTOMER_BAYS.forEach(([bx, bz, kind]) => kind && boxes.push(boxAt(x + bx, z + bz, VEHICLE[kind][0], VEHICLE[kind][1]))); break;
            case "shops": place.blocks?.forEach(([sx, sz, sw, sd]) => boxes.push(boxAt(x + sx, z + sz, sw, sd))); break;
            default: break;
        }
    }
    // The hubs' boxes, one per item (catalogue.ts), once the catalogue has come.
    // The shop floor's stacks block; the hubs' floors are filled wall to wall with stock, so there the worker walks among the boxes.
    for (const { at, side, hub } of catalogueBoxes) if (hub === "store_floor") boxes.push(boxAt(at[0], at[1], side, side));
    // The designed world's own blockers (worldModel.ts), when it has any.
    for (const { rect } of worldMarkers?.blockers ?? []) if (rect) boxes.push({ minX: rect[0], minZ: rect[1], maxX: rect[2], maxZ: rect[3] });
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
    const key = JSON.stringify([extra, worldMarkers?.blockers.length ?? 0, catalogueBoxes.length]);
    if (cached?.key === key) return cached;
    const site = siteBlockers();
    const blockers: Blockers = { boxes: [...site.boxes, ...extra], walls: site.walls };
    // A cell is open when the worker fits there with a little room to spare.
    const grid = makeGrid(bounds[0], bounds[1], bounds[2], bounds[3], PATH_CELL, (x, z) => !blockedAt(x, z, WORKER_RADIUS + 0.01, blockers));
    cached = { key, blockers, grid };
    return cached;
}

/** Where the doors are, so they can swing open as the worker comes near: [x, z] of each door's middle. */
export function openings(): Array<{ key: string; at: [number, number] }> {
    const list: Array<{ key: string; at: [number, number] }> = [];
    for (const place of PLACES) {
        const door = place.shape === "hub" ? doorPosition(place) : null;
        if (door) list.push({ key: place.key, at: door.at });
    }
    return list;
}
