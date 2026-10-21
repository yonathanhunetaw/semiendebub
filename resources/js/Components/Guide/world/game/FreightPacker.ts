import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Box } from "./collision";
import type { Hold, Placed } from "./packer";
import { CAR } from "./zones";

/**
 * The freight car at the platform, and the load in it. Its open doors face
 * west onto the platform (zones.ts CAR); the hold runs east from them, as
 * long as the car's volume needs (packer.ts holdFor), with the cab beyond.
 * The hold is open-topped and its sides see-through, so the follow camera
 * looks in on the stack.
 *
 * The packing itself is decided in packer.ts; this only draws what it
 * placed. Hold coordinates (x from the cab end, y up, z across) become world
 * ones here: the front of the hold is at the cab, so x runs west.
 */

export interface FreightCar {
    /** Rebuild the car for a hold (a different vehicle), and its label; null takes the car away. */
    setHold: (hold: Hold | null, label: string) => void;
    /** Draw these boxes in the hold; `fresh` ones (already in the list) drop into place. */
    setBoxes: (placed: Placed[], fresh: Placed[]) => void;
    /** The ground the car stands on, for the worker to walk round. */
    footprint: () => Box | null;
    update: (now: number) => void;
    dispose: () => void;
}

const CAB = 1.7;
const WIDTH_OUT = 2.1;
const DROP_MS = 260;

export function createFreightCar(scene: THREE.Scene, tones: { cab: THREE.Color; body: THREE.Color; dark: THREE.Color }, reducedMotion: boolean): FreightCar {
    const root = new THREE.Group();
    scene.add(root);
    let body: THREE.Group | null = null;
    let hold: Hold | null = null;
    /** The load: one instanced mesh, so a full car is one draw call however many cartons it holds. */
    let boxes: THREE.InstancedMesh | null = null;
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const boxMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    const sign = document.createElement("div");
    sign.className = "world-badge world-badge--zone";
    const label = new CSS2DObject(sign);
    root.add(label);
    /** Cartons still falling into place: their instance, where they land, their size, and when they start. */
    const drops: Array<{ index: number; at: THREE.Vector3; size: THREE.Vector3; start: number }> = [];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scratch = new THREE.Vector3();

    const mat = (color: THREE.Color, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });
    const part = (g: THREE.Group, size: [number, number, number], at: [number, number, number], material: THREE.Material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        m.position.set(...at);
        m.castShadow = true;
        m.receiveShadow = true;
        m.raycast = () => {};
        g.add(m);
        return m;
    };
    const free = (object: THREE.Object3D) => object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });

    /** The car's body for a hold `length` long: bed, walls, open doors, cab, wheels. */
    const build = (length: number): THREE.Group => {
        const g = new THREE.Group();
        const W = WIDTH_OUT;
        const front = CAR.rearX + length;
        const mid = CAR.rearX + length / 2;
        const bed = mat(tones.dark);
        const wall = mat(tones.body, { transparent: true, opacity: 0.28, depthWrite: false });
        part(g, [length, 0.12, W], [mid, CAR.bed - 0.06, CAR.z], bed);
        // The sides, see-through so the load shows; the front wall solid, against the cab.
        part(g, [length, 2.05, 0.05], [mid, CAR.bed + 1.02, CAR.z - W / 2], wall);
        part(g, [length, 2.05, 0.05], [mid, CAR.bed + 1.02, CAR.z + W / 2], wall);
        part(g, [0.06, 2.05, W], [front, CAR.bed + 1.02, CAR.z], mat(tones.body));
        // The rear doors, swung open against the sides.
        for (const side of [-1, 1]) part(g, [0.05, 2.0, W / 2], [CAR.rearX - W / 4, CAR.bed + 1.0, CAR.z + side * (W / 2 + 0.03)], mat(tones.body)).rotation.y = Math.PI / 2;
        // The cab, in the driver's colour, with a windscreen.
        part(g, [CAB, 1.9, W], [front + CAB / 2 + 0.05, CAR.bed + 0.75, CAR.z], mat(tones.cab));
        part(g, [0.05, 0.75, W - 0.3], [front + CAB + 0.08, CAR.bed + 1.15, CAR.z], mat(new THREE.Color(0x9fc3d6), { roughness: 0.2 }));
        // Wheels just outside the body, below the bed, so none shows inside the hold.
        const radius = CAR.bed * 0.6;
        const wheel = new THREE.CylinderGeometry(radius, radius, 0.26, 14);
        const tyre = mat(new THREE.Color(0x222222));
        for (const x of [CAR.rearX + 0.9, front - 0.4, front + CAB - 0.4]) {
            for (const side of [-1, 1]) {
                const w = new THREE.Mesh(wheel, tyre);
                w.rotation.x = Math.PI / 2;
                w.position.set(x, radius, CAR.z + side * (W / 2 + 0.14));
                w.castShadow = true;
                g.add(w);
            }
        }
        return g;
    };

    const setHold = (next: Hold | null, text: string) => {
        if (body) {
            root.remove(body);
            free(body);
            body = null;
        }
        hold = next;
        label.visible = next !== null;
        if (!next) return;
        body = build(next.length);
        root.add(body);
        sign.textContent = text;
        label.position.set(CAR.rearX + next.length / 2, CAR.bed + 3, CAR.z);
    };

    /** Where a placed box's middle is in the world. */
    const worldOf = (p: Placed, target: THREE.Vector3) => {
        const front = CAR.rearX + (hold?.length ?? 0);
        return target.set(front - (p.x + p.l / 2), CAR.bed + p.y + p.h / 2, CAR.z - (hold?.width ?? 0) / 2 + p.z + p.w / 2);
    };

    const shade = (key: number) => new THREE.Color().setHSL(0.07 + ((key * 37) % 10) * 0.006, 0.5, 0.42 + ((key * 53) % 7) * 0.03);
    const place = (index: number, at: THREE.Vector3, size: THREE.Vector3) => {
        boxes!.setMatrixAt(index, matrix.compose(at, quaternion, size));
    };
    const setBoxes = (placed: Placed[], fresh: Placed[]) => {
        drops.splice(0);
        if (boxes) {
            root.remove(boxes);
            boxes.dispose();
            boxes = null;
        }
        if (placed.length === 0) return;
        boxes = new THREE.InstancedMesh(unitBox, boxMaterial, placed.length);
        boxes.castShadow = true;
        boxes.raycast = () => {};
        const freshSet = new Set(fresh);
        const now = performance.now();
        let falling = 0;
        placed.forEach((p, index) => {
            const at = worldOf(p, new THREE.Vector3());
            // A hair smaller than its slot, so neighbours read as separate cartons.
            const size = new THREE.Vector3(p.l * 0.96, p.h * 0.96, p.w * 0.96);
            boxes!.setColorAt(index, shade(p.key));
            if (freshSet.has(p) && !reducedMotion) {
                // Waiting its turn to fall: out of sight (no size) until it starts.
                drops.push({ index, at, size, start: now + falling++ * 40 });
                place(index, at, scratch.set(0, 0, 0));
            } else {
                place(index, at, size);
            }
        });
        boxes.instanceMatrix.needsUpdate = true;
        if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
        root.add(boxes);
    };

    const fall = new THREE.Vector3();
    const update = (now: number) => {
        if (!boxes || drops.length === 0) return;
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            if (now < d.start) continue;
            const k = Math.min(1, (now - d.start) / DROP_MS);
            place(d.index, fall.copy(d.at).setY(d.at.y + 0.8 * (1 - k * k)), d.size);
            if (k >= 1) drops.splice(i, 1);
        }
        boxes.instanceMatrix.needsUpdate = true;
    };

    return {
        setHold,
        setBoxes,
        footprint: () => (hold ? { minX: CAR.rearX, minZ: CAR.z - WIDTH_OUT / 2 - 0.3, maxX: CAR.rearX + hold.length + CAB + 0.2, maxZ: CAR.z + WIDTH_OUT / 2 + 0.3 } : null),
        update,
        dispose: () => {
            setHold(null, "");
            setBoxes([], []);
            unitBox.dispose();
            boxMaterial.dispose();
            scene.remove(root);
            sign.remove();
        },
    };
}
