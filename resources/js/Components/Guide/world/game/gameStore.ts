import { useSyncExternalStore } from "react";
import type { FreightState } from "./freight";
import type { StackBox } from "./ItemStacker";
import type { Hold, Placed } from "./packer";
import type { PracticeState } from "./practice";
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
/** Follow: the camera trails the worker. Director: the orbit camera, the worker stays put. */
export type GameView = "follow" | "director";

export interface GameState {
    mode: GameMode;
    view: GameView;
    /** The job zone the worker stands in, if any. */
    zone: ZoneKey | null;
    /** The running session (practice.ts), kept while you step out to Watch and back; null until the first list arrives. */
    session: PracticeState | null;
    /** The freight car's running load (freight.ts); null when there is no shipment to load. */
    freight: FreightState | null;
    /** Live: moves are sent to the real routes (actions.ts). Off every time the page loads; never remembered. */
    live: boolean;
    /** A put-up is on its way to the server. */
    saving: boolean;
}

export interface PlayerPose {
    x: number;
    z: number;
    /** Facing, in radians about y; 0 faces south (+z). */
    yaw: number;
}

const MODE_KEY = "duka.world.mode";

function storedMode(): GameMode {
    try {
        return window.localStorage.getItem(MODE_KEY) === "play" ? "play" : "watch";
    } catch {
        return "watch";
    }
}

let state: GameState = { mode: typeof window === "undefined" ? "watch" : storedMode(), view: "follow", zone: null, session: null, freight: null, live: false, saving: false };
const listeners = new Set<() => void>();

/** Where the worker stands; null until Play first places them. */
export const player: { pose: PlayerPose | null } = { pose: null };
/** What the scene shows that React decided, so a rebuilt scene (after a colour change) puts it back: the boxes on the worker's back, which zones are lit, and the freight car (null: none). */
export const kept: { boxes: StackBox[]; zones: ZoneKey[]; car: CarView | null } = { boxes: [], zones: [], car: null };

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
    if (patch.mode) {
        try {
            window.localStorage.setItem(MODE_KEY, patch.mode);
        } catch {
            // Private window or blocked storage: the choice just isn't remembered.
        }
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
