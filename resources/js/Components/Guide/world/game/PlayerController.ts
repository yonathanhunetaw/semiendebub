import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { move, pushOut, type Box } from "./collision";
import { getGame, setGame, type GameView, type PlayerPose } from "./gameStore";
import { findPath, type Point } from "./pathfinding";
import { roomAt } from "../places";
import { WORKER_RADIUS, siteMap } from "./siteBlockers";

/**
 * The worker you play: their figure, the ways to walk them, and the camera
 * that trails them. Plain Three.js, driven from the world's own frame loop
 * (DukaWorld's `animate` calls update(dt) once a frame; this starts no loop).
 *
 * Walking:
 *   keys    W A S D or the arrows; run is on by default (the Run button, R); Shift does the opposite while held
 *   tap     a tap or click on the ground walks there, round the walls
 *           (pathfinding.ts), with a ring where they are going
 *   stick   on a touch screen in Follow, press and drag anywhere: a stick
 *           appears under the thumb; how far you drag is how fast they go
 *   pinch   two fingers zoom the follow camera; on a mouse, the wheel
 * Every step goes through collision.ts, so walls, racks and the counter stop
 * them and they slide along.
 *
 * Follow: the camera hangs behind and above the worker. It starts at a fixed
 * compass heading (from the south), so "up" is on screen up; drag (a mouse, or
 * a thumb on the right half of a touch screen) to swing it round the worker and
 * tilt it. First person: the camera is the worker's eyes (V, the HUD, or scroll
 * in as far as Follow goes); drag to look about, the wheel (or a pinch) zooms the
 * lens in to read a table, a rack or a board. Walking is always relative to where
 * the camera looks. Director: the world's orbit camera, free; drags turn it,
 * so there is no stick, but taps and keys still walk the worker.
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
    /** Start with the camera right behind the worker at this distance and tilt (radians), e.g. framing a door they face. */
    framing?: { distance: number; elevation: number };
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
    /** Does the follow camera (or the worker's eyes) own the camera right now (the world must not move it)? */
    ownsCamera: () => boolean;
    /** Are we looking through the worker's eyes? */
    isFirstPerson: () => boolean;
    dispose: () => void;
}

const WALK = 3.4;
const RUN = 7;
/** Follow camera: distance from the worker and how steeply it looks down. */
const PITCH = (55 * Math.PI) / 180;
const DISTANCE = { min: 2.5, start: 14, max: 32 };
/** First person: how high the eyes are, the lens (degrees) normally and at its closest, and how far up or down one can look. */
const EYE = 1.62;
const FOV = { third: 40, first: 72, min: 14 };
const LOOK_LIMIT = 1.35;
/** Follow camera's tilt limits (radians above the horizon) and how far one pixel of drag turns the view. */
const ELEVATION = { min: (12 * Math.PI) / 180, max: (82 * Math.PI) / 180 };
const LOOK_RATE = 0.0055;
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
    let distance = options.framing?.distance ?? DISTANCE.start;
    /** Where the camera hangs round the worker (follow) or looks (first person), radians; 0 is from the south, looking north. */
    // Framed: behind the worker, looking the way they face.
    let camYaw = options.framing ? options.spawn.yaw + Math.PI : 0;
    /** Follow: how steeply the camera looks down. First person: how far up the eyes look (down is negative). */
    let elevation = options.framing?.elevation ?? PITCH;
    let lookPitch = 0;
    let fov = FOV.first;
    let phase = 0;
    let speed = 0;
    const held = new Set<string>();
    let shiftHeld = false;
    /** Running now: the Run setting, turned the other way while Shift is held. */
    const fast = () => getGame().run !== shiftHeld;
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
        if (event.key === "Shift") shiftHeld = true;
        if (event.code === "KeyV" && !event.repeat && !event.metaKey && !event.ctrlKey && view !== "director") setGame({ view: view === "first" ? "follow" : "first" });
        if (event.code === "KeyR" && !event.repeat && !event.metaKey && !event.ctrlKey) setGame({ run: !getGame().run });
    };
    const onKeyUp = (event: KeyboardEvent) => {
        held.delete(event.code);
        if (event.key === "Shift") shiftHeld = false;
    };
    // Letting go of the window (alt-tab) must not leave a key held down.
    const onBlur = () => {
        held.clear();
        shiftHeld = false;
        stick = null;
        stickBase.classList.remove("is-on");
    };

    // Pointers: taps walk, a thumb's drag is the stick, two fingers pinch.
    const pointers = new Map<number, { x0: number; y0: number; x: number; y: number; t0: number; stick: boolean; look: boolean }>();
    let pinchFrom: { gap: number; distance: number } | null = null;
    const gapBetween = () => {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onPointerDown = (event: PointerEvent) => {
        pointers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, t0: performance.now(), stick: false, look: false });
        if (pointers.size === 2 && view !== "director") {
            pinchFrom = { gap: gapBetween(), distance: view === "first" ? fov : distance };
            stick = null;
            stickBase.classList.remove("is-on");
        }
    };
    const onPointerMove = (event: PointerEvent) => {
        const p = pointers.get(event.pointerId);
        if (!p) return;
        const lastX = p.x;
        const lastY = p.y;
        p.x = event.clientX;
        p.y = event.clientY;
        if (pinchFrom && pointers.size === 2) {
            // A pinch zooms: the follow camera's distance, or the first person's lens.
            const ratio = pinchFrom.gap / Math.max(1, gapBetween());
            if (view === "first") fov = THREE.MathUtils.clamp(pinchFrom.distance * ratio, FOV.min, FOV.first);
            else distance = THREE.MathUtils.clamp(pinchFrom.distance * ratio, DISTANCE.min, DISTANCE.max);
            return;
        }
        if (view === "director" || pointers.size !== 1) return;
        const box = overlay.getBoundingClientRect();
        // A mouse drag, or a thumb on the right of the screen, looks about; a thumb on the left is the stick (Follow and first person alike).
        const looks = event.pointerType !== "touch" || p.x0 - box.left > box.width * 0.5;
        if (looks) {
            if (!p.look && Math.hypot(p.x - p.x0, p.y - p.y0) < TAP_SLOP) return;
            p.look = true;
            stopWalkingTo();
            camYaw -= (p.x - lastX) * LOOK_RATE;
            if (view === "first") lookPitch = THREE.MathUtils.clamp(lookPitch - (p.y - lastY) * LOOK_RATE, -LOOK_LIMIT, LOOK_LIMIT);
            else elevation = THREE.MathUtils.clamp(elevation + (p.y - lastY) * LOOK_RATE, ELEVATION.min, ELEVATION.max);
            return;
        }
        const dx = p.x - p.x0;
        const dy = p.y - p.y0;
        if (!p.stick && Math.hypot(dx, dy) < DRAG) return;
        if (!p.stick) {
            p.stick = true;
            stopWalkingTo();
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
        if (p.look) return;
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
        if (view === "director") return;
        event.preventDefault();
        const k = Math.exp(event.deltaY * 0.001);
        if (view === "first") {
            // Scroll out past the normal lens and the camera steps back out behind the worker: one smooth zoom, as in Roblox.
            if (event.deltaY > 0 && fov >= FOV.first - 0.5) {
                distance = DISTANCE.min;
                setGame({ view: "follow" });
            } else fov = THREE.MathUtils.clamp(fov * k, FOV.min, FOV.first);
            return;
        }
        // Scroll in as far as the follow camera goes and the next notch is the worker's own eyes.
        if (event.deltaY < 0 && distance <= DISTANCE.min + 0.05) {
            fov = FOV.first;
            setGame({ view: "first" });
            return;
        }
        distance = THREE.MathUtils.clamp(distance * k, DISTANCE.min, DISTANCE.max);
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
        wantCamera.set(
            wantTarget.x + distance * Math.sin(camYaw) * Math.cos(elevation),
            wantTarget.y + distance * Math.sin(elevation),
            wantTarget.z + distance * Math.cos(camYaw) * Math.cos(elevation),
        );
        // Inside a room the camera comes inside too, over the worker, instead of looking at its walls from outside.
        const room = roomAt(root.position.x, root.position.z);
        if (room) {
            wantCamera.x = THREE.MathUtils.clamp(wantCamera.x, room[0] + 0.6, room[2] - 0.6);
            wantCamera.z = THREE.MathUtils.clamp(wantCamera.z, room[1] + 0.6, room[3] - 0.6);
        }
        controls.target.lerp(wantTarget, k);
        camera.position.lerp(wantCamera, k);
        camera.lookAt(controls.target);
    };

    /** First person: the camera is the worker's eyes, looking where the drag has turned it. */
    const placeEyes = () => {
        camera.position.set(root.position.x, EYE, root.position.z);
        camera.rotation.set(lookPitch, camYaw, 0, "YXZ");
        // For the browser tests, in a dev build only.
        if (import.meta.env.DEV) (window as unknown as { __dukaCamera?: unknown }).__dukaCamera = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camYaw, pitch: lookPitch, fov: camera.fov, near: camera.near };
        // The orbit target follows, so the roofs and walls (which read it) behave as for a camera standing here.
        controls.target.set(root.position.x - Math.sin(camYaw) * 2, EYE, root.position.z - Math.cos(camYaw) * 2);
    };

    const setView = (next: GameView) => {
        const was = view;
        view = next;
        controls.enabled = next === "director";
        // The eyes see from inside: a close lens, and the figure is not in the way.
        const first = next === "first";
        root.visible = !first;
        camera.near = first ? 0.08 : 0.5;
        camera.fov = first ? fov : FOV.third;
        camera.updateProjectionMatrix();
        if (was === "first" && next !== "first") {
            // Leaving the eyes: the camera hangs behind where they were looking.
            camera.rotation.set(0, 0, 0);
        }
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
            want = fast() ? RUN : WALK;
        } else if (stick && Math.hypot(stick.x, stick.y) > 0.15) {
            const push = Math.min(1, Math.hypot(stick.x, stick.y));
            heading.addScaledVector(right, stick.x).addScaledVector(forward, stick.y).normalize();
            // A full push always runs; with Run on, any firm push does.
            want = push > 0.95 ? RUN : (fast() ? RUN : WALK) * Math.min(1, push / 0.6);
        } else if (path.length > 0) {
            // Walking to a tap: head for the next corner; at the last one, arrive and stop.
            const [nx, nz] = path[0];
            const dx = nx - root.position.x;
            const dz = nz - root.position.z;
            const left = Math.hypot(dx, dz);
            // A corner counts as reached within one stride of it too: at a run (7 m/s) a slow frame steps 0.7 m, and a fixed 0.3 m
            // radius could be overshot every frame, circling the corner for ever.
            if (left < Math.max(path.length === 1 ? 0.08 : 0.3, speed * dt)) {
                path.shift();
                if (path.length === 0) goal.visible = false;
            } else {
                heading.set(dx / left, 0, dz / left);
                // Ease in to the last corner instead of overshooting it.
                want = (fast() ? RUN : WALK) * (path.length === 1 ? Math.min(1, left / 0.8 + 0.25) : 1);
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
        else if (view === "first") {
            placeEyes();
            // The zoom of the lens, eased.
            if (Math.abs(camera.fov - fov) > 0.05) {
                camera.fov += (fov - camera.fov) * catchUp(14, dt);
                camera.updateProjectionMatrix();
            }
            // The figure faces where the eyes look, so a step forward is a step the way they look.
            root.rotation.y = camYaw + Math.PI;
        }

        // One object, updated in place: nothing is made per frame.
        pose.x = root.position.x;
        pose.z = root.position.z;
        pose.yaw = root.rotation.y;
        options.onPose(pose);
    };

    const dispose = () => {
        // Leave the camera as the world expects it: the ordinary lens, and the worker (who is going) not hidden.
        camera.near = 0.5;
        camera.fov = FOV.third;
        camera.updateProjectionMatrix();
        root.visible = true;
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

    return { back, walkTo, setObstacles, setVest, update, setView, ownsCamera: () => view !== "director", isFirstPerson: () => view === "first", dispose };
}
