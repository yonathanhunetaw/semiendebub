import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedAt, boxAt, move, pushOut, type Blockers } from "./collision.ts";

// Run with: npm run test:js

const R = 0.22;
const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps;

describe("collision", () => {
    const box: Blockers = { boxes: [boxAt(0, 0, 2, 2)], walls: [] };
    const wall: Blockers = { boxes: [], walls: [{ ax: 0, az: -5, bx: 0, bz: 5, half: 0.1 }] };

    it("sees a circle touching a box, and one clear of it", () => {
        assert.equal(blockedAt(1.1, 0, R, box), true);
        assert.equal(blockedAt(1.3, 0, R, box), false);
        // Past the corner on the diagonal: 0.2 m away in x and z is 0.28 m, more than the radius.
        assert.equal(blockedAt(1.2, 1.2, R, box), false);
    });

    it("pushes a circle out of a box to just touching its side", () => {
        const [x, z] = pushOut(1.1, 0.3, R, box);
        assert.ok(near(x, 1 + R), `x was ${x}`);
        assert.ok(near(z, 0.3));
    });

    it("pushes a centre inside a box out through the nearest side", () => {
        const [x, z] = pushOut(0.1, 0.9, R, box);
        assert.ok(near(z, 1 + R), `z was ${z}`);
        assert.ok(near(x, 0.1));
        assert.equal(blockedAt(x, z, R, box), false);
    });

    it("slides along a wall instead of stopping dead", () => {
        // Walking diagonally into a wall on x = 0: x stops at the wall, z keeps going.
        const [x, z] = move(-1, 0, 2, 2, R, wall);
        assert.ok(near(x, -(R + 0.1)), `x was ${x}`);
        assert.ok(near(z, 2), `z was ${z}`);
    });

    it("cannot step through a thin wall in one long stride", () => {
        const [x] = move(-0.5, 0, 3, 0, R, wall);
        assert.ok(x < 0, `ended on the far side at x = ${x}`);
    });

    it("walks through a gap wide enough, and not one too narrow", () => {
        // Two walls along z = 0 with a gap between x = -g and x = g.
        const gap = (g: number): Blockers => ({ boxes: [], walls: [
            { ax: -10, az: 0, bx: -g, bz: 0, half: 0.1 },
            { ax: g, az: 0, bx: 10, bz: 0, half: 0.1 },
        ] });
        // 0.5 m clear between wall faces fits a 0.44 m circle.
        const [, zWide] = move(0, -1, 0, 2, R, gap(0.35));
        assert.ok(zWide > 0.9, `stopped at z = ${zWide}`);
        // 0.3 m clear does not.
        const [, zNarrow] = move(0, -1, 0, 2, R, gap(0.25));
        assert.ok(zNarrow < 0, `got through to z = ${zNarrow}`);
    });

    it("settles in a corner where a box and a wall meet", () => {
        const corner: Blockers = { boxes: [boxAt(1, 0, 2, 2)], walls: [{ ax: -5, az: -1, bx: 5, bz: -1, half: 0.1 }] };
        const [x, z] = pushOut(-0.1, -1, R, corner);
        assert.equal(blockedAt(x, z, R - 1e-3, corner), false);
    });
});
