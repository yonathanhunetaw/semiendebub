import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPayload, initialValues, isWorthShowing, visibleItems, whatIsWrong, type Station, type StationAction } from "./stations.ts";

const count: StationAction = {
    key: "receive",
    label: "Receive",
    method: "post",
    url: "/arrivals/3/receive",
    data: { hub_id: 9 },
    fields: [
        { name: "counts.12.received", label: "Rice got", type: "number", default: 10, min: 0, required: true },
        { name: "counts.12.damaged", label: "Rice bad", type: "number", default: 0, min: 0 },
        { name: "note", label: "Note", type: "text" },
    ],
};

describe("stations", () => {
    it("starts each field at its default", () => {
        assert.deepEqual(initialValues(count.fields), { "counts.12.received": 10, "counts.12.damaged": 0, note: "" });
    });

    it("builds nested data from dotted names and leaves out empty optional fields", () => {
        const data = buildPayload(count, { "counts.12.received": 8, "counts.12.damaged": 1, note: "" });
        assert.deepEqual(data, { hub_id: 9, counts: { 12: { received: 8, damaged: 1 } } });
    });

    it("never changes the action's fixed data", () => {
        buildPayload(count, { "counts.12.received": 8, "counts.12.damaged": 0, note: "x" });
        assert.deepEqual(count.data, { hub_id: 9 });
    });

    it("says what is wrong with the values", () => {
        assert.match(whatIsWrong(count, { "counts.12.received": -1, "counts.12.damaged": 0, note: "" })!, /less than 0/);
        assert.match(whatIsWrong(count, { "counts.12.received": 1.5, "counts.12.damaged": 0, note: "" })!, /whole number/);
        assert.match(whatIsWrong(count, { "counts.12.received": "", "counts.12.damaged": 0, note: "" })!, /needed/);
        assert.equal(whatIsWrong(count, { "counts.12.received": 5, "counts.12.damaged": 0, note: "" }), null);
    });

    it("checks a choice is one of the options", () => {
        const pick: StationAction = { key: "r", label: "Settle", method: "post", url: "/x", fields: [{ name: "resolution", label: "Result", type: "select", options: [{ value: "found", label: "Found" }], required: true }] };
        assert.match(whatIsWrong(pick, { resolution: "lost" })!, /Choose one/);
        assert.equal(whatIsWrong(pick, { resolution: "found" }), null);
    });

    it("strikes rehearsed items off and lights desks with work, stats or a link", () => {
        const station: Station = { key: "receiving", label: "Receiving", desk: "d", items: [{ id: "a", title: "A", actions: [] }, { id: "b", title: "B", actions: [] }] };
        const struck = new Set(["receiving:a"]);
        assert.deepEqual(visibleItems(station, struck).map((i) => i.id), ["b"]);
        assert.ok(isWorthShowing(station, struck));
        assert.ok(!isWorthShowing({ ...station, items: [] }, struck));
        assert.ok(isWorthShowing({ ...station, items: [], open: { label: "Open", url: "/x" } }, struck));
        assert.ok(isWorthShowing({ ...station, items: [], stats: [{ label: "x", value: 1 }] }, struck));
    });
});
