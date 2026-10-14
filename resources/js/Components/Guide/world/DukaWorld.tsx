import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { identityFor } from "@/Components/Visual/identities";
import PlaceCard from "./PlaceCard";
import { COMPOUND, FLOWS, PLACES, STORE, placeFor, pointOf, type FlowKey, type Place, type PlaceKey } from "./places";

/**
 * How Duka works, to scale (one unit is one metre): the Main Hub compound far
 * to the west, the Main Store with its shelves and floor, the Remote Hub
 * behind it, the delivery bay and the customers (places.ts). Roads carry the
 * three flows, parcels travel them, and the people who work at each place
 * stand there. Drag to turn, scroll or pinch to zoom, tap a place to read
 * about it.
 *
 * Built once per colour mode; React state (the open place, the flows shown)
 * reaches the scene through the small `api` the build hands back. Everything
 * is disposed on unmount, so switching views does not leak WebGL contexts.
 * Motion stops under prefers-reduced-motion: parcels stand still and the
 * camera jumps instead of flying.
 */

interface SceneApi {
    select: (key: PlaceKey | null) => void;
    showFlows: (hidden: Set<FlowKey>) => void;
}

const HOME_TARGET = new THREE.Vector3(-4, 0, 2);
const HOME_CAMERA = new THREE.Vector3(-4, 78, 92);

export default function DukaWorld({ onOpenChapter }: { onOpenChapter: (key: string) => void }) {
    const theme = useTheme();
    const mountRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<SceneApi | null>(null);
    const [selected, setSelected] = useState<PlaceKey | null>(null);
    const [hidden, setHidden] = useState<Set<FlowKey>>(new Set());
    const [failed, setFailed] = useState(false);

    // Build the world. Rebuilt when the colour mode flips, since every
    // material takes its colour from the theme.
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const built = buildWorld(mount, theme, (key) => setSelected(key));
        if (!built) {
            setFailed(true);
            return;
        }
        apiRef.current = built.api;
        return () => {
            apiRef.current = null;
            built.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme.palette.mode]);

    useEffect(() => apiRef.current?.select(selected), [selected, theme.palette.mode]);
    useEffect(() => apiRef.current?.showFlows(hidden), [hidden, theme.palette.mode]);

    const toggleFlow = (key: FlowKey) =>
        setHidden((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const place = selected ? placeFor(selected) : null;

    if (failed) {
        return (
            <Paper elevation={0} sx={{ p: 4, borderRadius: 5, border: "1px solid", borderColor: "divider", textAlign: "center" }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>This device can't draw the 3D world.</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>Its browser has 3D graphics (WebGL) turned off. The step-by-step story tells the same thing.</Typography>
                <Button variant="contained" onClick={() => onOpenChapter("seller")} sx={{ borderRadius: 999, fontWeight: 800 }}>Open the story</Button>
            </Paper>
        );
    }

    return (
        <Box
            sx={{
                position: "relative",
                height: { xs: 520, md: 640 },
                borderRadius: 5,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                background: `linear-gradient(180deg, ${alpha(theme.palette.info.main, theme.palette.mode === "dark" ? 0.18 : 0.12)} 0%, ${theme.palette.background.default} 100%)`,
                touchAction: "none",
                // The HTML labels the scene draws over its places.
                "& .world-label": {
                    px: 1,
                    py: 0.25,
                    borderRadius: 999,
                    fontFamily: theme.typography.fontFamily,
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                    bgcolor: alpha(theme.palette.background.paper, 0.92),
                    color: "text.primary",
                    border: "2px solid",
                    borderColor: "var(--tone)",
                    boxShadow: 2,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    userSelect: "none",
                    transition: "transform .15s",
                    "&:hover, &.is-selected": { transform: "scale(1.08)", bgcolor: "var(--tone)", color: "common.white" },
                },
                // Scenery names (the store building, the hub compound): not clickable.
                "& .world-label--fixed": {
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    borderColor: "divider",
                    color: "text.secondary",
                    cursor: "default",
                    pointerEvents: "none",
                    "&:hover": { transform: "none", bgcolor: alpha(theme.palette.background.paper, 0.92), color: "text.secondary" },
                },
            }}
        >
            <Box ref={mountRef} sx={{ position: "absolute", inset: 0 }} />

            {/* Which flows are drawn */}
            <Paper elevation={0} sx={{ position: "absolute", top: 12, left: 12, p: 1, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, 0.9), maxWidth: { xs: "calc(100% - 24px)", sm: 360 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: "block", px: 0.5, mb: 0.5 }}>WHAT MOVES · tap to hide</Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {FLOWS.map((flow) => {
                        const on = !hidden.has(flow.key);
                        const tone = theme.palette[flow.color].main;
                        return (
                            <Chip key={flow.key} size="small" label={flow.label} title={flow.does} onClick={() => toggleFlow(flow.key)}
                                sx={{ fontWeight: 800, bgcolor: on ? tone : "transparent", color: on ? theme.palette[flow.color].contrastText : "text.secondary",
                                    border: "2px solid", borderColor: tone, "&:hover": { bgcolor: on ? tone : alpha(tone, 0.12) } }} />
                        );
                    })}
                </Stack>
            </Paper>

            {!place && (
                <Typography variant="caption" color="text.secondary"
                    sx={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", fontWeight: 700, pointerEvents: "none" }}>
                    Drag to turn · scroll or pinch to zoom · tap a place to see what happens there
                </Typography>
            )}

            {place && (
                <Box sx={{ position: "absolute", right: { xs: 12, sm: 16 }, left: { xs: 12, sm: "auto" }, top: { xs: "auto", sm: 16 }, bottom: { xs: 12, sm: "auto" }, display: "flex", flexDirection: "column", maxHeight: "calc(100% - 24px)" }}>
                    <PlaceCard place={place} onClose={() => setSelected(null)} onOpenChapter={onOpenChapter} />
                </Box>
            )}
        </Box>
    );
}


/* ------------------------------------------------------------------------ */
/* The scene                                                                 */
/* ------------------------------------------------------------------------ */

interface PlaceNode {
    place: Place;
    group: THREE.Group;
    pad: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    label: HTMLDivElement;
    tone: THREE.Color;
}

interface Traveller {
    mesh: THREE.Mesh;
    path: THREE.CurvePath<THREE.Vector3>;
    offset: number;
    speed: number;
}

/** Metres a parcel travels per second. */
const PARCEL_SPEED = 9;

function buildWorld(mount: HTMLDivElement, theme: Theme, onSelect: (key: PlaceKey | null) => void): { api: SceneApi; dispose: () => void } | null {
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
        console.warn("DukaWorld: WebGL unavailable.", error);
        return null;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dark = theme.palette.mode === "dark";
    const color = (value: string) => new THREE.Color(value);
    const toneOf = (key: string) => color(theme.palette[identityFor(key).color].main);

    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width, height);
    // The label layer covers the canvas; only the labels themselves take clicks.
    labels.domElement.style.position = "absolute";
    labels.domElement.style.inset = "0";
    labels.domElement.style.pointerEvents = "none";
    mount.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 600);
    camera.position.copy(HOME_CAMERA);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(HOME_TARGET);
    controls.minDistance = 12;
    controls.maxDistance = 220;
    controls.maxPolarAngle = 1.3;
    controls.screenSpacePanning = false;

    // Light: a soft sky, and a sun that throws shadows over the whole site.
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x202830 : 0xb9c4b0, dark ? 1.3 : 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.4 : 2.2);
    sun.position.set(-40, 80, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 50, bottom: -50, near: 1, far: 260 });
    scene.add(sun);

    // The ground.
    const groundTone = color(theme.palette.background.paper).lerp(color(theme.palette.success.main), dark ? 0.18 : 0.28);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(170, 1, 72), new THREE.MeshStandardMaterial({ color: groundTone, roughness: 1 }));
    ground.position.set(-4, -0.5, 2);
    ground.receiveShadow = true;
    scene.add(ground);

    const wallTone = color(theme.palette.background.paper).lerp(color(theme.palette.text.primary), dark ? 0.12 : 0.06);
    const padTone = color(theme.palette.background.paper).lerp(color(theme.palette.text.primary), 0.1);
    const darkTone = color(theme.palette.text.primary).lerp(wallTone, 0.4);

    // Fixed scenery: the hub compound and the store's shell.
    addCompound(scene, wallTone, darkTone, padTone);
    addStoreShell(scene, wallTone, toneOf("seller"), padTone);
    scene.add(fixedLabel(COMPOUND.label, COMPOUND.position[0], 3, COMPOUND.position[1] - COMPOUND.size[1] / 2));
    scene.add(fixedLabel(STORE.label, STORE.position[0], STORE.wall + 2.5, STORE.position[1] - STORE.size[1] / 2));

    // Places.
    const nodes = new Map<PlaceKey, PlaceNode>();
    const pickables: THREE.Object3D[] = [];
    const people: Array<{ mesh: THREE.Object3D; phase: number; base: number }> = [];

    for (const place of PLACES) {
        const tone = toneOf(place.roles[0]);
        const [w, d] = place.size;
        const group = new THREE.Group();
        group.position.set(place.position[0], 0, place.position[1]);

        // Its ground: a slab outside, a tinted patch of floor inside the store.
        const pad = new THREE.Mesh(new THREE.BoxGeometry(w + (place.indoor ? 0 : 2), 0.12, d + (place.indoor ? 0 : 2)), new THREE.MeshStandardMaterial({ color: padTone, roughness: 0.9 }));
        pad.position.y = place.indoor ? 0.13 : 0.06;
        pad.receiveShadow = true;
        group.add(pad);

        group.add(makeBuilding(place, tone, wallTone, darkTone));

        // The people who work here: inside the area if indoors, else at the front.
        place.roles.forEach((role, index) => {
            const person = makePerson(toneOf(role));
            const spread = (index - (place.roles.length - 1) / 2) * 1.2;
            const base = place.indoor ? 0.19 : 0.12;
            person.position.set(spread, base, place.indoor ? d / 2 - 1 : d / 2 + 2);
            group.add(person);
            people.push({ mesh: person, phase: Math.random() * Math.PI * 2, base });
        });

        group.traverse((object) => {
            object.userData.placeKey = place.key;
            if ((object as THREE.Mesh).isMesh) {
                object.castShadow = object !== pad;
                pickables.push(object);
            }
        });

        const label = document.createElement("div");
        label.className = "world-label";
        label.textContent = place.label;
        label.style.setProperty("--tone", `#${tone.getHexString()}`);
        label.addEventListener("pointerdown", (event) => event.stopPropagation());
        label.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelect(place.key);
        });
        const labelObject = new CSS2DObject(label);
        labelObject.position.set(0, labelHeight(place), 0);
        group.add(labelObject);

        scene.add(group);
        nodes.set(place.key, { place, group, pad, label, tone });
    }

    // Roads and the parcels travelling them, one group per flow.
    const flowGroups = new Map<FlowKey, THREE.Group>();
    const travellers: Traveller[] = [];

    FLOWS.forEach((flow, flowIndex) => {
        const group = new THREE.Group();
        const tone = color(theme.palette[flow.color].main);
        const lane = (flowIndex - (FLOWS.length - 1) / 2) * 0.8;
        const roadMaterial = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.6, transparent: true, opacity: 0.85 });
        const parcelMaterial = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.4, emissive: tone, emissiveIntensity: 0.25 });

        for (const waypoints of flow.paths) {
            const path = new THREE.CurvePath<THREE.Vector3>();

            for (let i = 0; i < waypoints.length - 1; i++) {
                const a = pointOf(waypoints[i]);
                const b = pointOf(waypoints[i + 1]);
                const start = new THREE.Vector3(a[0], 0, a[1]);
                const end = new THREE.Vector3(b[0], 0, b[1]);
                const across = new THREE.Vector3(-(end.z - start.z), 0, end.x - start.x).normalize();
                const shift = across.clone().multiplyScalar(lane);
                // Long roads bow a little; short hops inside the store stay straight.
                const bow = Math.min(4, start.distanceTo(end) * 0.06);
                const middle = start.clone().lerp(end, 0.5).add(across.clone().multiplyScalar(bow + lane)).setY(0.4);
                path.add(new THREE.QuadraticBezierCurve3(start.add(shift).setY(0.4), middle, end.add(shift).setY(0.4)));
            }

            const length = path.getLength();
            const road = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(32, Math.round(length * 1.5)), 0.22, 6, false), roadMaterial);
            road.receiveShadow = true;
            group.add(road);

            const count = Math.max(2, Math.round(length / 14));
            for (let i = 0; i < count; i++) {
                const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), parcelMaterial);
                parcel.castShadow = true;
                group.add(parcel);
                travellers.push({ mesh: parcel, path, offset: i / count, speed: PARCEL_SPEED / length });
            }
        }

        scene.add(group);
        flowGroups.set(flow.key, group);
    });

    const placeTravellers = (time: number) => {
        for (const t of travellers) {
            const along = reducedMotion ? t.offset : (t.offset + time * t.speed) % 1;
            const point = t.path.getPointAt(along);
            t.mesh.position.set(point.x, 0.85, point.z);
            const ahead = t.path.getPointAt(Math.min(0.999, along + 0.002));
            t.mesh.lookAt(ahead.x, 0.85, ahead.z);
        }
    };
    placeTravellers(0);

    // Picking: hover highlights a place, a tap (not a drag) opens it.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: PlaceKey | null = null;
    let selectedKey: PlaceKey | null = null;
    let downAt: { x: number; y: number } | null = null;

    const pick = (event: PointerEvent): PlaceKey | null => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        return (hit?.object.userData.placeKey as PlaceKey | undefined) ?? null;
    };

    const paint = () => {
        nodes.forEach((node, key) => {
            const isSelected = key === selectedKey;
            node.pad.material.color.copy(isSelected ? node.tone : key === hovered ? padTone.clone().lerp(node.tone, 0.35) : padTone);
            node.label.classList.toggle("is-selected", isSelected);
        });
        renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    };

    const onMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.buttons !== 0) return;
        const key = pick(event);
        if (key !== hovered) {
            hovered = key;
            paint();
        }
    };
    const onDown = (event: PointerEvent) => {
        downAt = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
        if (!downAt) return;
        const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
        downAt = null;
        if (moved < 6) onSelect(pick(event));
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Camera flights.
    let flight: { fromCam: THREE.Vector3; toCam: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number } | null = null;
    const flyTo = (target: THREE.Vector3, cam: THREE.Vector3) => {
        if (reducedMotion) {
            controls.target.copy(target);
            camera.position.copy(cam);
            return;
        }
        flight = { fromCam: camera.position.clone(), toCam: cam, fromTarget: controls.target.clone(), toTarget: target, start: performance.now() };
    };

    const api: SceneApi = {
        select: (key) => {
            if (key === selectedKey) return;
            selectedKey = key;
            paint();
            if (key) {
                const node = nodes.get(key)!;
                const at = node.group.position;
                const span = Math.max(...node.place.size, 8);
                flyTo(new THREE.Vector3(at.x, 0, at.z), new THREE.Vector3(at.x, span * 1.3 + 8, at.z + span * 1.5 + 10));
            } else {
                flyTo(HOME_TARGET.clone(), HOME_CAMERA.clone());
            }
        },
        showFlows: (hiddenFlows) => {
            flowGroups.forEach((group, key) => {
                group.visible = !hiddenFlows.has(key);
            });
        },
    };

    // Size follows the container, not the window.
    const resize = new ResizeObserver(() => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labels.setSize(width, height);
    });
    resize.observe(mount);

    // The loop.
    const startedAt = performance.now();
    let frame = 0;
    const animate = () => {
        frame = requestAnimationFrame(animate);
        const time = (performance.now() - startedAt) / 1000;

        if (flight) {
            const k = Math.min(1, (performance.now() - flight.start) / 900);
            const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            camera.position.lerpVectors(flight.fromCam, flight.toCam, eased);
            controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
            if (k >= 1) flight = null;
        }

        if (!reducedMotion) {
            placeTravellers(time);
            for (const p of people) p.mesh.position.y = p.base + Math.max(0, Math.sin(time * 3 + p.phase)) * 0.15;
        }

        controls.update();
        renderer.render(scene, camera);
        labels.render(scene, camera);
    };
    animate();

    const dispose = () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.dispose();

        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            geometries.add(mesh.geometry);
            (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());

        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        labels.domElement.remove();
    };

    return { api, dispose };
}

/* ------------------------------------------------------------------------ */
/* Scenery, buildings and people: boxes, cylinders and cones, in metres      */
/* ------------------------------------------------------------------------ */

function mesh(geometry: THREE.BufferGeometry, color: THREE.Color, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/** A plain label for scenery that can't be clicked (the compound, the store). */
function fixedLabel(text: string, x: number, y: number, z: number): CSS2DObject {
    const el = document.createElement("div");
    el.className = "world-label world-label--fixed";
    el.textContent = text;
    const object = new CSS2DObject(el);
    object.position.set(x, y, z);
    return object;
}

function labelHeight(place: Place): number {
    if (place.indoor) return 3.4;
    switch (place.shape) {
        case "hub": return (place.height ?? 6) + Math.min(place.size[0], place.size[1]) * 0.22 + 2;
        case "tower": return (place.height ?? 8) + 2;
        case "houses": return 5;
        default: return 5;
    }
}

/** A pitched roof whose ridge runs along x: a triangle extruded across the width. */
function roof(width: number, depth: number, rise: number, color: THREE.Color, y: number, x = 0, z = 0, ridgeAlongZ = false): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(depth / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2);
    const r = mesh(geometry, color, x, y, z);
    if (!ridgeAlongZ) r.rotation.y = Math.PI / 2;
    return r;
}

/** The fenced yard both Main Hubs stand in, with a gate on the east side. */
function addCompound(scene: THREE.Scene, wall: THREE.Color, dark: THREE.Color, yard: THREE.Color): void {
    const [cx, cz] = COMPOUND.position;
    const [w, d] = COMPOUND.size;
    const slab = mesh(new THREE.BoxGeometry(w, 0.08, d), yard.clone().lerp(dark, 0.15), cx, 0.04, cz);
    slab.castShadow = false;
    scene.add(slab);

    const post = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6);
    const railTone = dark.clone().lerp(wall, 0.3);
    const fence = (x1: number, z1: number, x2: number, z2: number) => {
        const length = Math.hypot(x2 - x1, z2 - z1);
        for (let s = 0; s <= length; s += 2.5) {
            const t = s / length;
            scene.add(mesh(post, railTone, x1 + (x2 - x1) * t, 0.9, z1 + (z2 - z1) * t));
        }
        const rail = mesh(new THREE.BoxGeometry(length, 0.08, 0.08), railTone, (x1 + x2) / 2, 1.6, (z1 + z2) / 2);
        rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        scene.add(rail);
    };
    const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
    const gate = 3;
    fence(x0, z0, x1, z0);
    fence(x0, z1, x1, z1);
    fence(x0, z0, x0, z1);
    fence(x1, z0, x1, cz - gate);
    fence(x1, cz + gate, x1, z1);
}

/** The Main Store's walls: no roof, so the shelves and floor inside show. Glass along the front. */
function addStoreShell(scene: THREE.Scene, wall: THREE.Color, tone: THREE.Color, floor: THREE.Color): void {
    const [cx, cz] = STORE.position;
    const [w, d] = STORE.size;
    const h = STORE.wall;
    const t = 0.3;

    scene.add(mesh(new THREE.BoxGeometry(w, 0.1, d), floor.clone().lerp(wall, 0.5), cx, 0.05, cz));
    scene.add(mesh(new THREE.BoxGeometry(w, h, t), wall, cx, h / 2, cz - d / 2));
    scene.add(mesh(new THREE.BoxGeometry(t, h, d), wall, cx - w / 2, h / 2, cz));
    scene.add(mesh(new THREE.BoxGeometry(t, h, d), wall, cx + w / 2, h / 2, cz));
    // Front: low wall, glass above it, a door in the middle, a coloured fascia.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.25 }));
    glass.position.set(cx, 0.8 + (h - 0.8) / 2, cz + d / 2);
    scene.add(glass);
    for (const side of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(w / 2 - 1.2, 0.8, t), wall, cx + side * (w / 4 + 0.6), 0.4, cz + d / 2));
    scene.add(mesh(new THREE.BoxGeometry(w + 0.4, 0.5, t + 0.1), tone, cx, h + 0.25, cz + d / 2));
}

function makeBuilding(place: Place, tone: THREE.Color, wall: THREE.Color, dark: THREE.Color): THREE.Group {
    const g = new THREE.Group();
    const [w, d] = place.size;
    const h = place.height ?? 4;
    const glass = new THREE.Color(0x9fc3d6);

    switch (place.shape) {
        case "hub": {
            g.add(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0));
            // The ridge runs along the longer side.
            const alongZ = d > w;
            g.add(roof(alongZ ? d + 0.4 : w + 0.4, alongZ ? w + 0.6 : d + 0.6, Math.min(w, d) * 0.22, tone, h, 0, 0, alongZ));
            // Roller doors on the side the roads leave from (+x for the hubs, +z for the Remote Hub).
            const doors = Math.max(1, Math.floor((place.position[0] < 0 ? d : w) / 5));
            for (let i = 0; i < doors; i++) {
                const offset = (i - (doors - 1) / 2) * 4.5;
                const door = place.position[0] < 0
                    ? mesh(new THREE.BoxGeometry(0.15, 3.2, 3), dark, w / 2 + 0.05, 1.6, offset)
                    : mesh(new THREE.BoxGeometry(3.2, 3.2, 0.15), dark, offset, 1.6, d / 2 + 0.05);
                g.add(door);
            }
            break;
        }
        case "shelves": {
            // Rows of shelving running across, goods on every level.
            const goods = [tone, tone.clone().lerp(wall, 0.4), dark.clone().lerp(tone, 0.5)];
            for (let row = 0; row < 3; row++) {
                const z = -d / 2 + 1.2 + row * 2.2;
                g.add(mesh(new THREE.BoxGeometry(w - 1, 1.9, 0.5), wall.clone().lerp(dark, 0.25), 0, 0.95 + 0.13, z));
                for (let level = 0; level < 3; level++) {
                    for (let slot = 0; slot < 5; slot++) {
                        g.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.45), goods[(row + level + slot) % goods.length],
                            -w / 2 + 1.1 + slot * ((w - 2.2) / 4), 0.45 + level * 0.6 + 0.13, z + 0.3));
                    }
                }
            }
            break;
        }
        case "floor": {
            // Pallets of cartons waiting to go on the shelf or out to customers.
            const carton = tone.clone().lerp(new THREE.Color(0x8b5a2b), 0.55);
            [[-1.5, -2], [1.5, -2], [-1.5, 1], [1.5, 1]].forEach(([x, z], i) => {
                g.add(mesh(new THREE.BoxGeometry(1.8, 0.15, 1.8), dark, x, 0.2, z));
                const layers = 1 + (i % 3);
                for (let y = 0; y < layers; y++) g.add(mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6), carton, x, 0.63 + y * 0.72, z));
            });
            break;
        }
        case "bay": {
            g.add(mesh(new THREE.BoxGeometry(w, 0.2, d), tone, 0, 4, 0));
            for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) g.add(mesh(new THREE.BoxGeometry(0.25, 4, 0.25), dark, x, 2, z));
            for (const z of [-1.8, 1.8]) {
                g.add(mesh(new THREE.BoxGeometry(4, 2.2, 2), wall, -0.6, 1.5, z));
                g.add(mesh(new THREE.BoxGeometry(1.4, 1.7, 1.9), tone, 2.1, 1.25, z));
                for (const x of [-1.9, 1.9]) for (const side of [-0.95, 0.95]) {
                    const wheel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), dark, x, 0.4, z + side);
                    wheel.rotation.x = Math.PI / 2;
                    g.add(wheel);
                }
            }
            break;
        }
        case "houses": {
            [[-3.5, -2], [0.5, 2], [3.8, -2.6]].forEach(([x, z], i) => {
                const hh = 3 + (i % 2);
                g.add(mesh(new THREE.BoxGeometry(3.2, hh, 3.2), wall, x, hh / 2, z));
                const top = mesh(new THREE.ConeGeometry(2.6, 1.8, 4), tone, x, hh + 0.9, z);
                top.rotation.y = Math.PI / 4;
                g.add(top);
            });
            break;
        }
        case "tower": {
            g.add(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0));
            g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), tone, 0, h + 0.2, 0));
            for (let y = 1.4; y < h - 0.5; y += 1.6) g.add(mesh(new THREE.BoxGeometry(w - 1, 0.7, 0.1), glass, 0, y, d / 2 + 0.03));
            break;
        }
    }

    return g;
}

function makePerson(tone: THREE.Color): THREE.Group {
    const person = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), tone, 0, 0.65, 0);
    const head = mesh(new THREE.SphereGeometry(0.25, 14, 10), new THREE.Color(0xb07a4b), 0, 1.45, 0);
    person.add(body, head);
    return person;
}
