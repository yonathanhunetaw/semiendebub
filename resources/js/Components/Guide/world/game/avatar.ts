import * as THREE from "three";

/**
 * The worker you play, built blocky in Roblox's proportions: legs, a torso, arms and a head, about 1.7 m tall
 * like the other figures. Arms and legs hang from pivots at the shoulders and hips (named, below), so the
 * player can swing them as they walk and raise the arms in a jump (`animateAvatar`).
 */
export const LIMBS = ["armL", "armR", "legL", "legR"] as const;

const SKIN = 0xb07a4b;
const TROUSERS = 0x2f3a4a;

function block(w: number, h: number, d: number, color: THREE.ColorRepresentation, y: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    mesh.position.y = y;
    return mesh;
}

/** A limb hanging from a pivot at (x, y): the pivot is what turns. */
function limb(name: string, x: number, y: number, w: number, h: number, d: number, color: THREE.ColorRepresentation): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    pivot.add(block(w, h, d, color, -h / 2));
    return pivot;
}

export function makeAvatar(tone: THREE.Color): THREE.Group {
    const avatar = new THREE.Group();
    avatar.add(
        limb("legL", -0.115, 0.8, 0.21, 0.78, 0.24, TROUSERS),
        limb("legR", 0.115, 0.8, 0.21, 0.78, 0.24, TROUSERS),
        Object.assign(block(0.48, 0.62, 0.26, tone, 1.11), { name: "torso" }),
        limb("armL", -0.33, 1.4, 0.17, 0.62, 0.2, tone),
        limb("armR", 0.33, 1.4, 0.17, 0.62, 0.2, tone),
    );
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 18), new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }));
    head.position.y = 1.58;
    avatar.add(head);
    // A face, so you can tell which way they look: two eyes on the front (+z).
    const eye = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
    for (const x of [-0.06, 0.06]) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eye);
        dot.position.set(x, 1.61, 0.155);
        avatar.add(dot);
    }
    return avatar;
}

export type Limbs = Partial<Record<(typeof LIMBS)[number], THREE.Object3D>>;

export function limbsOf(figure: THREE.Object3D): Limbs {
    const out: Limbs = {};
    for (const name of LIMBS) {
        const part = figure.getObjectByName(name);
        if (part) out[name] = part;
    }
    return out;
}

/**
 * One frame of the walk: `phase` is the step clock, `pace` 0 (still) .. 1 (running), `air` 0 (on the ground) .. 1 (up).
 * Arms swing against the legs; in the air the arms go up and the legs part, as a Roblox character jumps.
 * Eased toward the wanted pose (`k` 0..1), so starting, stopping and landing do not snap.
 */
export function animateAvatar(limbs: Limbs, phase: number, pace: number, air: number, k: number): void {
    const swing = Math.sin(phase) * 0.75 * Math.min(1, pace * 1.6) * (1 - air);
    // A negative turn about x brings a hanging limb forward (+z, the way they face); -2.5 rad is up and a little ahead.
    const up = air * 2.5;
    const ease = (part: THREE.Object3D | undefined, to: number, spread = 0) => {
        if (!part) return;
        part.rotation.x += (to - part.rotation.x) * k;
        part.rotation.z += (spread - part.rotation.z) * k;
    };
    ease(limbs.armL, -swing - up, -0.15 * air);
    ease(limbs.armR, swing - up, 0.15 * air);
    ease(limbs.legL, swing - air * 0.3);
    ease(limbs.legR, -swing + air * 0.15);
}
