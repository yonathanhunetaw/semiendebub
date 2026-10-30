/**
 * How full a vehicle or a container is, for the world to draw: the load (m³)
 * against what it takes. Pure, so it is tested without Three.js
 * (loadFill.test.ts); DukaWorld draws the block and writes the label.
 */

export type FillLevel = "ok" | "high" | "over" | "unknown";

export interface Fill {
    /** How far along the hold the load reaches from the cab end, 0–1 (an overload is drawn full). */
    fraction: number;
    level: FillLevel;
    /** The sign over the vehicle, e.g. "62% · 3.7 / 6 m³". */
    label: string;
}

/** Over this share of the vehicle the load turns amber: near full, check before adding more. */
export const HIGH_SHARE = 0.8;

/**
 * With no vehicle chosen yet the load is drawn against the van the world shows (its box body is about this much
 * inside), so a manifest still rises as it is made; the sign says no vehicle is chosen.
 */
export const DRAWN_VAN_CBM = 13.5;

const m3 = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));

export function fillOf(cbm: number, capacity: number | null | undefined, guessed = false): Fill {
    const load = Math.max(0, cbm || 0);
    const short = guessed ? " · some sizes missing" : "";

    if (!capacity || capacity <= 0) {
        return { fraction: Math.min(1, load / DRAWN_VAN_CBM), level: "unknown", label: `${m3(load)} m³ · no vehicle yet${short}` };
    }

    const share = load / capacity;
    const level: FillLevel = share > 1 ? "over" : share >= HIGH_SHARE ? "high" : "ok";
    const head = level === "over" ? `Over by ${m3(load - capacity)} m³` : `${Math.round(share * 100)}%`;

    return { fraction: Math.min(1, share), level, label: `${head} · ${m3(load)} / ${m3(capacity)} m³${short}` };
}
