import type { GuideApp } from "@/Components/Guide/chapters";
import type { IdentityKey } from "@/Components/Visual/identities";
import { DROP, PLACES } from "../places";
import type { PlayerPose } from "./gameStore";

/**
 * Where each app's worker starts, and whose colours they wear. A stock
 * keeper starts on the hub platform, a driver at the delivery bay, a seller
 * (and an admin) just outside the shop's front door. Yaw 0 faces south (+z),
 * PI faces north.
 */

const at = (key: string): [number, number] => PLACES.find((p) => p.key === key)!.position;

export function spawnFor(app: GuideApp): PlayerPose {
    switch (app) {
        case "stock_keeper": {
            const [x, z] = at("platform");
            return { x: x + 2.5, z: z + 2, yaw: 0 };
        }
        case "delivery": {
            const [x, z] = at("loading_bay");
            return { x: x - 2, z: z + 2, yaw: Math.PI };
        }
        default: {
            const [x, z] = DROP.store_floor!;
            return { x, z: z + 0.5, yaw: Math.PI };
        }
    }
}

/** Each app's worker wears that role's colours (the app keys are identity keys). */
export const roleFor = (app: GuideApp): IdentityKey => app;
