import * as THREE from "three";
import { createFreightCar } from "./FreightPacker";
import { createStacker, type StackBox } from "./ItemStacker";
import { createDeskScreens } from "./DeskScreens";
import { createOfficeBoard } from "./OfficeBoard";
import { createStoreBoard, type StoreBoardData } from "./StoreBoard";
import type { Station } from "./stations";
import { createPlayer, type PlayerOptions } from "./PlayerController";
import { getGame, kept, player as pose, setGame, type CarView, type GameView } from "./gameStore";
import type { Placed } from "./packer";
import { ZONES, drawZones, zoneAt, type ZoneKey } from "./zones";

/**
 * Everything Play adds to the world, as one thing DukaWorld holds: the
 * worker (PlayerController), the job zones (zones.ts), the boxes on their
 * back (ItemStacker) and the freight car with its load (FreightPacker).
 * Built when Play starts and again after every colour change; what is
 * carried, which zones are lit and the car survive that in gameStore
 * (`kept`), so they come back as they were.
 *
 * React (PlayLayer) drives it through this small surface; it tells React
 * only when the worker steps into or out of a zone.
 */

export interface GameSceneOptions extends Omit<PlayerOptions, "onPose"> {
    zoneTones: { pickup: THREE.Color; drop: THREE.Color };
    carTones: { cab: THREE.Color; body: THREE.Color; dark: THREE.Color };
    onZone: (zone: ZoneKey | null) => void;
}

export interface GameScene {
    update: (dt: number) => void;
    setView: (view: GameView) => void;
    ownsCamera: () => boolean;
    /** Looking through the worker's eyes (the shop's walls then stand solid). */
    isFirstPerson: () => boolean;
    walkTo: (x: number, z: number) => void;
    /** Which zones to show (the HUD knows whether there is anything to pick up or put up). */
    showZones: (keys: ZoneKey[]) => void;
    /** The stack is now these boxes; new ones fly in from that zone. */
    setCarried: (boxes: StackBox[], from: ZoneKey | null) => void;
    /** Fly the whole stack into a zone; resolves when it has landed. */
    unloadAt: (zone: ZoneKey) => Promise<void>;
    /** The freight car at the platform, and its load; `fresh` boxes drop in. Null: no car. */
    setCar: (car: CarView | null, fresh?: Placed[]) => void;
    /** Dress the worker as the courier (the delivery colour), or back as a keeper. */
    setCourier: (on: boolean) => void;
    /** What the office's staff board shows (the "board" station); null while it is being read. */
    setBoard: (station: Station | null) => void;
    /** What the tables' screens say (every desk's stations), and which items a Practice rehearsal struck off. */
    setStations: (stations: Station[] | null, struck: ReadonlySet<string>) => void;
    /** What the shop's notice board says. */
    setStoreBoard: (data: StoreBoardData | null) => void;
    dispose: () => void;
}

const pointOf = (key: ZoneKey) => new THREE.Vector3(...ZONES.find((z) => z.key === key)!.point);

export function createGameScene(options: GameSceneOptions): GameScene {
    const { scene, reducedMotion } = options;
    const worker = createPlayer({ ...options, onPose: (p) => (pose.pose = p) });
    const zones = drawZones(scene, options.zoneTones, reducedMotion);
    const stacker = createStacker(scene, worker.back, reducedMotion);
    const car = createFreightCar(scene, options.carTones, reducedMotion);
    const board = createOfficeBoard(scene);
    board.set(kept.board);
    const screens = createDeskScreens(scene);
    screens.set(kept.stations, kept.struck);
    const storeBoard = createStoreBoard(scene);
    storeBoard.set(kept.storeBoard);
    let carHold: CarView["hold"] | null = null;
    const setCar = (view: CarView | null, fresh: Placed[] = []) => {
        kept.car = view;
        // A new vehicle (or none): rebuild the body, and the worker walks round its new size.
        if (view?.hold !== carHold) {
            carHold = view?.hold ?? null;
            car.setHold(carHold, view?.label ?? "");
            const footprint = car.footprint();
            worker.setObstacles(footprint ? [footprint] : []);
        }
        car.setBoxes(view?.placed ?? [], fresh);
    };
    // Back as it was before a rebuild, without flying in again.
    stacker.set(kept.boxes, null);
    zones.show(kept.zones);
    setCar(kept.car);
    const setCourier = (on: boolean) => {
        kept.courier = on;
        worker.setVest(on ? options.carTones.cab : null);
    };
    setCourier(kept.courier);

    let inZone: ZoneKey | null = null;
    const startedAt = performance.now();
    // Where the worker started, to tell when they have first walked (and the how-to-walk hint can go).
    const start = { x: options.spawn.x, z: options.spawn.z };

    const update = (dt: number) => {
        worker.update(dt);
        const now = performance.now();
        stacker.update(now);
        car.update(now);
        zones.update((now - startedAt) / 1000, pose.pose, options.camera.position);

        if (pose.pose && !getGame().hinted && Math.hypot(pose.pose.x - start.x, pose.pose.z - start.z) > 2) setGame({ hinted: true });

        // For the browser tests (and curious developers): where the worker stands, in a dev build only.
        if (import.meta.env.DEV) (window as unknown as { __dukaWorker?: unknown }).__dukaWorker = pose.pose;

        const here = pose.pose ? zoneAt(pose.pose.x, pose.pose.z)?.key ?? null : null;
        if (here !== inZone) {
            inZone = here;
            zones.setActive(here);
            options.onZone(here);
        }
    };

    return {
        update,
        setView: worker.setView,
        ownsCamera: worker.ownsCamera,
        isFirstPerson: worker.isFirstPerson,
        walkTo: worker.walkTo,
        showZones: (keys) => {
            kept.zones = keys;
            zones.show(keys);
        },
        setCarried: (boxes, from) => {
            kept.boxes = boxes;
            stacker.set(boxes, from ? pointOf(from) : null);
        },
        setCar,
        setCourier,
        setBoard: (station) => {
            kept.board = station;
            board.set(station);
        },
        setStations: (stations, struck) => {
            kept.stations = stations;
            kept.struck = struck;
            screens.set(stations, struck);
        },
        setStoreBoard: (data) => {
            kept.storeBoard = data;
            storeBoard.set(data);
        },
        unloadAt: (zone) => {
            kept.boxes = [];
            return stacker.unload(pointOf(zone));
        },
        dispose: () => {
            stacker.dispose();
            car.dispose();
            board.dispose();
            screens.dispose();
            storeBoard.dispose();
            zones.dispose();
            worker.dispose();
            options.onZone(null);
        },
    };
}
