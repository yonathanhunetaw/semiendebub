import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { move, pushOut, type Box } from "./collision";
import type { GameView, PlayerPose } from "./gameStore";
import { findPath, type Point } from "./pathfinding";
import { WORKER_RADIUS, siteMap } from "./siteBlockers";

/**
 * The worker you play: their figure, the ways to walk them, and the camera
 * that trails them. Plain Three.js, driven from the world's own frame loop
 * (DukaWorld's `animate` calls update(dt) once a frame; this starts no loop).
 *
 * Walking:
 *   keys    W A S D or the arrows, Shift to hurry
 *   tap     a tap or click on the ground walks there, round the walls
 *           (pathfinding.ts), with a ring where they are going
 *   stick   on a touch screen in Follow, press and drag anywhere: a stick
 *           appears under the thumb; how far you drag is how fast they go
 *   pinch   two fingers zoom the follow camera; on a mouse, the wheel
 * Every step goes through collision.ts, so walls, racks and the counter stop
 * them and they slide along.
 *
 * Follow: the camera hangs behind and above the worker, at a fixed compass
 * heading (from the south), so "up" is always "up" on screen. Director: the
 * world's orbit camera, free; drags turn it, so there is no stick, but taps
 * and keys still walk the worker, relative to wherever the camera looks.
 */

export interface PlayerOptions {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dom: HTMLElement;
    /** Where the stick is drawn: the world's mount, over the canvas. */
    overlay: HTMLElement;
    /** The figure: DukaWorld's makePerson in the role's colour. */
    figure: THREE.Object3D;
    tone: THREE.Color;
    spawn: PlayerPose;
    /** Where the worker may walk, [minX, minZ, maxX, maxZ]. */
    bounds: [number, number, number, number];
    reducedMotion: boolean;
    view: GameView;
    /** Called every frame with where the worker stands. */
    onPose: (pose: PlayerPose) => void;
}

export interface Player {
    /** Where carried boxes hang: the worker's back, moving (and bobbing) with them. */
    back: THREE.Object3D;
    /** Walk to a point round the walls, as a tap on the ground does. */
    walkTo: (x: number, z: number) => void;
    /** Things that come and go in the way (the freight car): walked round from now on. */
    setObstacles: (boxes: Box[]) => void;
    /** The vest's colour, for the role the worker plays now; null is the keeper's hi-vis yellow. */
    setVest: (color: THREE.Color | null) => void;
    update: (dt: number) => void;
    setView: (view: GameView) => void;
    /** Does the follow camera own the camera right now (the world must not move it)? */
    ownsCamera: () => boolean;
    dispose: () => void;
}

const WALK = 3.2;
const RUN = 5.5;
/** Follow camera: distance from the worker and how steeply it looks down. */
const PITCH = (55 * Math.PI) / 180;
const DISTANCE = { min: 7, start: 14, max: 32 };
const LOOK_AHEAD = 1.5;
/** How quickly things catch up, per second: higher is snappier. */
const CAMERA_CATCH = 5;
const TURN_CATCH = 12;
/** The stick: how far the thumb drags for full speed, and how far before a press counts as a drag, in px. */
const STICK_REACH = 55;
const DRAG = 10;
/** A press that moves less than this (px) and lets go within this (ms) is a tap. */
const TAP_SLOP = 6;
const TAP_MS = 600;

const KEYS: Record<string, [number, number]> = {
    KeyW: [0, 1], ArrowUp: [0, 1],
    KeyS: [0, -1], ArrowDown: [0, -1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0],
};

/** A key typed into a field or a dialog is not a step. */
function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.closest("[role=dialog]") !== null;
}

/** Frame-rate independent easing: the share of the gap to close this frame. */
const catchUp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export function createPlayer(options: PlayerOptions): Player {
    const { scene, camera, controls, dom, overlay, tone, bounds, reducedMotion } = options;
    let { blockers, grid } = siteMap(bounds);

    // root: where they stand and which way they face. body: the bob and lean of walking.
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.add(options.figure);
    // A hi-vis band round the middle, and a ring at their feet to find them by.
    const HI_VIS = new THREE.Color(0xf5c400);
    const bandMaterial = new THREE.MeshStandardMaterial({ color: HI_VIS, emissive: HI_VIS.clone().multiplyScalar(0.45), roughness: 0.5, side: THREE.DoubleSide });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 16, 1, true), bandMaterial);
    band.position.y = 0.8;
    body.add(band);
    // The back faces -z (the worker faces +z): boxes stack up from just above the waist.
    const back = new THREE.Object3D();
    back.position.set(0, 0.75, -0.3);
    body.add(back);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    root.add(body, ring);
    // Never start inside something (a spawn point, or a pose saved before the walls were added).
    const [sx, sz] = pushOut(options.spawn.x, options.spawn.z, WORKER_RADIUS, blockers);
    root.position.set(sx, 0, sz);
    root.rotation.y = options.spawn.yaw;
    root.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh && o !== ring));
    scene.add(root);

    // Where a tap sent them: a pulsing ring on the ground.
    const goal = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.9, depthWrite: false }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.y = 0.04;
    goal.visible = false;
    scene.add(goal);

    // The stick, drawn over the canvas while a thumb holds it (styled by DukaWorld's .world-stick).
    const stickBase = document.createElement("div");
    stickBase.className = "world-stick";
    const stickKnob = document.createElement("div");
    stickKnob.className = "world-stick-knob";
    stickBase.appendChild(stickKnob);
    overlay.appendChild(stickBase);

    let view = options.view;
    let distance = DISTANCE.start;
    let phase = 0;
    let speed = 0;
    const held = new Set<string>();
    let running = false;
    /** The corners still to walk through after a tap; empty when not walking to one. */
    let path: Point[] = [];
    let stuckFor = 0;
    let replanned = false;
    /** The stick's push, -1..1 on each axis (x right, y forward), or null when not held. */
    let stick: { x: number; y: number } | null = null;

    // Reused every frame: no allocation in the loop.
    const pose: PlayerPose = { x: 0, z: 0, yaw: 0 };
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const heading = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const lead = new THREE.Vector3();
    const wantTarget = new THREE.Vector3();
    const wantCamera = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();

    const stopWalkingTo = () => {
        path = [];
        goal.visible = false;
    };
    const walkTo = (x: number, z: number) => {
        const found = findPath(grid, [root.position.x, root.position.z], [x, z]);
        if (!found || found.length === 0) {
            stopWalkingTo();
            return;
        }
        path = found;
        stuckFor = 0;
        replanned = false;
        const [gx, gz] = found[found.length - 1];
        goal.position.set(gx, 0.04, gz);
        goal.visible = true;
    };

    // Keys.
    const onKeyDown = (event: KeyboardEvent) => {
        if (typing(event.target)) return;
        if (event.code in KEYS) {
            event.preventDefault();
            held.add(event.code);
            stopWalkingTo();
        }
        if (event.key === "Shift") running = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
        held.delete(event.code);
        if (event.key === "Shift") running = false;
    };
    // Letting go of the window (alt-tab) must not leave a key held down.
    const onBlur = () => {
        held.clear();
        running = false;
        stick = null;
        stickBase.classList.remove("is-on");
    };

    // Pointers: taps walk, a thumb's drag is the stick, two fingers pinch.
    const pointers = new Map<number, { x0: number; y0: number; x: number; y: number; t0: number; stick: boolean }>();
    let pinchFrom: { gap: number; distance: number } | null = null;
    const gapBetween = () => {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onPointerDown = (event: PointerEvent) => {
        pointers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, t0: performance.now(), stick: false });
        if (pointers.size === 2 && view === "follow") {
            pinchFrom = { gap: gapBetween(), distance };
            stick = null;
            stickBase.classList.remove("is-on");
        }
    };
    const onPointerMove = (event: PointerEvent) => {
        const p = pointers.get(event.pointerId);
        if (!p) return;
        p.x = event.clientX;
        p.y = event.clientY;
        if (pinchFrom && pointers.size === 2) {
            distance = THREE.MathUtils.clamp(pinchFrom.distance * (pinchFrom.gap / Math.max(1, gapBetween())), DISTANCE.min, DISTANCE.max);
            return;
        }
        // Only a touch in Follow becomes the stick; a mouse drag (or Director) is left to the camera.
        if (event.pointerType !== "touch" || view !== "follow" || pointers.size !== 1) return;
        const dx = p.x - p.x0;
        const dy = p.y - p.y0;
        if (!p.stick && Math.hypot(dx, dy) < DRAG) return;
        if (!p.stick) {
            p.stick = true;
            stopWalkingTo();
            const box = overlay.getBoundingClientRect();
            stickBase.style.transform = `translate(${p.x0 - box.left}px, ${p.y0 - box.top}px)`;
            stickBase.classList.add("is-on");
        }
        const length = Math.hypot(dx, dy);
        const k = length > STICK_REACH ? STICK_REACH / length : 1;
        stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        stick = { x: (dx * k) / STICK_REACH, y: (-dy * k) / STICK_REACH };
    };
    const onPointerUp = (event: PointerEvent) => {
        const p = pointers.get(event.pointerId);
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchFrom = null;
        if (!p) return;
        if (p.stick) {
            stick = null;
            stickBase.classList.remove("is-on");
            return;
        }
        const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
        if (moved >= TAP_SLOP || performance.now() - p.t0 > TAP_MS || pointers.size > 0) return;
        // A tap: walk to where it touched the ground.
        const box = dom.getBoundingClientRect();
        ndc.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(groundPlane, hit)) walkTo(hit.x, hit.z);
    };
    const onPointerCancel = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        pinchFrom = null;
        stick = null;
        stickBase.classList.remove("is-on");
    };
    const onWheel = (event: WheelEvent) => {
        if (view !== "follow") return;
        event.preventDefault();
        distance = THREE.MathUtils.clamp(distance * Math.exp(event.deltaY * 0.001), DISTANCE.min, DISTANCE.max);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const placeCamera = (k: number) => {
        wantTarget.set(root.position.x, 1, root.position.z).add(ahead);
        wantCamera.set(wantTarget.x, wantTarget.y + distance * Math.sin(PITCH), wantTarget.z + distance * Math.cos(PITCH));
        controls.target.lerp(wantTarget, k);
        camera.position.lerp(wantCamera, k);
        camera.lookAt(controls.target);
    };

    const setView = (next: GameView) => {
        view = next;
        controls.enabled = next === "director";
        stick = null;
        stickBase.classList.remove("is-on");
        if (next === "director") {
            // Orbit round the worker, from where the camera already is.
            controls.target.set(root.position.x, 1, root.position.z);
            controls.update();
        }
    };
    setView(view);
    // Start right behind the worker, not flying in from wherever the world was looking.
    placeCamera(1);

    const update = (dt: number) => {
        // Keys and the stick are relative to where the camera looks, flattened onto the ground.
        camera.getWorldDirection(forward).setY(0);
        if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
        forward.normalize();
        right.crossVectors(forward, up);

        let ix = 0;
        let iz = 0;
        held.forEach((code) => {
            ix += KEYS[code][0];
            iz += KEYS[code][1];
        });
        let want = 0;
        heading.set(0, 0, 0);
        if (ix !== 0 || iz !== 0) {
            heading.addScaledVector(right, ix).addScaledVector(forward, iz).normalize();
            want = running ? RUN : WALK;
        } else if (stick && Math.hypot(stick.x, stick.y) > 0.15) {
            const push = Math.min(1, Math.hypot(stick.x, stick.y));
            heading.addScaledVector(right, stick.x).addScaledVector(forward, stick.y).normalize();
            want = push > 0.95 ? RUN : WALK * Math.min(1, push / 0.6);
        } else if (path.length > 0) {
            // Walking to a tap: head for the next corner; at the last one, arrive and stop.
            const [nx, nz] = path[0];
            const dx = nx - root.position.x;
            const dz = nz - root.position.z;
            const left = Math.hypot(dx, dz);
            if (left < (path.length === 1 ? 0.08 : 0.3)) {
                path.shift();
                if (path.length === 0) goal.visible = false;
            } else {
                heading.set(dx / left, 0, dz / left);
                // Ease in to the last corner instead of overshooting it.
                want = (running ? RUN : WALK) * (path.length === 1 ? Math.min(1, left / 0.8 + 0.25) : 1);
            }
        }

        const moving = want > 0;
        speed += (want - speed) * catchUp(10, dt);
        if (!moving && speed < 0.05) speed = 0;

        if (moving && speed > 0) {
            const fromX = root.position.x;
            const fromZ = root.position.z;
            let [x, z] = move(fromX, fromZ, heading.x * speed * dt, heading.z * speed * dt, WORKER_RADIUS, blockers);
            x = THREE.MathUtils.clamp(x, bounds[0], bounds[2]);
            z = THREE.MathUtils.clamp(z, bounds[1], bounds[3]);
            root.position.x = x;
            root.position.z = z;
            // Turn to face the way they walk, the short way round.
            const face = Math.atan2(heading.x, heading.z);
            const turn = Math.atan2(Math.sin(face - root.rotation.y), Math.cos(face - root.rotation.y));
            root.rotation.y += turn * catchUp(TURN_CATCH, dt);

            // Walking to a tap but pinned against something: plan again once, then give up.
            if (path.length > 0) {
                const progress = Math.hypot(x - fromX, z - fromZ);
                stuckFor = progress < speed * dt * 0.2 ? stuckFor + dt : 0;
                if (stuckFor > 0.5) {
                    if (replanned) {
                        stopWalkingTo();
                    } else {
                        const [gx, gz] = path[path.length - 1];
                        walkTo(gx, gz);
                        replanned = true;
                    }
                }
            }
        }

        // Bob and lean with the pace.
        const pace = speed / RUN;
        if (!reducedMotion) {
            phase += dt * (6 + speed * 2);
            body.position.y = pace > 0.05 ? Math.abs(Math.sin(phase)) * 0.07 * Math.min(1, pace * 2) : 0;
            body.rotation.x = 0.18 * pace;
            ring.scale.setScalar(1 + 0.06 * Math.sin(phase * 0.5));
            if (goal.visible) goal.scale.setScalar(1 + 0.2 * Math.sin(phase));
        }

        // The camera leads a little in the direction of travel.
        if (moving) ahead.lerp(lead.copy(heading).multiplyScalar(LOOK_AHEAD * Math.min(1, pace * 2)), catchUp(3, dt));
        else ahead.multiplyScalar(1 - catchUp(2, dt));

        if (view === "follow") placeCamera(reducedMotion ? 1 : catchUp(CAMERA_CATCH, dt));

        // One object, updated in place: nothing is made per frame.
        pose.x = root.position.x;
        pose.z = root.position.z;
        pose.yaw = root.rotation.y;
        options.onPose(pose);
    };

    const dispose = () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
        dom.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        dom.removeEventListener("wheel", onWheel);
        stickBase.remove();
        controls.enabled = true;
        scene.remove(root, goal);
        [root, goal].forEach((group) => group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.geometry.dispose();
            (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }));
    };

    const setObstacles = (boxes: Box[]) => {
        ({ blockers, grid } = siteMap(bounds, boxes));
        // Standing where the car now is: step out of it.
        const [x, z] = pushOut(root.position.x, root.position.z, WORKER_RADIUS, blockers);
        root.position.x = x;
        root.position.z = z;
        if (path.length > 0) walkTo(...path[path.length - 1]);
    };

    const setVest = (color: THREE.Color | null) => {
        bandMaterial.color.copy(color ?? HI_VIS);
        bandMaterial.emissive.copy(color ?? HI_VIS).multiplyScalar(0.45);
    };

    return { back, walkTo, setObstacles, setVest, update, setView, ownsCamera: () => view === "follow", dispose };
}
