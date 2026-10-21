import * as THREE from "three";

/**
 * The boxes on the worker's back. Picking up flies each new box from where
 * it lay to the top of the stack, one after another; putting up flies them
 * off, top first, to the rack. Boxes are made when picked up and freed when
 * put up (an event, never per frame); the flights run in the world's loop.
 *
 * The stack hangs on the worker's `back` (so it bobs as they walk). A box is
 * a carton-coloured cube, its shade from the job it belongs to, so the jobs
 * read apart.
 */

export interface StackBox {
    /** What it belongs to (a shelving job's transfer, a manifest line's variant): its shade, and which boxes go together. */
    key: number;
    /** A cube's edge, in metres. */
    side: number;
}

interface Flight {
    mesh: THREE.Mesh;
    from: THREE.Vector3;
    /** Landing on the back (a slot in the stack) or off it (a fixed point in the world). */
    to: { onBack: THREE.Vector3 } | { world: THREE.Vector3 };
    start: number;
    ms: number;
}

export interface Stacker {
    /** Make the stack these boxes; new ones fly in from `from` (world), missing ones vanish. */
    set: (boxes: StackBox[], from: THREE.Vector3 | null) => void;
    /** Fly every box off to `to` (world), top first; resolves when the last has landed. */
    unload: (to: THREE.Vector3) => Promise<void>;
    update: (now: number) => void;
    dispose: () => void;
}

const FLY_MS = 250;
const STAGGER_MS = 60;

export function createStacker(scene: THREE.Scene, back: THREE.Object3D, reducedMotion: boolean): Stacker {
    const stack: Array<{ box: StackBox; mesh: THREE.Mesh; slot: THREE.Vector3 }> = [];
    const flights: Flight[] = [];
    const landed: Array<() => void> = [];
    const scratch = new THREE.Vector3();

    const shade = (key: number) => new THREE.Color().setHSL(0.07 + ((key * 37) % 10) * 0.006, 0.5, 0.42 + ((key * 53) % 7) * 0.03);
    const makeBox = (box: StackBox) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.side, box.side * 0.8, box.side), new THREE.MeshStandardMaterial({ color: shade(box.key), roughness: 0.85, flatShading: true }));
        mesh.castShadow = true;
        mesh.raycast = () => {};
        return mesh;
    };
    const free = (mesh: THREE.Mesh) => {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
    };
    /** Slots up the back, each box on the one below, a little off-centre every other one. */
    const layout = () => {
        let y = 0;
        stack.forEach((entry, i) => {
            const h = entry.box.side * 0.8;
            entry.slot.set(i % 2 === 0 ? 0.02 : -0.02, y + h / 2, -entry.box.side / 2);
            y += h;
        });
    };

    const set = (boxes: StackBox[], from: THREE.Vector3 | null) => {
        // Keep the boxes that are still carried (matched in order per job), drop the rest.
        const want = [...boxes];
        for (let i = stack.length - 1; i >= 0; i--) {
            const at = want.findIndex((b) => b.key === stack[i].box.key);
            if (at >= 0) want.splice(at, 1);
            else {
                // A box still flying in is stopped first, so it cannot land after it is gone.
                const mesh = stack[i].mesh;
                flights.splice(0, flights.length, ...flights.filter((f) => f.mesh !== mesh));
                free(mesh);
                stack.splice(i, 1);
            }
        }
        const added = want.map((box) => {
            const entry = { box, mesh: makeBox(box), slot: new THREE.Vector3() };
            stack.push(entry);
            return entry;
        });
        layout();
        const now = performance.now();
        added.forEach((entry, i) => {
            if (!from || reducedMotion) {
                back.add(entry.mesh);
                entry.mesh.position.copy(entry.slot);
                return;
            }
            scene.add(entry.mesh);
            entry.mesh.position.copy(from);
            flights.push({ mesh: entry.mesh, from: from.clone(), to: { onBack: entry.slot }, start: now + i * STAGGER_MS, ms: FLY_MS });
        });
        // Boxes already on the back settle into their new slots.
        stack.forEach((entry) => entry.mesh.parent === back && entry.mesh.position.copy(entry.slot));
    };

    const unload = (to: THREE.Vector3) => new Promise<void>((resolve) => {
        if (stack.length === 0) return resolve();
        const now = performance.now();
        const leaving = stack.splice(0).reverse();
        if (reducedMotion) {
            leaving.forEach((entry) => free(entry.mesh));
            return resolve();
        }
        leaving.forEach((entry, i) => {
            // Off the back into the world, where it is now.
            scene.attach(entry.mesh);
            flights.push({ mesh: entry.mesh, from: entry.mesh.position.clone(), to: { world: to.clone() }, start: now + i * STAGGER_MS, ms: FLY_MS });
        });
        landed.push(resolve);
    });

    const update = (now: number) => {
        for (let i = flights.length - 1; i >= 0; i--) {
            const f = flights[i];
            if (now < f.start) continue;
            const k = Math.min(1, (now - f.start) / f.ms);
            const eased = 1 - (1 - k) ** 3;
            const target = "onBack" in f.to ? back.localToWorld(scratch.copy(f.to.onBack)) : scratch.copy(f.to.world);
            f.mesh.position.lerpVectors(f.from, target, eased);
            // A little hop on the way.
            f.mesh.position.y += Math.sin(Math.PI * k) * 0.5;
            if (k < 1) continue;
            flights.splice(i, 1);
            if ("onBack" in f.to) {
                back.add(f.mesh);
                f.mesh.position.copy(f.to.onBack);
            } else {
                free(f.mesh);
            }
        }
        if (landed.length > 0 && !flights.some((f) => "world" in f.to)) landed.splice(0).forEach((done) => done());
    };

    const dispose = () => {
        stack.splice(0).forEach((entry) => free(entry.mesh));
        flights.splice(0).forEach((f) => free(f.mesh));
        landed.splice(0).forEach((done) => done());
    };

    return { set, unload, update, dispose };
}
