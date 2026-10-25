import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPOT_ORDER, barLines, placeBins, type ShelfBin } from "./shelfSpots.ts";

const bin = (n: number, band: ShelfBin["band"] = { max: 10, refill: 4, critical: 2, unit: "Carton" }): ShelfBin => ({ item_id: n, name: `Item ${n}`, display: "", fill: 0.5, status: "ok", assigned: band !== null, band });

describe("shelf spots", () => {
    it("places four bins to a spot, in reading order", () => {
        const placed = placeBins(Array.from({ length: 9 }, (_, i) => bin(i + 1)));
        assert.deepEqual([...placed.keys()], SPOT_ORDER.slice(0, 3));
        assert.deepEqual(placed.get(SPOT_ORDER[0])!.map((b) => b.item_id), [1, 2, 3, 4]);
        assert.equal(placed.get(SPOT_ORDER[2])!.length, 1);
    });

    it("never places more than the racks hold", () => {
        const placed = placeBins(Array.from({ length: 400 }, (_, i) => bin(i + 1)));
        assert.equal([...placed.values()].flat().length, SPOT_ORDER.length * 4);
    });

    it("reads the refill and low lines off the band", () => {
        assert.deepEqual(barLines(bin(1)), { refill: 0.4, critical: 0.2 });
        assert.equal(barLines(bin(2, null)), null);
    });
});
