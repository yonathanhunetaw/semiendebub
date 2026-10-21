import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handOver, handToCourier, putBackAtHub, receive, refreshRelay, relayBoxesToDraw, relayLoad, relayUnit, roleNow, startRelay, takeAtHub, type RelayJob } from "./relay.ts";
import { GUESSED_UNIT_CBM } from "./practice.ts";

// Run with: npm run test:js

const job = (n: number, quantity = 2, unitCbm = 0.05): RelayJob => ({
    key: `transfer-${n}`, reference: `TRF-${n}`, serverStage: "pending", itemName: `Item ${n}`, quantity, unit: "Carton", unitCbm, guessed: false, urgent: false,
});

describe("relay: Remote Hub to the store, through a courier", () => {
    it("goes hub keeper → courier → store keeper, and lands received", () => {
        let state = startRelay([job(1), job(2)]);
        assert.equal(roleNow(state), null);

        const taken = takeAtHub(state, "transfer-1");
        assert.ok(taken.ok);
        state = taken.state;
        assert.equal(roleNow(state), "hub_keeper");

        const toCourier = handToCourier(state);
        assert.ok(toCourier.ok);
        state = toCourier.state;
        assert.equal(roleNow(state), "courier");

        const over = handOver(state);
        assert.ok(over.ok);
        state = over.state;
        assert.equal(roleNow(state), "store_keeper");
        assert.deepEqual(state.handedOver.map((j) => j.key), ["transfer-1"]);

        const got = receive(state);
        assert.ok(got.ok);
        assert.deepEqual(got.state.received.map((j) => j.key), ["transfer-1"]);
        assert.equal(roleNow(got.state), null);
        assert.deepEqual(got.state.waiting.map((j) => j.key), ["transfer-2"]);
    });

    it("refuses carrying it into the shop without the courier, and says why", () => {
        const taken = takeAtHub(startRelay([job(1)]), "transfer-1");
        assert.ok(taken.ok);
        const result = handOver(taken.state);
        assert.equal(result.ok, false);
        assert.match((result as { reason: string }).reason, /courier/);
    });

    it("once the courier has it, the hub keeper cannot add more", () => {
        const taken = takeAtHub(startRelay([job(1), job(2)]), "transfer-1");
        assert.ok(taken.ok);
        const toCourier = handToCourier(taken.state);
        assert.ok(toCourier.ok);
        const more = takeAtHub(toCourier.state, "transfer-2");
        assert.equal(more.ok, false);
        assert.match((more as { reason: string }).reason, /courier has these/);
    });

    it("takes whole jobs as long as they fit an armload; a big one only alone", () => {
        // 0.4 m³ in the arms; another 0.25 would make 0.65, over the 0.6 armload.
        const start = startRelay([job(1, 8, 0.05), job(2, 5, 0.05), job(3, 20, 0.05)]);
        const first = takeAtHub(start, "transfer-1");
        assert.ok(first.ok);
        assert.ok(Math.abs(relayLoad(first.state) - 0.4) < 1e-9);
        assert.equal(takeAtHub(first.state, "transfer-2").ok, false);
        assert.equal(takeAtHub(start, "transfer-3").ok, true);
    });

    it("puts the hub keeper's jobs back, but nothing the courier holds", () => {
        const taken = takeAtHub(startRelay([job(1)]), "transfer-1");
        assert.ok(taken.ok);
        const back = putBackAtHub(taken.state);
        assert.ok(back.ok);
        assert.deepEqual(back.state.waiting.map((j) => j.key), ["transfer-1"]);
        const toCourier = handToCourier(taken.state);
        assert.ok(toCourier.ok);
        assert.equal(putBackAtHub(toCourier.state).ok, false);
    });

    it("cannot hand over or receive what is not there", () => {
        assert.equal(handToCourier(startRelay([job(1)])).ok, false);
        assert.equal(handOver(startRelay([job(1)])).ok, false);
        assert.equal(receive(startRelay([job(1)])).ok, false);
    });

    it("keeps what is moving across a fresh list", () => {
        const taken = takeAtHub(startRelay([job(1), job(2)]), "transfer-1");
        assert.ok(taken.ok);
        const fresh = refreshRelay(taken.state, [job(1), job(2), job(3)]);
        assert.deepEqual(fresh.waiting.map((j) => j.key), ["transfer-2", "transfer-3"]);
        assert.deepEqual(fresh.carrying.map((j) => j.key), ["transfer-1"]);
    });

    it("guesses a size when none is known, and draws a box per unit", () => {
        assert.deepEqual(relayUnit(null), { unitCbm: GUESSED_UNIT_CBM, guessed: true });
        const taken = takeAtHub(startRelay([job(1, 3)]), "transfer-1");
        assert.ok(taken.ok);
        assert.equal(relayBoxesToDraw(taken.state, 8).length, 3);
    });
});
