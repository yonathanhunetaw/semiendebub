import { router } from "@inertiajs/react";
import type { VisitOptions } from "@inertiajs/core";
import type { FreightLoad } from "./freight";
import type { Count, RunJob, RunStep } from "./handoff";
import type { LegJob, LegStep } from "./legs";
import { legRoute, stepRouteName } from "./permissions";
import type { GuideApp } from "@/Components/Guide/chapters";
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
 *   courier steps Shipment page (delivery app)    delivery.shipments.step      courier_start … courier_arrive
 *   receiver      Shipment page, count + sign     stock_keeper.shipments.receipt, .step  receiver_check / receiver_sign
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
function post(url: string, data: Record<string, unknown>, what: string, forbidden: string, method: "post" | "put" | "patch" | "delete" = "post"): Promise<Answer> {
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

        const visit: VisitOptions = {
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
        };
        // A delete carries its data in the options; the others take it as the second argument.
        if (method === "delete") router.delete(url, { ...visit, data: data as Record<string, never> });
        else router[method](url, data as Record<string, never>, visit);
    });
}

export function shelveLive(job: ShelveJob): Promise<Answer> {
    return post(route("stock_keeper.shelving.shelve", job.transferId), {}, job.reference,
        `You may not shelve ${job.reference}: only this shelf's managers and its stock keepers can.`);
}

/** One of the courier's or the receiver's steps on a shipment, on the viewer's own app: the same ShipmentHandoffService. */
export function runStepLive(app: GuideApp, run: RunJob, step: RunStep, signature?: string): Promise<Answer> {
    return post(route(stepRouteName(app), { shipment: run.shipmentId, step }), signature ? { signature } : {}, run.reference,
        `You may not take this step on ${run.reference}: only the driver carrying it, or the people who work the receiving dock, can.`);
}

/** The receiver's count, saved before signing in (Receiving page: shipments.receipt). Stock keeper app only. */
export function runCountLive(run: RunJob, counts: Record<number, Count>): Promise<Answer> {
    const lines = run.lines.map((l) => ({ item_variant_id: l.variantId, received: counts[l.variantId]?.received ?? l.quantity, damaged: counts[l.variantId]?.damaged ?? 0 }));
    return post(route("stock_keeper.shipments.receipt", run.shipmentId), { lines }, run.reference, `You may not count ${run.reference}: only the people who work the receiving dock can.`);
}

/**
 * One step of a transfer leg, on the viewer's own app:
 *   accept    stock_keeper.refills.accept      claim     delivery.transfers.claim
 *   dispatch  stock_keeper.transfers.dispatch  handover  delivery.transfers.handover
 *   complete  stock_keeper.transfers.complete  (received, damaged)
 *   cancel    stock_keeper.transfers.cancel
 */
export function legStepLive(app: GuideApp, leg: LegJob, step: LegStep, count?: { received: number; damaged: number }): Promise<Answer> {
    const target = legRoute(app, step);
    if (!target) return Promise.resolve({ ok: false, message: `That step is not taken on your app: ${step === "claim" || step === "handover" ? "the courier does it on the delivery app" : "the keepers do it on the stock keeper app"}.` });
    return post(route(target.name, leg.id), step === "complete" && count ? count : {}, leg.reference,
        `You may not take this step on ${leg.reference}: it belongs to someone else on this transfer.`, target.method);
}

/** A station's action (stations.ts): the route the server named for the viewer, sent through the same visit as every other move. */
export function stationLive(method: "post" | "put" | "patch" | "delete", url: string, data: Record<string, unknown>, what: string): Promise<Answer> {
    return post(url, data, what, `You may not do that (${what}): the same permission that guards its own page refused it.`, method);
}

export type LoadStep = "start_picking" | "pick_line" | "prepared";

/** One hand-off step on a shipment, as the Shipment page takes it (ShipmentHandoffService). */
export function shipmentStepLive(load: FreightLoad, step: LoadStep, payload: Record<string, string | number | boolean> = {}): Promise<Answer> {
    const hub = load.origin === "main_hub_a" ? "Main Hub A" : "Main Hub B";
    return post(route("stock_keeper.shipments.step", { shipment: load.shipmentId, step }), payload, load.reference,
        `You may not pick ${load.reference}: only the people who work ${hub}'s dock can.`);
}

/**
 * The racks view: put a shelf bin on a slot of the racks ("f6c"), or lift it off (null). The admin and seller apps have the
 * route (the item page's own planogram permission decides): admin items.setup.spot, seller locations.bands.spot.
 */
export function placeBinLive(app: GuideApp, locationId: number, itemId: number, slot: string | null, name: string): Promise<Answer> {
    const url = app === "admin"
        ? route("admin.items.setup.spot", { item: itemId, location: locationId })
        : route("seller.locations.bands.spot", { location: locationId, item: itemId });

    return stationLive("put", url, { spot: slot }, name);
}
