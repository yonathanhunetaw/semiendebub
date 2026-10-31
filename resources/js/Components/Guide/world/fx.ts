import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { identityFor } from "@/Components/Visual/identities";
import type { EventFx, EventPerson } from "./events";
import { animateAvatar, limbsOf, makeAvatar, type Limbs } from "./game/avatar";
import { STORE, STORE_CORNER, placeFor, type PlaceKey } from "./places";

/**
 * What the world acts out when an event is shown, so you see it happen rather than read it:
 *
 *   money      the notes fly from whoever pays to whoever takes (customer → seller, seller → manager)
 *   confirm    a green tick rises over the second person who checked it
 *   key        a key passes from one person to the next
 *   walk_in    someone walks in through the shop door to the counter (walk_out: the other way)
 *   boxes      cartons drop into place where stock arrives
 *   handover   a parcel goes from one person to the other (counter to customer, packer to courier)
 *
 * Each person in it stands there as a figure with their role over their head and their name at their feet. While the
 * event stays shown (paused on it) the act repeats, so it can be watched again.
 *
 * And the crew: who is clocked in at the shop at the moment shown, standing at their posts (sellers behind the
 * counter, the keeper on the floor, the manager at the counter's end), each with role and name.
 */

export interface EffectEvent {
    fx: EventFx;
    where: PlaceKey | null;
    actor?: EventPerson | null;
    target?: EventPerson | null;
    amount?: number;
}

export interface Effects {
    play: (event: EffectEvent | null, anchor: THREE.Vector3 | null) => void;
    setCrew: (crew: EventPerson[]) => void;
    /** Is something being shown inside the shop (its walls should fade)? */
    inShop: () => boolean;
    update: (time: number, dt: number) => void;
    dispose: () => void;
}

const LOOP = 3.2;
const ACT = 2.4;

/** The words over a figure's head: a driver is a "Driver", not "Delivery". */
export function roleLabel(role: string): string {
    if (role === "delivery") return "Driver";
    if (role === "supplier") return "Paid out";
    return identityFor(role).label;
}

const COUNTER = placeFor("store_counter").position;
const DOOR: [number, number] = [STORE_CORNER.sw[0] + STORE.door.at, STORE_CORNER.sw[1] + 0.6];
/** At the counter: the customer's side faces the door (south), the staff stand behind it. */
const CUSTOMER_SIDE: [number, number] = [COUNTER[0] + 0.5, COUNTER[1] + 1.25];
const STAFF_SIDE: [number, number] = [COUNTER[0] - 0.5, COUNTER[1] - 1.05];
const MANAGER_SIDE: [number, number] = [COUNTER[0] + 2.4, COUNTER[1] - 0.2];
const SHOP_PLACES: PlaceKey[] = ["store_counter", "store_floor", "store_shelf"];

/** The crew's posts in the shop, by role, in the order they fill. */
const POSTS: Record<string, Array<[number, number]>> = {
    seller: [[COUNTER[0] - 1.3, COUNTER[1] - 1.05], [COUNTER[0] - 0.2, COUNTER[1] - 1.05], [COUNTER[0] + 0.9, COUNTER[1] - 1.05]],
    store_manager: [[COUNTER[0] + 2.4, COUNTER[1] - 0.2]],
    stock_keeper: [[STORE_CORNER.nw[0] + 3.4, STORE_CORNER.nw[1] + 3.2], [STORE_CORNER.nw[0] + 5, STORE_CORNER.nw[1] + 2.4]],
    other: [[COUNTER[0] + 2.4, COUNTER[1] + 1], [COUNTER[0] - 2.6, COUNTER[1] + 1]],
};

interface Figure {
    group: THREE.Group;
    limbs: Limbs;
    role: HTMLDivElement;
    name: HTMLDivElement;
    person: EventPerson | null;
}

export function createEffects(scene: THREE.Scene, toneOf: (role: string) => THREE.Color, reducedMotion: boolean): Effects {
    const root = new THREE.Group();
    root.name = "event_effects";
    scene.add(root);

    // Figures are made once per tone and reused.
    const figure = (): Figure => {
        const group = makeAvatar(new THREE.Color(0x888888));
        const role = document.createElement("div");
        role.className = "world-badge world-badge--role";
        const roleTag = new CSS2DObject(role);
        roleTag.position.set(0, 2.15, 0);
        const name = document.createElement("div");
        name.className = "world-badge world-badge--person";
        const nameTag = new CSS2DObject(name);
        nameTag.position.set(0, -0.05, 0);
        group.add(roleTag, nameTag);
        group.visible = false;
        root.add(group);
        return { group, limbs: limbsOf(group), role, name, person: null };
    };
    const dress = (f: Figure, person: EventPerson) => {
        f.person = person;
        const tone = toneOf(person.role === "customer" ? "customer" : person.role);
        // The shirt and sleeves take the role's colour (the legs, head and eyes keep theirs).
        f.group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && (o.name === "torso" || o.parent?.name === "armL" || o.parent?.name === "armR")) (m.material as THREE.MeshStandardMaterial).color.copy(tone);
        });
        f.role.textContent = roleLabel(person.role);
        f.role.style.setProperty("--tone", `#${tone.getHexString()}`);
        f.name.style.setProperty("--tone", `#${tone.getHexString()}`);
        f.name.textContent = person.name;
    };
    // Each figure's materials are its own, so dressing one does not recolour another.
    const own = (f: Figure) => f.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = (m.material as THREE.Material).clone();
    });

    const actor = figure();
    const target = figure();
    own(actor);
    own(target);

    // The props.
    const billMaterial = new THREE.MeshStandardMaterial({ color: 0x2e9e5b, emissive: 0x0d3b20, roughness: 0.6, side: THREE.DoubleSide });
    const bills = Array.from({ length: 6 }, () => {
        const bill = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.2), billMaterial);
        bill.visible = false;
        root.add(bill);
        return bill;
    });
    const keyMesh = (() => {
        const gold = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.8, roughness: 0.25, emissive: 0x3a2c00 });
        const g = new THREE.Group();
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 18), gold);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), gold);
        blade.position.x = 0.24;
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), gold);
        bit.position.set(0.34, -0.06, 0);
        g.add(bow, blade, bit);
        g.scale.setScalar(1.6);
        g.visible = false;
        root.add(g);
        return g;
    })();
    const cartonMaterial = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.85, flatShading: true });
    const tapeMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.7 });
    const cartons = Array.from({ length: 6 }, () => {
        const c = new THREE.Group();
        c.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), cartonMaterial));
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.02, 0.14), tapeMaterial);
        tape.position.y = 0.26;
        c.add(tape);
        c.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
        c.visible = false;
        root.add(c);
        return c;
    });
    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.5), cartonMaterial);
    parcel.visible = false;
    root.add(parcel);
    const tick = (() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const g = canvas.getContext("2d")!;
        g.fillStyle = "#2e9e5b";
        g.beginPath();
        g.arc(64, 64, 60, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#fff";
        g.lineWidth = 16;
        g.lineCap = g.lineJoin = "round";
        g.beginPath();
        g.moveTo(34, 66);
        g.lineTo(56, 88);
        g.lineTo(96, 42);
        g.stroke();
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        sprite.scale.setScalar(0.8);
        sprite.visible = false;
        root.add(sprite);
        return sprite;
    })();
    // The amount, floating over the notes.
    const amountEl = document.createElement("div");
    amountEl.className = "world-badge world-badge--money";
    const amountTag = new CSS2DObject(amountEl);
    amountTag.visible = false;
    root.add(amountTag);

    // The crew: figures made as needed, kept.
    const crewFigures: Figure[] = [];
    let crew: EventPerson[] = [];

    let current: EffectEvent | null = null;
    let from = new THREE.Vector3();
    let to = new THREE.Vector3();
    let startedAt: number | null = null;
    let shownInShop = false;

    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    const face = (f: Figure, at: THREE.Vector3) => (f.group.rotation.y = Math.atan2(at.x - f.group.position.x, at.z - f.group.position.z));
    const hideProps = () => {
        bills.forEach((b) => (b.visible = false));
        cartons.forEach((c) => (c.visible = false));
        keyMesh.visible = parcel.visible = tick.visible = amountTag.visible = false;
    };
    /** An arc from a to b at u (0..1), hand height to hand height. */
    const arc = (a: THREE.Vector3, b: THREE.Vector3, u: number, out: THREE.Vector3, rise = 0.9) =>
        out.lerpVectors(a, b, u).setY(1.15 + Math.sin(Math.PI * u) * rise);

    const play: Effects["play"] = (event, anchor) => {
        current = event && event.fx ? event : null;
        startedAt = null;
        hideProps();
        actor.group.visible = target.group.visible = false;
        shownInShop = !!current && current.where !== null && SHOP_PLACES.includes(current.where);
        if (!current || !anchor) {
            current = null;
            return;
        }

        const atCounter = current.where === "store_counter";
        const staff = (p: EventPerson | null | undefined) => p && p.role !== "customer" && p.role !== "supplier";
        // Where the two stand.
        if (atCounter) {
            const actorIsCustomer = current.actor?.role === "customer";
            const targetIsCustomer = current.target?.role === "customer";
            from = actorIsCustomer ? v(...CUSTOMER_SIDE) : v(...STAFF_SIDE);
            to = targetIsCustomer ? v(...CUSTOMER_SIDE) : v(...STAFF_SIDE);
            // Two of the staff (a key, the day's cash): face to face in front of the counter, clear of the crew behind it.
            if (staff(current.actor) && staff(current.target)) {
                from = v(COUNTER[0] - 0.9, COUNTER[1] + 1.3);
                to = v(COUNTER[0] + 0.9, COUNTER[1] + 1.3);
            }
            if (current.target?.role === "supplier") to = v(DOOR[0], DOOR[1] - 1.2);
        } else {
            from = anchor.clone().add(v(-1.1, 0.4));
            to = anchor.clone().add(v(1.1, 0.4));
        }
        if (current.fx === "walk_in") {
            from = v(DOOR[0], DOOR[1] + 1.5);
            to = v(...STAFF_SIDE);
        } else if (current.fx === "walk_out") {
            from = v(...STAFF_SIDE);
            to = v(DOOR[0], DOOR[1] + 1.5);
        }

        if (current.actor) {
            dress(actor, current.actor);
            // Confirming: the second person where they stand (at the counter, the manager's end); with cartons, beside them.
            const standing = current.fx === "confirm"
                ? (atCounter ? (current.actor.role === "customer" ? v(...CUSTOMER_SIDE) : v(...MANAGER_SIDE)) : anchor.clone().add(v(-1.2, 0.8)))
                : current.fx === "boxes" ? anchor.clone().add(v(-1.8, 0.8)) : from;
            actor.group.position.copy(standing);
            actor.group.visible = true;
        }
        if (current.target && current.fx !== "walk_in" && current.fx !== "walk_out") {
            dress(target, current.target);
            target.group.position.copy(to);
            target.group.visible = true;
        }
        if (actor.group.visible && target.group.visible) {
            face(actor, target.group.position);
            face(target, actor.group.position);
        }
        if (current.amount && (current.fx === "money" || current.fx === "confirm")) {
            amountEl.textContent = `${Math.round(current.amount).toLocaleString()} birr`;
        }
        // The anchor for the drops and the tick.
        to = current.fx === "boxes" ? anchor.clone() : to;
    };

    const setCrew: Effects["setCrew"] = (people) => {
        crew = people;
        while (crewFigures.length < people.length) {
            const f = figure();
            own(f);
            crewFigures.push(f);
        }
        const used: Record<string, number> = {};
        crewFigures.forEach((f, i) => {
            const person = people[i];
            f.group.visible = !!person;
            if (!person) return;
            dress(f, person);
            const posts = POSTS[person.role] ?? POSTS.other;
            const post = person.role in POSTS ? person.role : "other";
            const n = used[post] = (used[post] ?? -1) + 1;
            const [x, z] = posts[n % posts.length];
            f.group.position.set(x + Math.floor(n / posts.length) * 0.7, 0.19, z);
            // Behind the counter they face the door; on the floor, the shelves.
            f.group.rotation.y = person.role === "stock_keeper" ? Math.PI : 0;
        });
    };

    const p = new THREE.Vector3();
    const update: Effects["update"] = (time, dt) => {
        // Someone acting in the event steps out of the crew while it plays (they are the figure acting it out).
        const acting = new Set([current?.actor?.name, current?.target?.name].filter(Boolean));
        crewFigures.forEach((f, i) => {
            if (!crew[i]) return;
            f.group.visible = !acting.has(crew[i].name);
            if (!reducedMotion) animateAvatar(f.limbs, 0, 0, 0, 0.2);
        });

        if (!current) return;
        if (startedAt === null) startedAt = time;
        const t = reducedMotion ? ACT : (time - startedAt) % LOOP;
        const u = Math.min(1, t / ACT);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        hideProps();

        switch (current.fx) {
            case "money": {
                bills.forEach((bill, i) => {
                    const k = THREE.MathUtils.clamp(ease * 1.4 - i * 0.08, 0, 1);
                    bill.visible = k > 0;
                    if (k < 1) {
                        arc(from, to, k, bill.position);
                        bill.rotation.set(0, k * 6 + i, Math.sin(k * 9 + i) * 0.4);
                    } else {
                        // Landed: a little stack in the taker's hands until the act starts again.
                        bill.position.set(to.x, 1.2 + i * 0.03, to.z + 0.25);
                        bill.rotation.set(0, i * 0.15, 0);
                    }
                });
                if (current.amount) {
                    amountTag.visible = true;
                    amountTag.position.copy(arc(from, to, 0.5, p)).setY(2.55);
                }
                break;
            }
            case "confirm": {
                tick.visible = true;
                const over = actor.group.visible ? actor.group.position : to;
                tick.position.set(over.x, 2.6 + ease * 0.6, over.z);
                tick.material.opacity = u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
                tick.scale.setScalar(0.5 + Math.min(1, u * 3) * 0.4);
                if (current.amount) {
                    amountTag.visible = true;
                    amountTag.position.set(over.x, 3.5, over.z);
                }
                break;
            }
            case "key":
                keyMesh.visible = true;
                arc(from, to, ease, keyMesh.position, 0.7);
                keyMesh.rotation.y = ease * Math.PI * 2;
                break;
            case "handover":
                parcel.visible = true;
                arc(from, to, ease, parcel.position, 0.5);
                break;
            case "boxes":
                cartons.forEach((c, i) => {
                    const k = THREE.MathUtils.clamp(u * 1.6 - i * 0.12, 0, 1);
                    c.visible = k > 0;
                    const col = i % 3;
                    const row = Math.floor(i / 3);
                    const land = 0.25 + (row > 0 && col === 1 ? 0.5 : 0);
                    c.position.set(to.x - 0.8 + col * 0.8, land + (1 - k * k) * 4, to.z + 0.2 + (row > 0 && col === 1 ? 0 : row * 0.8));
                });
                break;
            case "walk_in":
            case "walk_out": {
                actor.group.visible = true;
                actor.group.position.lerpVectors(from, to, ease);
                const dx = to.x - from.x;
                const dz = to.z - from.z;
                actor.group.rotation.y = Math.atan2(dx, dz);
                const moving = u < 1;
                animateAvatar(actor.limbs, time * 9, moving ? 0.5 : 0, 0, Math.min(1, dt * 12));
                break;
            }
        }
    };

    const dispose = () => {
        scene.remove(root);
        root.traverse((o) => {
            const m = o as THREE.Mesh & { element?: HTMLElement };
            m.element?.remove();
            if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
            m.geometry?.dispose();
            (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => {
                (x as THREE.MeshBasicMaterial).map?.dispose();
                x.dispose();
            });
        });
    };

    return { play, setCrew, inShop: () => shownInShop, update, dispose };
}
