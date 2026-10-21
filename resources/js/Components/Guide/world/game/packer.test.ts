import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TRUCK_CBM, HOLD_HEIGHT, HOLD_WIDTH, MIN_SIDE, SUPPORT, boxesFor, holdFor, packAll, place, startPacking, type Packing, type PackBox, type Placed } from "./packer.ts";

// Run with: npm run test:js

const cube = (side: number, key = 1): PackBox => ({ key, units: 1, l: side, h: side, w: side });
const eps = 1e-6;

/** Two placed boxes share space (more than touching)? */
function overlap(a: Placed, b: Placed): boolean {
    return a.x < b.x + b.l - eps && b.x < a.x + a.l - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps && a.z < b.z + b.w - eps && b.z < a.z + a.w - eps;
}

/** The share of a box's footprint resting on the floor or on the tops of boxes exactly below it. */
function support(p: Packing, box: Placed): number {
    if (box.y < eps) return 1;
    const step = p.hold.cell / 2;
    let resting = 0;
    let all = 0;
    for (let x = box.x + step / 2; x < box.x + box.l; x += step) {
        for (let z = box.z + step / 2; z < box.z + box.w; z += step) {
            all++;
            if (p.placed.some((o) => o !== box && Math.abs(o.y + o.h - box.y) < eps && x > o.x && x < o.x + o.l && z > o.z && z < o.z + o.w)) resting++;
        }
    }
    return resting / all;
}

describe("packer: the freight car's hold", () => {
    it("makes a hold of the car's volume, a default when there is none", () => {
        const hold = holdFor(18);
        assert.ok(Math.abs(hold.length * HOLD_WIDTH * HOLD_HEIGHT - 18) < eps);
        assert.ok(Math.abs(holdFor(null).length * HOLD_WIDTH * HOLD_HEIGHT - DEFAULT_TRUCK_CBM) < eps);
    });

    it("puts the first box on the floor, at the front, on the left", () => {
        const p = startPacking(holdFor(10));
        assert.deepEqual(place(p, cube(0.5)), { ...cube(0.5), x: 0, y: 0, z: 0 });
        // A size between patches is rounded up to whole 10 cm patches, and drawn at that size.
        const odd = place(p, cube(0.35))!;
        assert.deepEqual([odd.l, odd.h, odd.w], [0.4, 0.4, 0.4]);
    });

    it("builds a wall at the front, floor to roof, before moving back", () => {
        const p = startPacking({ length: 3, width: 1, height: 1, cell: 0.1 });
        const spots = Array.from({ length: 6 }, () => place(p, cube(0.5))!);
        // Four 0.5 m cubes fill the first 0.5 m (two across, two up), then the next go behind them.
        assert.deepEqual(spots.slice(0, 4).map((s) => s.x), [0, 0, 0, 0]);
        assert.deepEqual(spots.slice(0, 4).map((s) => [s.y, s.z]).sort(), [[0, 0], [0, 0.5], [0.5, 0], [0.5, 0.5]]);
        assert.deepEqual(spots.slice(4).map((s) => s.x), [0.5, 0.5]);
    });

    it("never puts a box where less than 70% of it rests on something", () => {
        const p = startPacking({ length: 1, width: 1, height: 2, cell: 0.1 });
        // A small box on the floor at the front-left, then a big one: it may not perch on the small one.
        place(p, cube(0.3));
        const big = place(p, { key: 2, units: 1, l: 0.6, h: 0.6, w: 0.6 })!;
        assert.ok(big.y === 0 || support(p, big) >= SUPPORT, `the big box floats at y = ${big.y}`);
    });

    it("turns a long box to fit across a short hold", () => {
        const p = startPacking({ length: 1, width: 2, height: 1, cell: 0.1 });
        const long = place(p, { key: 1, units: 1, l: 1.8, h: 0.4, w: 0.5 });
        assert.ok(long, "did not fit, though turned it would");
        assert.equal(long!.l, 0.5);
        assert.equal(long!.w, 1.8);
    });

    it("says no when a box fits nowhere", () => {
        const p = startPacking({ length: 1, width: 1, height: 1, cell: 0.1 });
        assert.ok(place(p, cube(1)));
        assert.equal(place(p, cube(0.2)), null);
        assert.equal(place(startPacking({ length: 1, width: 1, height: 1, cell: 0.1 }), cube(1.2)), null);
    });

    it("packs a mixed load with no two boxes in the same space and nothing floating", () => {
        const p = startPacking(holdFor(6));
        // A fixed mix of sizes (no randomness: the test must say the same every run).
        const sizes = [0.6, 0.45, 0.3, 0.25, 0.5, 0.35, 0.2, 0.4];
        const boxes = Array.from({ length: 120 }, (_, i) => ({ key: i % 5, units: 1, l: sizes[i % 8], h: sizes[(i + 3) % 8], w: sizes[(i + 5) % 8] }));
        const left = packAll(p, boxes);
        assert.ok(p.placed.length > 60, `only ${p.placed.length} placed`);
        assert.equal(p.placed.length + left.length, boxes.length);
        for (let i = 0; i < p.placed.length; i++) {
            const a = p.placed[i];
            assert.ok(a.x >= -eps && a.y >= -eps && a.z >= -eps, "outside the hold");
            assert.ok(a.x + a.l <= p.hold.length + 0.1 && a.y + a.h <= p.hold.height + 0.1 && a.z + a.w <= p.hold.width + 0.1, "through a wall");
            for (let j = i + 1; j < p.placed.length; j++) assert.equal(overlap(a, p.placed[j]), false, `boxes ${i} and ${j} share space`);
            assert.ok(support(p, a) >= SUPPORT - 0.05, `box ${i} floats (${support(p, a).toFixed(2)} supported)`);
        }
    });

    it("packs a full car quickly", () => {
        const p = startPacking(holdFor(34));
        const started = performance.now();
        packAll(p, Array.from({ length: 400 }, (_, i) => cube(0.3 + (i % 3) * 0.1)));
        assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
    });

    it("makes one box per carton, and groups small pieces", () => {
        const cartons = boxesFor(7, 5, 0.05);
        assert.equal(cartons.length, 5);
        assert.ok(cartons.every((b) => b.units === 1 && b.key === 7));
        const pieces = boxesFor(7, 100, 0.001);
        assert.equal(pieces.reduce((n, b) => n + b.units, 0), 100);
        assert.equal(pieces.length, 4);
        assert.ok(pieces.every((b) => b.l >= MIN_SIDE));
        assert.deepEqual(boxesFor(7, 0, 0.05), []);
    });
});
