import * as THREE from "three";
import { DESKS, type Desk } from "./zones";
import { isWorthShowing, visibleItems, waitingCount, type Station } from "./stations";

/**
 * What a desk says, written on it, so it can be read standing at the table
 * (or, in first person, zoomed in on): a sign on the front of the table with
 * the desk's name, and a screen on top with what its stations have waiting.
 * Both are pictures drawn on canvases and repainted whenever the list changes;
 * the screen is lit by nothing (MeshBasic), so it reads the same in any light.
 */

const SIGN = { w: 768, h: 192 };
const SCREEN = { w: 960, h: 600 };

interface DeskFace {
    desk: Desk;
    screen: THREE.CanvasTexture;
    screenCanvas: HTMLCanvasElement;
}

export interface DeskScreens {
    /** Repaint every screen from the stations the server listed for the viewer (null: not read yet). */
    set: (stations: Station[] | null, struck: ReadonlySet<string>) => void;
    dispose: () => void;
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
    let t = text;
    while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -1);
    return t === text ? t : `${t.trimEnd()}…`;
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

function paintSign(label: string): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = SIGN.w;
    canvas.height = SIGN.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#26334d";
    ctx.fillRect(0, 0, SIGN.w, SIGN.h);
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, SIGN.w - 20, SIGN.h - 20);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Shrink the name until it fits on one line.
    let size = 76;
    do {
        ctx.font = `900 ${size}px system-ui, sans-serif`;
        size -= 4;
    } while (ctx.measureText(label.toUpperCase()).width > SIGN.w - 60 && size > 24);
    ctx.fillText(label.toUpperCase(), SIGN.w / 2, SIGN.h / 2 + 4);
    return canvas;
}

function paintScreen(canvas: HTMLCanvasElement, desk: Desk, stations: Station[], struck: ReadonlySet<string>, loaded: boolean): void {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0f1a2e";
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    ctx.fillStyle = "#1f3a68";
    ctx.fillRect(0, 0, SCREEN.w, 84);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "900 48px system-ui, sans-serif";
    ctx.fillText(clip(ctx, desk.label, SCREEN.w - 60), 32, 44);

    let y = 118;
    const max = SCREEN.w - 64;
    const shown = stations.filter((s) => isWorthShowing(s, struck));

    if (!loaded) {
        ctx.fillStyle = "#9fb3d1";
        ctx.font = "600 38px system-ui, sans-serif";
        ctx.fillText("Reading the list…", 32, y + 20);
        return;
    }
    if (shown.length === 0) {
        ctx.fillStyle = "#9fb3d1";
        ctx.font = "600 38px system-ui, sans-serif";
        ctx.fillText("Nothing for you at this desk.", 32, y + 20);
        return;
    }

    ctx.textBaseline = "top";
    for (const station of shown) {
        if (y > SCREEN.h - 70) break;
        const waiting = waitingCount(station, struck);
        ctx.fillStyle = "#ffd166";
        ctx.font = "800 40px system-ui, sans-serif";
        const head = station.info ? station.label : `${station.label}: ${waiting === 0 ? "all clear" : `${waiting} waiting`}`;
        ctx.fillText(clip(ctx, head, max), 32, y);
        y += 52;
        ctx.fillStyle = "#dbe6f7";
        ctx.font = "600 32px system-ui, sans-serif";
        for (const stat of (station.stats ?? []).slice(0, 1)) {
            ctx.fillText(clip(ctx, (station.stats ?? []).map((s) => `${s.value} ${s.label}`).join("  ·  "), max), 32, y);
            y += 42;
            void stat;
        }
        for (const item of visibleItems(station, struck).slice(0, 4)) {
            if (y > SCREEN.h - 60) break;
            ctx.fillStyle = "#ffffff";
            ctx.font = "700 32px system-ui, sans-serif";
            ctx.fillText(`• ${clip(ctx, item.title, max - 30)}`, 32, y);
            y += 40;
            if (item.subtitle && y <= SCREEN.h - 60) {
                ctx.fillStyle = "#9fb3d1";
                ctx.font = "500 27px system-ui, sans-serif";
                ctx.fillText(clip(ctx, item.subtitle, max - 30), 62, y);
                y += 34;
            }
        }
        y += 16;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#6f86a8";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText("Stand at the table and press E to open it", 32, SCREEN.h - 22);
}

export function createDeskScreens(scene: THREE.Scene): DeskScreens {
    const group = new THREE.Group();
    const faces: DeskFace[] = [];
    const disposables: Array<{ dispose: () => void }> = [];

    for (const desk of DESKS) {
        if (!desk.table) continue;
        const [x0, z0, x1] = desk.rect;
        const cx = (x0 + x1) / 2;
        const tableWidth = Math.min(2.3, x1 - x0 - 0.3);
        const tableFront = z0 + 0.45 + 0.4;

        // The sign on the table's front: its name, in capitals.
        const signTexture = texture(paintSign(desk.label));
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(tableWidth * 0.86, (tableWidth * 0.86) * (SIGN.h / SIGN.w)), new THREE.MeshBasicMaterial({ map: signTexture }));
        sign.position.set(cx, desk.rise + 0.42, tableFront + 0.012);
        sign.raycast = () => {};
        group.add(sign);

        // The screen on top, leaning back a little towards whoever stands at the table.
        const screenCanvas = document.createElement("canvas");
        screenCanvas.width = SCREEN.w;
        screenCanvas.height = SCREEN.h;
        const screenTexture = texture(screenCanvas);
        const screenWidth = Math.min(1.5, tableWidth * 0.8);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenWidth * (SCREEN.h / SCREEN.w)), new THREE.MeshBasicMaterial({ map: screenTexture }));
        screen.position.set(cx, desk.rise + 0.86 + (screenWidth * (SCREEN.h / SCREEN.w)) / 2 + 0.03, z0 + 0.45 + 0.05);
        screen.rotation.x = -0.18;
        screen.raycast = () => {};
        group.add(screen);
        // Its stand.
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x2b3446 }));
        stand.position.set(cx, desk.rise + 0.91, z0 + 0.5);
        stand.raycast = () => {};
        group.add(stand);

        faces.push({ desk, screen: screenTexture, screenCanvas });
        disposables.push(signTexture, screenTexture);
    }
    scene.add(group);

    const set = (stations: Station[] | null, struck: ReadonlySet<string>) => {
        for (const face of faces) {
            paintScreen(face.screenCanvas, face.desk, (stations ?? []).filter((s) => s.desk === face.desk.key), struck, stations !== null);
            face.screen.needsUpdate = true;
        }
    };
    set(null, new Set());

    return {
        set,
        dispose: () => {
            scene.remove(group);
            group.traverse((o) => {
                const mesh = o as THREE.Mesh;
                if (mesh.isMesh) {
                    mesh.geometry.dispose();
                    (mesh.material as THREE.Material).dispose();
                }
            });
            disposables.forEach((d) => d.dispose());
        },
    };
}
