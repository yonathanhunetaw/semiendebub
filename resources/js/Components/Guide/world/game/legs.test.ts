import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceLeg, cannotTakeLeg, coveredByRelay, mayTakeLeg, nextLegStep, openLegs, refreshLegs, setLegCount, startLegs, zoneOfLeg, type LegJob } from "./legs.ts";

const job = (over: Partial<LegJob> = {}): LegJob => ({
    key: "transfer-1", kind: "transfer", id: 1, reference: "TRF-1", stage: "waiting", origin: "remote_hub", destination: "store_floor",
    itemName: "Rice", quantity: 6, unit: "Sack", unitCbm: 0.05, needsCourier: true, courier: null, awaitsApproval: false, steps: [], ...over,
});

describe("transfer legs", () => {
    it("goes claim → dispatch → handover → complete when a courier carries it", () => {
        let state = startLegs([job()]);
        const seen: Array<string | null> = [];
        for (const step of ["claim", "dispatch", "handover", "complete"] as const) {
            seen.push(nextLegStep(state["transfer-1"]));
            const r = advanceLeg(state, "transfer-1", step);
            assert.ok(r.ok, step);
            state = r.state;
        }
        assert.deepEqual(seen, ["claim", "dispatch", "handover", "complete"]);
        assert.equal(state["transfer-1"].closed, "received");
        assert.equal(openLegs(state).length, 0);
    });

    it("skips the courier on a move that stays on one site", () => {
        const state = startLegs([job({ needsCourier: false })]);
        assert.equal(nextLegStep(state["transfer-1"]), "dispatch");
        const r = advanceLeg(state, "transfer-1", "dispatch");
        assert.ok(r.ok);
        assert.equal(nextLegStep(r.state["transfer-1"]), "complete");
    });

    it("refuses to dispatch before a courier has it, with the server's reason", () => {
        const state = startLegs([job()]);
        const r = advanceLeg(state, "transfer-1", "dispatch");
        assert.ok(!r.ok);
        assert.match(r.reason, /courier has to carry it/);
    });

    it("refuses to dispatch an automated proposal nobody approved", () => {
        const state = startLegs([job({ stage: "claimed", awaitsApproval: true })]);
        const r = advanceLeg(state, "transfer-1", "dispatch");
        assert.ok(!r.ok);
        assert.match(r.reason, /store manager must approve/);
    });

    it("refuses to hand over before dispatch, and to receive before the hand-over", () => {
        const state = startLegs([job({ stage: "claimed" })]);
        const h = advanceLeg(state, "transfer-1", "handover");
        assert.ok(!h.ok);
        assert.match(h.reason, /dispatches it first/);
        const inTransit = startLegs([job({ stage: "in_transit" })]);
        const c = advanceLeg(inTransit, "transfer-1", "complete");
        assert.ok(!c.ok);
        assert.match(c.reason, /hand it over/);
    });

    it("validates the count before receiving", () => {
        let state = startLegs([job({ stage: "handed_over" })]);
        assert.ok(!setLegCount(state, "transfer-1", 3, 4).ok);
        assert.ok(!setLegCount(state, "transfer-1", -1, 0).ok);
        const ok = setLegCount(state, "transfer-1", 5, 1);
        assert.ok(ok.ok);
        state = ok.state;
        assert.ok(advanceLeg(state, "transfer-1", "complete").ok);
    });

    it("cancels at any point before it closes", () => {
        const state = startLegs([job({ stage: "in_transit" })]);
        const r = advanceLeg(state, "transfer-1", "cancel");
        assert.ok(r.ok);
        assert.equal(r.state["transfer-1"].closed, "cancelled");
        assert.ok(!advanceLeg(r.state, "transfer-1", "claim").ok);
    });

    it("a refill leg is accepted first", () => {
        const state = startLegs([job({ key: "leg-9", kind: "refill", stage: "to_accept" })]);
        assert.equal(nextLegStep(state["leg-9"]), "accept");
        const r = advanceLeg(state, "leg-9", "accept");
        assert.ok(r.ok);
        assert.equal(nextLegStep(r.state["leg-9"]), "claim");
    });

    it("says where each step is taken", () => {
        const state = startLegs([job({ stage: "to_accept" })]);
        assert.equal(zoneOfLeg(state["transfer-1"], "accept"), "remote");
        assert.equal(zoneOfLeg(state["transfer-1"], "claim"), "remote_door");
        assert.equal(zoneOfLeg(state["transfer-1"], "handover"), "store_door");
        const hub = startLegs([job({ origin: "main_hub_a", destination: "remote_hub" })]);
        assert.equal(zoneOfLeg(hub["transfer-1"], "dispatch"), "truck");
        assert.equal(zoneOfLeg(hub["transfer-1"], "complete"), "remote_door");
    });

    it("leaves the relay's own start to the relay in Practice", () => {
        assert.ok(coveredByRelay(job(), "waiting"));
        assert.ok(!coveredByRelay(job(), "in_transit"));
        assert.ok(!coveredByRelay(job({ origin: "main_hub_a" }), "waiting"));
    });

    it("knows what the viewer may take for real", () => {
        const state = startLegs([job({ steps: ["claim"] })]);
        assert.ok(mayTakeLeg(state["transfer-1"], "claim"));
        assert.ok(!mayTakeLeg(state["transfer-1"], "dispatch"));
        assert.equal(cannotTakeLeg(state["transfer-1"], "claim"), null);
    });

    it("on a fresh list: Practice keeps progress ahead of the server, Live reads the server", () => {
        const moved = advanceLeg(startLegs([job()]), "transfer-1", "claim");
        assert.ok(moved.ok);
        assert.equal(refreshLegs(moved.state, [job()], false)["transfer-1"].stage, "claimed");
        assert.equal(refreshLegs(moved.state, [job()], true)["transfer-1"].stage, "waiting");
    });
});
