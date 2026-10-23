import * as THREE from "three";
import { PLACES } from "../places";
import type { Station } from "./stations";

/**
 * The staff board on the office's west wall: a whiteboard that shows the
 * server's "board" station (BoardStations): each site's shifts for the next
 * three days and who holds its key, and each car's key. It is a picture drawn
 * on a canvas, repainted whenever the list changes; there is nothing to tap
 * (the Staff & keys desk takes the actions).
 */

const W = 1920;
const H = 960;
const COLUMNS = 3;

export interface OfficeBoard {
    set: (station: Station | null) => void;
    dispose: () => void;
}

export function createOfficeBoard(scene: THREE.Scene): OfficeBoard {
    const office = PLACES.find((p) => p.key === "office")!;
    const [ox, oz] = office.position;
    const west = ox - office.size[0] / 2;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const group = new THREE.Group();
    // The frame, then the board a hair in front of it, facing east into the room.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.3, 6.5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 }));
    frame.position.set(west + 0.14, 2.1, oz);
    frame.raycast = () => {};
    group.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.1), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(west + 0.21, 2.1, oz);
    face.rotation.y = Math.PI / 2;
    face.raycast = () => {};
    group.add(face);
    scene.add(group);

    const paint = (station: Station | null) => {
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f7f5ef";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#1f2a44";
        ctx.font = "900 64px system-ui, sans-serif";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText("STAFF BOARD", 48, 30);
        ctx.font = "600 28px system-ui, sans-serif";
        ctx.fillStyle = "#5b6475";
        ctx.fillText("Who works when, and who holds each key", 48, 104);
        ctx.fillStyle = "#c9c2b0";
        ctx.fillRect(48, 150, W - 96, 4);

        const items = station?.items ?? [];
        if (items.length === 0) {
            ctx.fillStyle = "#5b6475";
            ctx.font = "700 40px system-ui, sans-serif";
            ctx.fillText(station ? "No shifts or keys to show." : "Reading the board…", 48, 200);
            texture.needsUpdate = true;
            return;
        }

        const colW = (W - 96) / COLUMNS;
        // Items flow down each column in turn, as many lines as fit.
        let col = 0;
        let y = 176;
        const bottom = H - 30;
        const clip = (text: string, max: number) => {
            let t = text;
            while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -1);
            return t === text ? t : `${t.trimEnd()}…`;
        };
        for (const item of items) {
            const lines = (item.lines ?? []).slice(0, 12);
            const needed = 40 + 34 + lines.length * 30 + 24;
            if (y + needed > bottom && y > 176) {
                col += 1;
                y = 176;
            }
            if (col >= COLUMNS) break;
            const x = 48 + col * colW;
            const max = colW - 40;
            ctx.fillStyle = "#1f2a44";
            ctx.font = "800 36px system-ui, sans-serif";
            ctx.fillText(clip(item.title, max), x, y);
            y += 42;
            ctx.fillStyle = (item.chips ?? []).length > 0 ? "#b45309" : "#2563eb";
            ctx.font = "700 26px system-ui, sans-serif";
            if (item.subtitle) ctx.fillText(clip(item.subtitle, max), x, y);
            y += 34;
            ctx.font = "500 24px system-ui, sans-serif";
            for (const line of lines) {
                ctx.fillStyle = line.startsWith("—") ? "#5b6475" : "#1f2a44";
                if (line.startsWith("—")) ctx.font = "800 22px system-ui, sans-serif";
                ctx.fillText(clip(line, max), x, y);
                if (line.startsWith("—")) ctx.font = "500 24px system-ui, sans-serif";
                y += 30;
            }
            y += 24;
        }
        texture.needsUpdate = true;
    };
    paint(null);

    return {
        set: paint,
        dispose: () => {
            scene.remove(group);
            group.traverse((o) => {
                const mesh = o as THREE.Mesh;
                if (mesh.isMesh) {
                    mesh.geometry.dispose();
                    (mesh.material as THREE.Material).dispose();
                }
            });
            texture.dispose();
        },
    };
}
