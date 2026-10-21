import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUESSED_UNIT_CBM, MAX_BOXES, MAX_CBM, boxesToDraw, cannotPickUp, fill, jobCbm, load, pickUp, putBack, refresh, shelveAll, shelveSome, startPractice, type ShelveJob } from "./practice.ts";

// Run with: npm run test:js

const job = (transferId: number, quantity: number, unitCbm: number | null, urgent = false): ShelveJob => ({
    transferId, reference: `TRF-${transferId}`, itemName: `Item ${transferId}`, quantity, unit: "Packet", unitCbm, urgent, display: `${quantity} Packets`,
});

describe("practice: store floor to shelf", () => {
    it("picks a job up off the floor and carries it", () => {
        const result = pickUp(startPractice([job(1, 6, 0.01)]), 1);
        assert.ok(result.ok);
        assert.equal(result.state.floor.length, 0);
        assert.deepEqual(result.state.carrying.map((j) => j.transferId), [1]);
        assert.ok(Math.abs(load(result.state).cbm - 0.06) < 1e-9);
    });

    it("refuses a job that does not fit what is already carried, and says why", () => {
        const start = startPractice([job(1, 10, 0.05), job(2, 4, 0.05)]);
        const first = pickUp(start, 1);
        assert.ok(first.ok);
        assert.equal(load(first.state).cbm, 0.5);
        const second = pickUp(first.state, 2);
        assert.equal(second.ok, false);
        assert.match((second as { reason: string }).reason, /does not fit/);
    });

    it("lets one job bigger than an armload be carried alone", () => {
        const big = job(1, 30, 0.05);
        assert.ok(jobCbm(big).cbm > MAX_CBM);
        assert.equal(cannotPickUp(startPractice([big]), 1), null);
    });

    it("refuses a job that is not on the floor, or already carried", () => {
        const start = startPractice([job(1, 2, 0.01)]);
        assert.match(cannotPickUp(start, 99) ?? "", /no longer on the floor/);
        const carried = pickUp(start, 1);
        assert.ok(carried.ok);
        assert.match(cannotPickUp(carried.state, 1) ?? "", /already carrying/);
    });

    it("guesses a size for an item with none, and says it is a guess", () => {
        const result = pickUp(startPractice([job(1, 5, null)]), 1);
        assert.ok(result.ok);
        const carried = load(result.state);
        assert.equal(carried.guessed, true);
        assert.ok(Math.abs(carried.cbm - 5 * GUESSED_UNIT_CBM) < 1e-9);
    });

    it("fills up urgent first, as many as fit", () => {
        const start = startPractice([job(1, 10, 0.04), job(2, 10, 0.04, true), job(3, 1, 0.01)]);
        const { state, taken } = fill(start);
        // The urgent one (0.4) first; the other 0.4 does not fit beside it; the small one does.
        assert.equal(taken, 2);
        assert.deepEqual(state.carrying.map((j) => j.transferId), [2, 3]);
        assert.deepEqual(state.floor.map((j) => j.transferId), [1]);
    });

    it("puts a job back where it was", () => {
        const carried = pickUp(startPractice([job(1, 2, 0.01)]), 1);
        assert.ok(carried.ok);
        const back = putBack(carried.state, 1);
        assert.ok(back.ok);
        assert.equal(back.state.carrying.length, 0);
        assert.deepEqual(back.state.floor.map((j) => j.transferId), [1]);
    });

    it("shelves everything carried, whole, and nothing when the arms are empty", () => {
        const start = startPractice([job(1, 2, 0.01), job(2, 3, 0.01)]);
        const { state } = fill(start);
        const done = shelveAll(state);
        assert.deepEqual(done.shelved.map((j) => j.transferId), [1, 2]);
        assert.equal(done.state.carrying.length, 0);
        assert.equal(done.state.shelved.length, 2);
        assert.deepEqual(shelveAll(done.state).shelved, []);
    });

    it("settles a put-up the server answered job by job: the refused ones stay carried", () => {
        const { state } = fill(startPractice([job(1, 2, 0.01), job(2, 2, 0.01), job(3, 2, 0.01)]));
        const settled = shelveSome(state, [1, 3]);
        assert.deepEqual(settled.shelved.map((j) => j.transferId), [1, 3]);
        assert.deepEqual(settled.carrying.map((j) => j.transferId), [2]);
        assert.deepEqual(shelveSome(state, []).carrying.length, 3);
    });

    it("merges a fresh list without bringing back what is carried or shelved", () => {
        const carried = pickUp(startPractice([job(1, 2, 0.01), job(2, 2, 0.01)]), 1);
        assert.ok(carried.ok);
        const shelved = shelveAll(carried.state).state;
        const fresh = refresh(shelved, [job(1, 2, 0.01), job(2, 2, 0.01), job(3, 1, 0.01)]);
        assert.deepEqual(fresh.floor.map((j) => j.transferId), [2, 3]);
        assert.deepEqual(fresh.shelved.map((j) => j.transferId), [1]);
    });

    it("draws one box per unit, at most eight", () => {
        const { state } = fill(startPractice([job(1, 3, 0.008), job(2, 20, 0.001)]));
        const boxes = boxesToDraw(state);
        assert.equal(boxes.length, MAX_BOXES);
        assert.deepEqual(boxes.slice(0, 3).map((b) => b.key), [1, 1, 1]);
        assert.ok(boxes.every((b) => b.side >= 0.16 && b.side <= 0.5));
    });
});
