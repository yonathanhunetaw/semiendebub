import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RACKS, RACK_TOP, SHELF_BOX, SHELF_ROW, rackBottom, slotBox, slotCapacity, slotFrame } from "./storeLayout.ts";

describe("store racks", () => {
    it("levels the tops of all four runs, pushing the shorter ones up", () => {
        for (const run of RACKS) assert.ok(Math.abs(rackBottom(run) + run.rows * SHELF_ROW - RACK_TOP) < 1e-9, run.label);
        const east = RACKS.find((r) => r.wall === "east")!;
        const west = RACKS.find((r) => r.wall === "west")!;
        assert.ok(rackBottom(east) > rackBottom(west));
    });

    it("stands a slot's tiny cartons on its row's board, inside the slot, all one size", () => {
        for (const code of ["a1", "f6", "k3", "n2"]) {
            const frame = slotFrame(code, 1)!;
            const n = slotCapacity(frame.width);
            const seen = new Set<string>();
            for (let i = 0; i < n; i++) {
                const [x, y, z] = slotBox(code, 1, i)!;
                assert.ok(y >= frame.floorY && y <= frame.floorY + SHELF_ROW, `${code} #${i} height`);
                seen.add([x, y, z].map((v) => v.toFixed(3)).join());
            }
            assert.equal(seen.size, n, `${code}: every carton has its own place`);
        }
        assert.equal(SHELF_BOX, 0.2);
    });

    it("knows nothing of a spot that does not exist", () => {
        assert.equal(slotFrame("z9", 0), null);
        assert.equal(slotBox("z9", 0, 0), null);
    });
});
