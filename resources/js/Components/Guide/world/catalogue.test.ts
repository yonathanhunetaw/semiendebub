import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hubLayout, placeFor } from "./places.ts";
import { STACK_MAX, hubBoxes, packLines, shown, stackSlot, type CatalogueItem } from "./catalogue.ts";

const item = (n: number, boxes: CatalogueItem["boxes"]): CatalogueItem => ({ item_id: n, name: `Item ${n}`, variant_id: n, packaging: "Carton", tier: "cartoon", pieces: 12, cbm: 0.1, boxes });

describe("catalogue", () => {
    it("stands an item only where it has stock, a full stack to a cell, so a big stock fills more floor", () => {
        const boxes = hubBoxes([item(1, { main_hub_a: 5 }), item(2, { main_hub_b: 30, store_floor: 1 }), item(3, {})]);
        assert.deepEqual(boxes.map((b) => [b.item.item_id, b.hub, b.count]), [[1, "main_hub_a", 5], [2, "main_hub_b", 12], [2, "main_hub_b", 12], [2, "main_hub_b", 6], [2, "store_floor", 1]]);
        // The counts on the floor add up to the stock.
        assert.equal(boxes.filter((b) => b.hub === "main_hub_b").reduce((n, b) => n + b.count, 0), 30);
    });

    it("stands the Remote Hub's stock too, and gives every stack its own cell", () => {
        const boxes = hubBoxes(Array.from({ length: 60 }, (_, i) => item(i + 1, { remote_hub: 1, main_hub_a: 1, store_floor: 1 })));
        assert.ok(boxes.some((b) => b.hub === "remote_hub"));
        assert.equal(new Set(boxes.map((b) => `${b.hub}:${b.cell}`)).size, boxes.length);
    });

    it("writes what a carton holds, biggest first, in plain lines", () => {
        assert.deepEqual(packLines([{ name: "Carton", pieces: 1000 }, { name: "Packet", pieces: 50 }, { name: "Piece", pieces: 1 }]), ["1 Carton", "= 20 Packets", "= 1000 Pieces"]);
        assert.deepEqual(packLines([{ name: "Carton", pieces: 120 }]), ["1 Carton", "= 120 pieces"]);
        assert.deepEqual(packLines([{ name: "Piece", pieces: 1 }]), ["1 Piece"]);
        assert.deepEqual(packLines(undefined), []);
    });

    it("lays the shop's floor stock round the foot of the racks, west wall first, clear of the doorway", () => {
        const boxes = hubBoxes(Array.from({ length: 80 }, (_, i) => item(i + 1, { store_floor: 2 }))).filter((b) => b.hub === "store_floor");
        assert.ok(boxes.length > 30);
        assert.equal(new Set(boxes.map((b) => b.cell)).size, boxes.length);
        assert.ok(boxes[0].cell.startsWith("W"));
        // Next to the west wall, in front of its racks (0.5 m deep).
        assert.ok(boxes[0].at[0] > -16 + 0.5 && boxes[0].at[0] < -16 + 1.5);
        // Nothing in the doorway (the door is 7 m from the west wall, 2.2 m wide).
        assert.ok(boxes.every((b) => !(b.at[1] > -9 - 1.4 && Math.abs(b.at[0] - (-16 + 7)) < 1.1 + 0.4)));
    });

    it("fills the whole hub floor and names it from the door: A is the left-hand column, 1 the row nearest the door", () => {
        const hub = placeFor("main_hub_a");
        const { cells, aisles } = hubLayout(hub);
        assert.equal(cells.length, Math.floor(hub.size[0]) * Math.floor(hub.size[1]));
        assert.equal(aisles.length, 0);
        // The door is in the north wall: you look south, so your left is the east wall.
        assert.equal(hub.door?.wall, "north");
        assert.equal(cells[0].name, "A1");
        assert.ok(cells[0].x > 0 && cells[0].z < 0);
        assert.equal(cells.find((c) => c.name === "B1")!.x, cells[0].x - 1);
    });

    it("draws at most a full stack and every box the same size", () => {
        assert.equal(shown(5), 5);
        assert.equal(shown(500), STACK_MAX);
        const slots = Array.from({ length: STACK_MAX }, (_, i) => stackSlot(i));
        assert.equal(new Set(slots.map((s) => s.join(","))).size, STACK_MAX);
        assert.equal(Math.max(...slots.map((s) => s[1])), 0.2 + 2 * 0.4);
    });
});
