import { useSyncExternalStore } from "react";
import type { FreightState } from "./freight";
import type { RunsState } from "./handoff";
import type { LegsState } from "./legs";
import type { StackBox } from "./ItemStacker";
import type { Station } from "./stations";
import type { StoreBoardData } from "./StoreBoard";
import type { Hold, Placed } from "./packer";
import type { PracticeState } from "./practice";
import type { RelayState } from "./relay";
import type { ZoneKey } from "./zones";

/**
 * The game's state, kept outside the scene: the scene is rebuilt on every
 * colour change, and the game picks up where it was from here.
 *
 * Two kinds of state. What the HUD shows (mode, camera, zone, the jobs) is
 * reactive: set() tells React. Where the worker stands changes every frame,
 * so it lives in `player`, a plain object nobody re-renders for.
 */

export type GameMode = "watch" | "play";
/** Follow: the camera trails the worker. First person: the worker's eyes. Director: the orbit camera, the worker stays put. */
export type GameView = "follow" | "first" | "director";

export interface GameState {
    mode: GameMode;
    view: GameView;
    /** The job zone the worker stands in, if any. */
    zone: ZoneKey | null;
    /** The running session (practice.ts), kept while you step out to Watch and back; null until the first list arrives. */
    session: PracticeState | null;
    /** The freight car's running load (freight.ts); null when there is no shipment to load. */
    freight: FreightState | null;
    /** The Remote Hub → Store relay (relay.ts); null until the first list arrives. */
    relay: RelayState | null;
    /** The hand-off after Mark prepared (handoff.ts); null until the first list arrives. */
    runs: RunsState | null;
    /** Transfer legs (legs.ts); null until the first list arrives. */
    legs: LegsState | null;
    /** Live: moves are sent to the real routes (actions.ts). Off every time the page loads; never remembered. */
    live: boolean;
    /** A put-up is on its way to the server. */
    saving: boolean;
    /** Has this device walked the worker before? Then the how-to-walk hint stays away. */
    hinted: boolean;
    /** Run instead of walk (the Run button, R); Shift does the opposite while it is held. Remembered per device. */
    run: boolean;
}

export interface PlayerPose {
    x: number;
    z: number;
    /** Facing, in radians about y; 0 faces south (+z). */
    yaw: number;
}

const MODE_KEY = "duka.world.mode";
const HINT_KEY = "duka.world.hinted";
const RUN_KEY = "duka.world.run";

function stored(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storedMode(): GameMode {
    try {
        return window.localStorage.getItem(MODE_KEY) === "play" ? "play" : "watch";
    } catch {
        return "watch";
    }
}

let state: GameState = { mode: typeof window === "undefined" ? "watch" : storedMode(), view: "follow", zone: null, session: null, freight: null, relay: null, runs: null, legs: null, live: false, saving: false, hinted: typeof window !== "undefined" && stored(HINT_KEY) === "1", run: typeof window === "undefined" || stored(RUN_KEY) !== "0" };
const listeners = new Set<() => void>();

/** Where the worker stands; null until Play first places them. */
export const player: { pose: PlayerPose | null } = { pose: null };
/** What the scene shows that React decided, so a rebuilt scene (after a colour change) puts it back: the boxes on the worker's back, which zones are lit, the freight car (null: none), and whether the worker wears the courier's colour. */
export const kept: {
    boxes: StackBox[]; zones: ZoneKey[]; car: CarView | null; courier: boolean; board: Station | null;
    /** What the desks' screens and the shop's notice board show, so a rebuilt scene paints them again. */
    stations: Station[] | null; struck: ReadonlySet<string>; storeBoard: StoreBoardData | null;
} = { boxes: [], zones: [], car: null, courier: false, board: null, stations: null, struck: new Set(), storeBoard: null };

/** What the scene draws of the freight car: its hold, its sign, and the boxes packed in it. */
export interface CarView {
    hold: Hold;
    label: string;
    placed: Placed[];
}
/** Has Live been confirmed once since the page loaded? Then switching it on again does not ask. */
export const liveConfirmed = { once: false };

export function getGame(): GameState {
    return state;
}

export function setGame(patch: Partial<GameState>): void {
    state = { ...state, ...patch };
    try {
        if (patch.mode) window.localStorage.setItem(MODE_KEY, patch.mode);
        if (patch.hinted) window.localStorage.setItem(HINT_KEY, "1");
        if (patch.run !== undefined) window.localStorage.setItem(RUN_KEY, patch.run ? "1" : "0");
    } catch {
        // Private window or blocked storage: the choice just isn't remembered.
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useGame(): GameState {
    return useSyncExternalStore(subscribe, getGame, getGame);
}
