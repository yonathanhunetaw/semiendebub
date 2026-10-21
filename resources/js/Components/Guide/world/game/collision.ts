/**
 * What the worker bumps into, as plain shapes on the ground (x east, z south,
 * metres), and how a walking circle slides along them. Pure maths: no
 * Three.js, no imports, so `node --test` runs it as it is.
 *
 * Two shapes cover the site: a box (a counter, a pallet, a building) and a
 * wall (a straight line with a thickness, at any angle, so the slanted
 * compound fence works too). A step that would end inside either is pushed
 * back out along the shortest way, which is what makes the worker slide
 * along a wall instead of stopping dead.
 */

export interface Box {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
}

export interface Wall {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    /** Half the wall's thickness. */
    half: number;
}

export interface Blockers {
    boxes: Box[];
    walls: Wall[];
}

/** A box from its centre and size. */
/** Pushed out to a hair past touching, so the result reads as clear, not as touching. */
const CLEAR = 1e-6;

export function boxAt(x: number, z: number, width: number, depth: number): Box {
    return { minX: x - width / 2, minZ: z - depth / 2, maxX: x + width / 2, maxZ: z + depth / 2 };
}

/** The point of a wall's centre line nearest (x, z). */
function nearestOnWall(w: Wall, x: number, z: number): [number, number] {
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const length2 = dx * dx + dz * dz;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / length2));
    return [w.ax + dx * t, w.az + dz * t];
}

/** Does a circle of radius r at (x, z) overlap anything? */
export function blockedAt(x: number, z: number, r: number, blockers: Blockers): boolean {
    for (const b of blockers.boxes) {
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    for (const w of blockers.walls) {
        const [px, pz] = nearestOnWall(w, x, z);
        if ((x - px) ** 2 + (z - pz) ** 2 < (r + w.half) ** 2) return true;
    }
    return false;
}

/** Push a circle out of everything it overlaps. A few passes settle corners where two shapes meet. */
export function pushOut(x: number, z: number, r: number, blockers: Blockers): [number, number] {
    for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (const b of blockers.boxes) {
            const cx = Math.max(b.minX, Math.min(x, b.maxX));
            const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
            const dx = x - cx;
            const dz = z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            moved = true;
            if (d2 > 1e-12) {
                const d = Math.sqrt(d2);
                x = cx + (dx / d) * (r + CLEAR);
                z = cz + (dz / d) * (r + CLEAR);
            } else {
                // The centre is inside the box: leave by the nearest side.
                const exits: Array<[number, number, number]> = [
                    [x - b.minX, b.minX - r - CLEAR, z],
                    [b.maxX - x, b.maxX + r + CLEAR, z],
                    [z - b.minZ, x, b.minZ - r - CLEAR],
                    [b.maxZ - z, x, b.maxZ + r + CLEAR],
                ];
                exits.sort((p, q) => p[0] - q[0]);
                [, x, z] = exits[0];
            }
        }
        for (const w of blockers.walls) {
            const [px, pz] = nearestOnWall(w, x, z);
            const dx = x - px;
            const dz = z - pz;
            const d2 = dx * dx + dz * dz;
            const reach = r + w.half + CLEAR;
            if (d2 >= reach * reach) continue;
            moved = true;
            if (d2 > 1e-12) {
                const d = Math.sqrt(d2);
                x = px + (dx / d) * reach;
                z = pz + (dz / d) * reach;
            } else {
                // Exactly on the centre line: step off to one side, square to the wall.
                const length = Math.hypot(w.bx - w.ax, w.bz - w.az) || 1;
                x = px - ((w.bz - w.az) / length) * reach;
                z = pz + ((w.bx - w.ax) / length) * reach;
            }
        }
        if (!moved) break;
    }
    return [x, z];
}

/**
 * Walk a circle from (x, z) by (dx, dz). Long steps are cut into pieces
 * shorter than the radius, so a fast step cannot pass straight through a thin wall.
 */
export function move(x: number, z: number, dx: number, dz: number, r: number, blockers: Blockers): [number, number] {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    for (let i = 0; i < steps; i++) {
        [x, z] = pushOut(x + dx / steps, z + dz / steps, r, blockers);
    }
    return [x, z];
}
