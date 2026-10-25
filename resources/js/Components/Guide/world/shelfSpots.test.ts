import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLOT_ORDER, SPOT_ORDER, barLines, placeBins, slotOfItem, type ShelfBin } from "./shelfSpots.ts";

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

    it("puts a bin on the slot it was given and fills the rest in order around it", () => {
        const bins = [bin(1), bin(2), { ...bin(3), spot: "a1b" }, { ...bin(4), spot: "f6c" }];
        const placed = placeBins(bins);
        // 3 holds a1b; 1 and 2 take the first free slots (a1a, a1c); 4 stands on f6c.
        assert.equal(placed.get("a1")![1].item_id, 3);
        assert.equal(placed.get("a1")![0].item_id, 1);
        assert.equal(placed.get("a1")![2].item_id, 2);
        assert.equal(placed.get("f6")![2].item_id, 4);
        assert.equal(placed.get("f6")![0], undefined, "slots before it stay empty");
        assert.equal(slotOfItem(placed, 4), "f6c");
        assert.equal(slotOfItem(placed, 1), "a1a");
        assert.equal(slotOfItem(placed, 99), null);
    });

    it("never puts two bins on one slot, and ignores a slot that is not on the racks", () => {
        const placed = placeBins([{ ...bin(1), spot: "a1a" }, { ...bin(2), spot: "a1a" }, { ...bin(3), spot: "z9z" }]);
        assert.equal(placed.get("a1")![0].item_id, 1);
        assert.equal(slotOfItem(placed, 2), "a1b", "the second takes the next free slot");
        assert.equal([...placed.values()].flat().length, 3);
    });

    it("lists 276 slots, four to each of the 69 spots", () => {
        assert.equal(SLOT_ORDER.length, SPOT_ORDER.length * 4);
        assert.equal(new Set(SLOT_ORDER).size, 276);
    });
});
