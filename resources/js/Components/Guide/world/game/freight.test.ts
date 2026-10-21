import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { carried, complete, freightBoxesToDraw, inCar, leftAt, linesToRecord, loadIntoCar, putBackAll, refreshLoad, startLoading, take, takeOutOfCar, takeWhatFits, unitSize, type FreightLoad, type FreightLine } from "./freight.ts";
import { GUESSED_UNIT_CBM } from "./practice.ts";

// Run with: npm run test:js

const line = (variantId: number, quantity: number, picked: number, unitCbm: number): FreightLine => ({
    variantId, name: `Item ${variantId}`, unit: "Carton", quantity, picked, unitCbm, guessed: false, area: null,
});
const load = (lines: FreightLine[], maxCbm: number | null = 10): FreightLoad => ({
    shipmentId: 1, reference: "SHP-1", status: "scheduled", canPick: true, origin: "main_hub_a", destination: "remote_hub", scheduledFor: null,
    vehicle: { name: "Isuzu", plate: "AA-1", maxCbm, payloadKg: null }, lines,
});

describe("freight: loading the car", () => {
    it("sizes a unit from the manifest line, else the packaging, else a guess", () => {
        assert.deepEqual(unitSize(30, 1.5, 0.08), { unitCbm: 0.05, guessed: false });
        assert.deepEqual(unitSize(30, null, 0.08), { unitCbm: 0.08, guessed: false });
        assert.deepEqual(unitSize(30, null, null), { unitCbm: GUESSED_UNIT_CBM, guessed: true });
    });

    it("takes only what the manifest still needs", () => {
        const state = startLoading(load([line(1, 10, 6, 0.05)]));
        assert.equal(leftAt(state, 1), 4);
        const result = take(state, 1, 99, 10, true);
        assert.ok(result.ok);
        assert.equal(result.units, 4);
        assert.equal(leftAt(result.state, 1), 0);
        const more = take(result.state, 1, 1, 10, false);
        assert.equal(more.ok, false);
        assert.match((more as { reason: string }).reason, /Nothing more/);
    });

    it("refuses an item that is not on the manifest", () => {
        const result = take(startLoading(load([line(1, 10, 0, 0.05)])), 99, 1, 10, true);
        assert.equal(result.ok, false);
        assert.match((result as { reason: string }).reason, /not on this shipment/);
    });

    it("takes as many as the arms have room for, and always one into empty arms", () => {
        const state = startLoading(load([line(1, 20, 0, 0.05), line(2, 2, 0, 0.9)]));
        const some = take(state, 1, 20, 0.6, true);
        assert.ok(some.ok);
        assert.equal(some.units, 12);
        const big = take(state, 2, 2, 0.6, true);
        assert.ok(big.ok);
        assert.equal(big.units, 1);
        const full = take(some.state, 2, 1, 0, false);
        assert.equal(full.ok, false);
        assert.match((full as { reason: string }).reason, /arms are full/);
    });

    it("takes what fits across lines, in manifest order", () => {
        const { state, units } = takeWhatFits(startLoading(load([line(1, 4, 0, 0.1), line(2, 10, 0, 0.05)])), 0.6, true);
        // 4 × 0.1 = 0.4, then 4 × 0.05 = 0.2.
        assert.equal(units, 8);
        assert.deepEqual(state.carrying, { 1: 4, 2: 4 });
        assert.ok(Math.abs(carried(state).cbm - 0.6) < 1e-9);
    });

    it("loads what the hold took into the car, keeps the rest in the arms", () => {
        const taken = takeWhatFits(startLoading(load([line(1, 10, 2, 0.05)])), 0.6, true).state;
        const after = loadIntoCar(taken, { 1: 5 });
        assert.deepEqual(after.carrying, { 1: 3 });
        assert.deepEqual(after.loaded, { 1: 5 });
        const car = inCar(after);
        assert.equal(car.units, 7);
        assert.equal(car.of, 10);
        assert.ok(Math.abs(car.cbm - 0.35) < 1e-9);
        assert.equal(car.capacity, 10);
        assert.deepEqual(putBackAll(after).carrying, {});
    });

    it("knows when the whole manifest is in the car", () => {
        const state = startLoading(load([line(1, 2, 1, 0.05), line(2, 1, 1, 0.05)]));
        assert.equal(complete(state), false);
        const taken = take(state, 1, 1, 1, true);
        assert.ok(taken.ok);
        assert.equal(complete(loadIntoCar(taken.state, { 1: 1 })), true);
    });

    it("takes the server's picked figures on a refresh, keeping the session's moves only as far as still needed", () => {
        const taken = take(startLoading(load([line(1, 10, 0, 0.05)])), 1, 6, 10, true);
        assert.ok(taken.ok);
        const loaded = loadIntoCar(taken.state, { 1: 4 });
        // Meanwhile someone picked 7 for real: only 3 are still needed.
        const fresh = refreshLoad(loaded, load([line(1, 10, 7, 0.05)]));
        assert.deepEqual(fresh.loaded, { 1: 3 });
        assert.deepEqual(fresh.carrying, {});
    });

    it("names the lines a load just completed, and not those already recorded or still short", () => {
        const state = startLoading(load([line(1, 3, 0, 0.05), line(2, 2, 2, 0.05), line(3, 4, 0, 0.05)]));
        const taken = takeWhatFits(state, 10, true).state;
        // All of line 1 and two of line 3 go in; line 2 was picked before.
        const after = loadIntoCar(taken, { 1: 3, 3: 2 });
        assert.deepEqual(linesToRecord(after).map((l) => l.variantId), [1]);
    });

    it("takes refused units back out of the car into the arms", () => {
        const taken = takeWhatFits(startLoading(load([line(1, 3, 0, 0.05)])), 10, true).state;
        const after = loadIntoCar(taken, { 1: 3 });
        const back = takeOutOfCar(after, { 1: 3 });
        assert.deepEqual(back.loaded, {});
        assert.deepEqual(back.carrying, { 1: 3 });
        assert.equal(inCar(back).units, 0);
    });

    it("uses a default car size when the vehicle has none", () => {
        assert.equal(inCar(startLoading(load([line(1, 1, 0, 0.05)], null))).capacity, 20);
    });

    it("draws a box per carried unit, at most the given number", () => {
        const taken = takeWhatFits(startLoading(load([line(1, 20, 0, 0.01)])), 0.6, true).state;
        assert.equal(freightBoxesToDraw(taken, 8).length, 8);
        assert.ok(freightBoxesToDraw(taken, 8).every((b) => b.key === 1 && b.side >= 0.16));
    });
});
