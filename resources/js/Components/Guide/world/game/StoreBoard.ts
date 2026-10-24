import * as THREE from "three";
import { STORE, STORE_CORNER } from "../places";

/**
 * The notice board in the shop, on the back wall right of the racks: what
 * waits to be shelved, which shelf bins need stock, and which shipments are
 * still to load. A picture on a canvas, repainted whenever the lists change.
 */

export interface StoreBoardData {
    toShelve: string[];
    needs: string[];
    toLoad: string[];
}

const W = 1280;
const H = 720;

export interface StoreBoard {
    set: (data: StoreBoardData | null) => void;
    dispose: () => void;
}

export function createStoreBoard(scene: THREE.Scene): StoreBoard {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const group = new THREE.Group();
    const x = STORE_CORNER.ne[0] - 1.9;
    const z = STORE_CORNER.nw[1] + 0.06;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.75, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 }));
    frame.position.set(x, 2.0, z + 0.04);
    frame.raycast = () => {};
    group.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 1.6), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(x, 2.0, z + 0.09);
    face.raycast = () => {};
    group.add(face);
    scene.add(group);
    void STORE;

    const paint = (data: StoreBoardData | null) => {
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#f7f5ef";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#1f2a44";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = "900 54px system-ui, sans-serif";
        ctx.fillText("MAIN STORE · TODAY", 40, 26);
        ctx.fillStyle = "#c9c2b0";
        ctx.fillRect(40, 96, W - 80, 4);

        const clip = (text: string, max: number) => {
            let t = text;
            while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -1);
            return t === text ? t : `${t.trimEnd()}…`;
        };
        const columns: Array<[string, string[], string]> = [
            ["TO SHELVE", data?.toShelve ?? [], "Nothing waiting on the floor"],
            ["BINS NEEDING STOCK", data?.needs ?? [], "Every bin is stocked"],
            ["SHIPMENTS TO LOAD", data?.toLoad ?? [], "No shipment to load"],
        ];
        const colW = (W - 80) / 3;
        columns.forEach(([title, lines, empty], i) => {
            const cx = 40 + i * colW;
            ctx.fillStyle = "#b45309";
            ctx.font = "800 32px system-ui, sans-serif";
            ctx.fillText(title, cx, 120);
            ctx.font = "600 30px system-ui, sans-serif";
            let y = 170;
            if (data === null) {
                ctx.fillStyle = "#5b6475";
                ctx.fillText("Reading…", cx, y);
                return;
            }
            if (lines.length === 0) {
                ctx.fillStyle = "#5b6475";
                ctx.fillText(clip(empty, colW - 30), cx, y);
                return;
            }
            ctx.fillStyle = "#1f2a44";
            for (const line of lines.slice(0, 11)) {
                ctx.fillText(clip(`• ${line}`, colW - 30), cx, y);
                y += 44;
            }
            if (lines.length > 11) {
                ctx.fillStyle = "#5b6475";
                ctx.fillText(`+ ${lines.length - 11} more`, cx, y);
            }
        });
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
