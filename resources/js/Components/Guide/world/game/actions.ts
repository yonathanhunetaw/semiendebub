import { router } from "@inertiajs/react";
import type { FreightLoad } from "./freight";
import type { ShelveJob } from "./practice";

/**
 * Live: the only place Play writes. Each move calls the same route the real
 * screen's button calls, on the stock keeper app, so the same rules decide
 * and the same records are made. No game endpoint.
 *
 *   shelve        Shelving page, "Shelve"         stock_keeper.shelving.shelve
 *   start picking Shipment page, "Start picking"  stock_keeper.shipments.step  start_picking
 *   pick a line   Shipment page, ticking a line    stock_keeper.shipments.step  pick_line
 *   prepared      Shipment page, "Mark prepared"  stock_keeper.shipments.step  prepared
 *
 * It goes through Inertia's router with preserveState, so the Guide page and
 * its 3D world stay mounted while the redirect back comes in (proved by
 * e2e/stock/play.spec.ts: the same canvas before and after). How the answer
 * comes back:
 *
 *   flash.success, or no flash   done
 *   flash.error / errors         refused, with the server's reason
 *   403 / 419 / 500 / no answer  Inertia would open its error window over the
 *                                world; it is stopped here and reported as a
 *                                failure that changed nothing
 *
 * One call at a time: each is its own record.
 */

export type Answer = { ok: true; message: string } | { ok: false; message: string };

interface Flash {
    success?: string | null;
    error?: string | null;
}

/** POST through Inertia and settle on what came back. `forbidden` is said for a 403. */
function post(url: string, data: Record<string, string | number | boolean>, what: string, forbidden: string): Promise<Answer> {
    return new Promise((resolve) => {
        let settled = false;
        const done = (answer: Answer) => {
            if (settled) return;
            settled = true;
            stopInvalid();
            stopException();
            resolve(answer);
        };

        // Not an Inertia answer (403, 419, 500…): no error window over the world.
        const stopInvalid = router.on("invalid", (event) => {
            event.preventDefault();
            const status = event.detail.response.status;
            done({
                ok: false,
                message: status === 403
                    ? forbidden
                    : status === 419
                        ? "Your session ran out. Reload the page and try again; nothing was changed."
                        : `Something went wrong with ${what} (${status}); nothing was changed.`,
            });
        });
        const stopException = router.on("exception", (event) => {
            event.preventDefault();
            done({ ok: false, message: `Could not reach the server for ${what}; nothing was changed.` });
        });

        router.post(url, data, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: (page) => {
                const flash = (page.props as { flash?: Flash }).flash;
                if (flash?.error) done({ ok: false, message: flash.error });
                else done({ ok: true, message: flash?.success ?? `${what}: done.` });
            },
            onError: (errors) => done({ ok: false, message: Object.values(errors)[0] ?? `${what} was refused.` }),
            // Ended without any of the answers above (a cancelled visit): we cannot tell, so say so; the list is read again after.
            onFinish: () => done({ ok: false, message: `No answer for ${what}. The list is read again to show whether it went through.` }),
        });
    });
}

export function shelveLive(job: ShelveJob): Promise<Answer> {
    return post(route("stock_keeper.shelving.shelve", job.transferId), {}, job.reference,
        `You may not shelve ${job.reference}: only this shelf's managers and its stock keepers can.`);
}

export type LoadStep = "start_picking" | "pick_line" | "prepared";

/** One hand-off step on a shipment, as the Shipment page takes it (ShipmentHandoffService). */
export function shipmentStepLive(load: FreightLoad, step: LoadStep, payload: Record<string, string | number | boolean> = {}): Promise<Answer> {
    const hub = load.origin === "main_hub_a" ? "Main Hub A" : "Main Hub B";
    return post(route("stock_keeper.shipments.step", { shipment: load.shipmentId, step }), payload, load.reference,
        `You may not pick ${load.reference}: only the people who work ${hub}'s dock can.`);
}
