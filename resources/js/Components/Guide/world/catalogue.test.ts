import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STACK_MAX, hubBoxes, shown, stackSlot, type CatalogueItem } from "./catalogue.ts";

const item = (n: number, boxes: CatalogueItem["boxes"]): CatalogueItem => ({ item_id: n, name: `Item ${n}`, variant_id: n, packaging: "Carton", tier: "cartoon", pieces: 12, cbm: 0.1, boxes });

describe("catalogue", () => {
    it("stands an item only where it has stock, with the real number of boxes", () => {
        const boxes = hubBoxes([item(1, { main_hub_a: 5 }), item(2, { main_hub_b: 2, store_floor: 1 }), item(3, {})]);
        assert.deepEqual(boxes.map((b) => [b.item.item_id, b.hub, b.count]), [[1, "main_hub_a", 5], [2, "main_hub_b", 2], [2, "store_floor", 1]]);
    });

    it("gives every stack its own cell", () => {
        const boxes = hubBoxes(Array.from({ length: 60 }, (_, i) => item(i + 1, { main_hub_a: 1, store_floor: 1 })));
        assert.equal(new Set(boxes.map((b) => `${b.hub}:${b.cell}`)).size, boxes.length);
        assert.ok(boxes.some((b) => b.hub === "store_floor"));
    });

    it("draws at most a full stack and every box the same size", () => {
        assert.equal(shown(5), 5);
        assert.equal(shown(500), STACK_MAX);
        const slots = Array.from({ length: STACK_MAX }, (_, i) => stackSlot(i));
        assert.equal(new Set(slots.map((s) => s.join(","))).size, STACK_MAX);
        assert.equal(Math.max(...slots.map((s) => s[1])), 0.2 + 2 * 0.4);
    });
});
