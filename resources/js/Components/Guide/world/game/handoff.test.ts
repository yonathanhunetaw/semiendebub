import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    advance, cannotTake, differences, doneOnServer, finished, markCounted, mayTake, nextStep, open, refreshRuns, setCount, startRuns, zoneOfStep,
    type RunJob,
} from "./handoff.ts";

const job = (over: Partial<RunJob> = {}): RunJob => ({
    shipmentId: 7,
    reference: "SHP-7",
    status: "ready",
    stage: "prepared",
    origin: "main_hub_a",
    destination: "store_floor",
    courier: null,
    steps: [],
    lines: [
        { variantId: 1, name: "Rice", unit: "Sack", quantity: 10, received: null, damaged: null },
        { variantId: 2, name: "Oil", unit: "Carton", quantity: 4, received: null, damaged: null },
    ],
    ...over,
});

describe("the hand-off after prepared", () => {
    it("starts where the server says", () => {
        assert.equal(doneOnServer("prepared"), 0);
        assert.equal(doneOnServer("en_route"), 3);
        assert.equal(doneOnServer("receiver_checked"), 5);
        assert.equal(nextStep(startRuns([job({ stage: "arrived" })])[7]), "receiver_check");
    });

    it("keeps the server's order and refuses a step out of turn", () => {
        const state = startRuns([job()]);
        assert.match(cannotTake(state[7], "courier_sign", true)!, /not started/);
        assert.match(cannotTake(startRuns([job({ stage: "driver_on_way" })])[7], "courier_sign", true)!, /Check the load/);
        assert.equal(cannotTake(state[7], "courier_start", false), null);
        const next = advance(state, 7, "courier_start", false);
        assert.ok(next.ok);
        assert.match(cannotTake(next.state[7], "courier_start", false)!, /already done/);
    });

    it("needs a signature to sign, courier and receiver", () => {
        let state = startRuns([job({ stage: "driver_checked" })]);
        const refused = advance(state, 7, "courier_sign", false);
        assert.ok(!refused.ok);
        assert.match(refused.reason, /signature/);
        const signed = advance(state, 7, "courier_sign", true);
        assert.ok(signed.ok);
        state = signed.state;
        assert.equal(nextStep(state[7]), "courier_arrive");
    });

    it("walks all six steps and finishes", () => {
        let state = startRuns([job()]);
        const steps = ["courier_start", "courier_check", "courier_sign", "courier_arrive", "receiver_check"] as const;
        for (const step of steps) {
            const r = advance(state, 7, step, true);
            assert.ok(r.ok, step);
            state = r.state;
        }
        assert.ok(!advance(state, 7, "receiver_sign", true).ok, "unsaved count blocks the sign");
        state = markCounted(state, 7);
        const last = advance(state, 7, "receiver_sign", true);
        assert.ok(last.ok);
        assert.ok(finished(last.state[7]));
        assert.equal(open(last.state).length, 0);
    });

    it("counts only after the goods are checked, and validates the count", () => {
        const early = setCount(startRuns([job()]), 7, 1, { received: 9, damaged: 0 });
        assert.ok(!early.ok);
        const state = startRuns([job({ stage: "receiver_checked" })]);
        assert.ok(!setCount(state, 7, 1, { received: -1, damaged: 0 }).ok);
        assert.ok(!setCount(state, 7, 1, { received: 3, damaged: 4 }).ok);
        assert.ok(!setCount(state, 7, 1, { received: 1.5, damaged: 0 }).ok);
        const ok = setCount(state, 7, 1, { received: 8, damaged: 1 });
        assert.ok(ok.ok);
    });

    it("lists what differs from the manifest", () => {
        const state = startRuns([job({ stage: "receiver_checked" })]);
        assert.equal(differences(state[7]).length, 0);
        const short = setCount(state, 7, 1, { received: 8, damaged: 1 });
        assert.ok(short.ok);
        const diff = differences(short.state[7]);
        assert.equal(diff.length, 1);
        assert.equal(diff[0].received, 8);
        assert.equal(diff[0].damaged, 1);
    });

    it("takes a saved count from the server", () => {
        const saved = job({ stage: "receiver_checked", lines: [{ variantId: 1, name: "Rice", unit: "Sack", quantity: 10, received: 9, damaged: 0 }] });
        const state = startRuns([saved]);
        assert.ok(state[7].counted);
        assert.equal(state[7].counts![1].received, 9);
    });

    it("says where each step is taken", () => {
        const state = startRuns([job()]);
        assert.equal(zoneOfStep(state[7], "courier_start"), "truck");
        assert.equal(zoneOfStep(state[7], "courier_arrive"), "store_door");
        const remote = startRuns([job({ origin: "main_hub_b", destination: "remote_hub" })]);
        assert.equal(zoneOfStep(remote[7], "receiver_check"), "remote_door");
    });

    it("lists what the viewer may take for real", () => {
        const state = startRuns([job({ steps: ["courier_start"] })]);
        assert.ok(mayTake(state[7], "courier_start"));
        assert.ok(!mayTake(state[7], "courier_check"));
    });

    it("on a fresh list: Practice keeps progress ahead of the server, Live reads the server", () => {
        const started = advance(startRuns([job()]), 7, "courier_start", false);
        assert.ok(started.ok);
        assert.equal(refreshRuns(started.state, [job()], false)[7].done, 1);
        assert.equal(refreshRuns(started.state, [job()], true)[7].done, 0);
        assert.equal(refreshRuns(started.state, [], false)[7], undefined);
    });
});
