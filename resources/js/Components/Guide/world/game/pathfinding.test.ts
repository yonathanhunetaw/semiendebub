import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedAt, type Blockers } from "./collision.ts";
import { clearLine, findPath, makeGrid, nearestOpen, type Grid, type Point } from "./pathfinding.ts";

// Run with: npm run test:js

const R = 0.22;
const gridFor = (blockers: Blockers, size = 20, cell = 0.25): Grid => makeGrid(-size / 2, -size / 2, size / 2, size / 2, cell, (x, z) => !blockedAt(x, z, R, blockers));

/** Every leg of the path, from `from`, stays on open ground. */
function walkable(g: Grid, from: Point, path: Point[]): boolean {
    let at = from;
    for (const next of path) {
        if (!clearLine(g, at, next)) return false;
        at = next;
    }
    return true;
}

describe("pathfinding", () => {
    it("walks straight across open ground in one leg", () => {
        const g = gridFor({ boxes: [], walls: [] });
        const path = findPath(g, [-5, -5], [5, 4]);
        assert.deepEqual(path, [[5, 4]]);
    });

    it("goes round a wall through its gap", () => {
        // A wall across z = 0 from x = -10 to x = 6, open only at its east end.
        const blockers: Blockers = { boxes: [], walls: [{ ax: -10, az: 0, bx: 6, bz: 0, half: 0.1 }] };
        const g = gridFor(blockers);
        const from: Point = [-6, -4];
        const path = findPath(g, from, [-6, 4]);
        assert.ok(path, "no path found");
        assert.ok(path.length >= 2, "went straight through the wall");
        assert.ok(walkable(g, from, path), "a leg crosses blocked ground");
        // It had to pass east of the wall's end.
        assert.ok(path.some(([x]) => x > 6), `never passed the gap: ${JSON.stringify(path)}`);
        assert.deepEqual(path[path.length - 1], [-6, 4]);
    });

    it("ends next to a target that is inside something", () => {
        const blockers: Blockers = { boxes: [{ minX: 2, minZ: 2, maxX: 4, maxZ: 4 }], walls: [] };
        const g = gridFor(blockers);
        const path = findPath(g, [-5, -5], [3, 3]);
        assert.ok(path);
        const [x, z] = path[path.length - 1];
        assert.equal(blockedAt(x, z, R, blockers), false);
        assert.ok(Math.hypot(x - 3, z - 3) < 1.6, `ended far away at ${x}, ${z}`);
    });

    it("says there is no way into a closed room", () => {
        const room = (x0: number, z0: number, x1: number, z1: number) => [
            { ax: x0, az: z0, bx: x1, bz: z0, half: 0.1 }, { ax: x1, az: z0, bx: x1, bz: z1, half: 0.1 },
            { ax: x1, az: z1, bx: x0, bz: z1, half: 0.1 }, { ax: x0, az: z1, bx: x0, bz: z0, half: 0.1 },
        ];
        const g = gridFor({ boxes: [], walls: room(1, 1, 5, 5) });
        assert.equal(findPath(g, [-5, -5], [3, 3]), null);
    });

    it("finds the nearest open cell, or none", () => {
        const g = gridFor({ boxes: [{ minX: -1, minZ: -1, maxX: 1, maxZ: 1 }], walls: [] });
        const index = nearestOpen(g, 0, 0);
        assert.ok(index >= 0);
        assert.equal(g.open[index], 1);
        const shut: Grid = { ...g, open: new Uint8Array(g.open.length) };
        assert.equal(nearestOpen(shut, 0, 0), -1);
    });

    it("plans across the whole site quickly", () => {
        // The site's size at 0.25 m cells, with a long wall to go round.
        // From the west end of the site to the far side of a wall that only ends near its east end.
        const blockers: Blockers = { boxes: [], walls: [{ ax: -96, az: 0, bx: 60, bz: 0, half: 0.1 }] };
        const started = performance.now();
        const g = makeGrid(-95, -16, 69, 26, 0.25, (x, z) => !blockedAt(x, z, R, blockers));
        const path = findPath(g, [-90, -10], [-90, 10]);
        const ms = performance.now() - started;
        assert.ok(path && walkable(g, [-90, -10], path));
        assert.ok(ms < 1500, `took ${Math.round(ms)} ms`);
    });
});
