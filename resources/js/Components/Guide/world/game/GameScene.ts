import * as THREE from "three";
import { createFreightCar } from "./FreightPacker";
import { createStacker, type StackBox } from "./ItemStacker";
import { createPlayer, type PlayerOptions } from "./PlayerController";
import { kept, player as pose, type CarView, type GameView } from "./gameStore";
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
    walkTo: (x: number, z: number) => void;
    /** Which zones to show (the HUD knows whether there is anything to pick up or put up). */
    showZones: (keys: ZoneKey[]) => void;
    /** The stack is now these boxes; new ones fly in from that zone. */
    setCarried: (boxes: StackBox[], from: ZoneKey | null) => void;
    /** Fly the whole stack into a zone; resolves when it has landed. */
    unloadAt: (zone: ZoneKey) => Promise<void>;
    /** The freight car at the platform, and its load; `fresh` boxes drop in. Null: no car. */
    setCar: (car: CarView | null, fresh?: Placed[]) => void;
    dispose: () => void;
}

const pointOf = (key: ZoneKey) => new THREE.Vector3(...ZONES.find((z) => z.key === key)!.point);

export function createGameScene(options: GameSceneOptions): GameScene {
    const { scene, reducedMotion } = options;
    const worker = createPlayer({ ...options, onPose: (p) => (pose.pose = p) });
    const zones = drawZones(scene, options.zoneTones, reducedMotion);
    const stacker = createStacker(scene, worker.back, reducedMotion);
    const car = createFreightCar(scene, options.carTones, reducedMotion);
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

    let inZone: ZoneKey | null = null;
    const startedAt = performance.now();

    const update = (dt: number) => {
        worker.update(dt);
        const now = performance.now();
        stacker.update(now);
        car.update(now);
        zones.update((now - startedAt) / 1000);

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
        unloadAt: (zone) => {
            kept.boxes = [];
            return stacker.unload(pointOf(zone));
        },
        dispose: () => {
            stacker.dispose();
            car.dispose();
            zones.dispose();
            worker.dispose();
            options.onZone(null);
        },
    };
}
