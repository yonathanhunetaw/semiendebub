import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLACES, type PlaceKey } from "./places";

/**
 * The world as designed in Blender: an optional `model/duka-world.glb` (next
 * to this file) laid over the world drawn from code. Vite bundles it when it
 * is there; without it nothing is fetched and nothing changes.
 *
 * The file is read by node name (the naming rules handed to the designer):
 *
 *   place_<key>     a place's building (key from places.ts PLACES): it
 *                   replaces the code-drawn one; tapping it opens the place
 *   scenery_<name>  replaces the code's scenery of that name: compound, roads,
 *                   store_shell, container_truck
 *   zone_*          a job area, drawn invisible       } kept in `markers`,
 *   station_*       an interactive spot               } by name, for Play
 *   spawn_*         where someone appears: spawn_player_<app> starts that
 *                   app's worker there (spawn.ts)
 *   blocker_*       an invisible box the worker cannot walk through
 *   door_*, label_* a door's hinge, a label's spot
 *   route_<name>_NN a route, as ordered points
 *
 * One unit is one metre; +x east, +z south, +y up (Blender's glTF export
 * turns its Z-up into this).
 */

// A glob, not an import: a missing file is an empty match instead of a build error.
const bundled = import.meta.glob<string>("./model/duka-world.glb", { query: "?url", import: "default", eager: true });
export const WORLD_MODEL_URL: string | null = Object.values(bundled)[0] ?? null;

export interface Marker {
    name: string;
    position: [number, number, number];
    /** Which way it faces, about y: 0 faces south (+z), as the worker's yaw. */
    yaw: number;
    /** Its world bounds, when it is a mesh: [minX, minZ, maxX, maxZ]. */
    rect: [number, number, number, number] | null;
}

export interface WorldMarkers {
    zones: Map<string, Marker>;
    stations: Map<string, Marker>;
    spawns: Map<string, Marker>;
    blockers: Marker[];
    doors: Map<string, Marker>;
    labels: Map<string, Marker>;
    routes: Map<string, Array<[number, number]>>;
}

export interface WorldModel {
    root: THREE.Group;
    /** The model's building for each place it redraws. */
    places: Map<PlaceKey, THREE.Object3D>;
    /** The code scenery it redraws, by name (`compound`, `roads`…). */
    scenery: Set<string>;
    markers: WorldMarkers;
}

/** The markers of the last model loaded, for the parts of Play that start from them (spawn.ts, siteBlockers.ts). */
export let worldMarkers: WorldMarkers | null = null;

const PLACE_KEYS = new Set<string>(PLACES.map((p) => p.key));

/** Loads and reads the designed world; null when there is none (or it cannot be read). */
export async function loadWorldModel(url = WORLD_MODEL_URL): Promise<WorldModel | null> {
    if (!url) return null;
    let root: THREE.Group;
    try {
        root = (await new GLTFLoader().loadAsync(url)).scene;
    } catch (error) {
        console.warn("Live Operations: could not read the designed world; drawing it from code.", error);
        return null;
    }
    root.updateMatrixWorld(true);

    const places = new Map<PlaceKey, THREE.Object3D>();
    const scenery = new Set<string>();
    const markers: WorldMarkers = { zones: new Map(), stations: new Map(), spawns: new Map(), blockers: [], doors: new Map(), labels: new Map(), routes: new Map() };
    const routePoints = new Map<string, Array<{ n: number; at: [number, number] }>>();
    const hidden: THREE.Object3D[] = [];

    root.traverse((object) => {
        const name = object.name;
        if (name.startsWith("place_") && PLACE_KEYS.has(name.slice(6))) {
            places.set(name.slice(6) as PlaceKey, object);
        } else if (name.startsWith("scenery_")) {
            scenery.add(name.slice(8));
        } else if (name.startsWith("zone_")) {
            markers.zones.set(name, marker(object));
            hidden.push(object);
        } else if (name.startsWith("station_")) {
            markers.stations.set(name, marker(object));
        } else if (name.startsWith("spawn_")) {
            markers.spawns.set(name, marker(object));
        } else if (name.startsWith("blocker_")) {
            markers.blockers.push(marker(object));
            hidden.push(object);
        } else if (name.startsWith("door_")) {
            markers.doors.set(name, marker(object));
        } else if (name.startsWith("label_")) {
            markers.labels.set(name, marker(object));
        } else if (name.startsWith("route_")) {
            const m = /^route_(.+)_(\d+)$/.exec(name);
            if (m) {
                const at = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
                const list = routePoints.get(m[1]) ?? [];
                list.push({ n: Number(m[2]), at: [at.x, at.z] });
                routePoints.set(m[1], list);
            }
        }
    });

    // Zones and blockers are markers, not things to see.
    hidden.forEach((o) => (o.visible = false));
    routePoints.forEach((list, key) => markers.routes.set(key, list.sort((a, b) => a.n - b.n).map((p) => p.at)));
    root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });

    worldMarkers = markers;
    return { root, places, scenery, markers };
}

function marker(object: THREE.Object3D): Marker {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    object.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
    // Its forward (+z) turned by the node, read as a yaw about y.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    let rect: Marker["rect"] = null;
    if ((object as THREE.Mesh).isMesh) {
        const box = new THREE.Box3().setFromObject(object);
        rect = [box.min.x, box.min.z, box.max.x, box.max.z];
    }
    return { name: object.name, position: [position.x, position.y, position.z], yaw: Math.atan2(forward.x, forward.z), rect };
}
