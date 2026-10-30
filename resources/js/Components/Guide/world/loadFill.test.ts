import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DRAWN_VAN_CBM, fillOf } from "./loadFill.ts";

describe("load fill", () => {
    it("draws the load as a share of the vehicle, green until it is nearly full", () => {
        assert.deepEqual(fillOf(3.7, 6), { fraction: 3.7 / 6, level: "ok", label: "62% · 3.7 / 6 m³" });
        assert.equal(fillOf(5, 6).level, "high");
        assert.equal(fillOf(6, 6).level, "high");
        assert.equal(fillOf(0, 6).fraction, 0);
    });

    it("draws an overload full and says by how much", () => {
        const over = fillOf(7.5, 6);
        assert.equal(over.fraction, 1);
        assert.equal(over.level, "over");
        assert.equal(over.label, "Over by 1.5 m³ · 7.5 / 6 m³");
    });

    it("rises against the drawn van while no vehicle is chosen, and says so", () => {
        const none = fillOf(6.75, null);
        assert.equal(none.level, "unknown");
        assert.equal(none.fraction, 6.75 / DRAWN_VAN_CBM);
        assert.equal(none.label, "6.8 m³ · no vehicle yet");
        assert.equal(fillOf(3, 0).level, "unknown");
    });

    it("says when some lines had no size, so the figure is short", () => {
        assert.equal(fillOf(33.5, 67, true).label, "50% · 34 / 67 m³ · some sizes missing");
    });
});
