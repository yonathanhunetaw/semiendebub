import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boxSide, hubBoxes, type CatalogueItem } from "./catalogue.ts";

const item = (n: number, cbm: number | null = 0.1): CatalogueItem => ({ item_id: n, name: `Item ${n}`, variant_id: n, packaging: "Carton", tier: "cartoon", pieces: 12, cbm });

describe("catalogue", () => {
    it("gives every item its own cell, in both hubs", () => {
        const boxes = hubBoxes(Array.from({ length: 189 }, (_, i) => item(i + 1)));
        assert.equal(boxes.length, 189);
        assert.equal(new Set(boxes.map((b) => `${b.hub}:${b.cell}`)).size, 189);
        assert.ok(boxes.some((b) => b.hub === "main_hub_a"));
        assert.ok(boxes.some((b) => b.hub === "main_hub_b"));
        assert.deepEqual(boxes.map((b) => b.item.item_id), Array.from({ length: 189 }, (_, i) => i + 1));
    });

    it("sizes a box by its packaging's volume, within its cell", () => {
        assert.equal(boxSide(0.125), 0.5);
        assert.equal(boxSide(1.44), 0.9);
        assert.equal(boxSide(0.0025), 0.3);
        assert.equal(boxSide(null), 0.5);
    });
});
