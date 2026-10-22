import type { GuideApp } from "@/Components/Guide/chapters";
import type { FreightLoad } from "./freight";
import { RUN_STEPS, type RunJob } from "./handoff";
import type { LegJob, LegStep } from "./legs";
import type { PlayFeed } from "./playFeed";

/**
 * Who may play what, in one place (the brief's section 6). Everyone may
 * practise every job. Live is offered only where the viewer's own app has
 * the real route *and* the server says they may use it; the route's own
 * gate still decides on every call.
 *
 *   job                        Practice   Live
 *   Store Floor → Store Shelf  everyone   stock keeper who may shelve (StockPermissions::canShelve)
 *   Hub → Freight Car          everyone   stock keeper who works the origin hub's dock (ShipmentHandoffService::mayAct)
 *   Remote Hub → Store         everyone   later
 *   Courier & receiving steps  everyone   the stock keeper or delivery user the server lets take the step (ShipmentHandoffService::stepsFor)
 *
 * Sellers and admins have none of these routes on their apps, so they practise only.
 */

export function canShelveLive(app: GuideApp, feed: PlayFeed | null): boolean {
    return app === "stock_keeper" && feed?.store != null && feed.canShelve;
}

export function canLoadLive(app: GuideApp, load: FreightLoad | null | undefined): boolean {
    return app === "stock_keeper" && load?.canPick === true;
}

/** The app can post hand-off steps: the courier's on the delivery app, the dock's on the stock keeper, seller and admin apps. */
export const runApp = (app: GuideApp): boolean => app === "stock_keeper" || app === "delivery" || app === "seller" || app === "admin";

/** The hand-off step's route name on an app (the admin's sits under inventory). */
export const stepRouteName = (app: GuideApp): string => (app === "admin" ? "admin.inventory.shipments.step" : `${app}.shipments.step`);

/**
 * The route each transfer-leg step calls on an app, or null when that app has none:
 * a courier claims and hands over on the delivery app; keepers accept, dispatch, receive and cancel on the
 * stock keeper app (a seller accepts refills too); an admin rules from the admin app's transfers.
 */
export function legRoute(app: GuideApp, step: LegStep): { name: string; method: "post" | "patch" } | null {
    switch (step) {
        case "accept": return app === "stock_keeper" || app === "seller" ? { name: `${app}.refills.accept`, method: "post" } : null;
        case "claim": return app === "delivery" ? { name: "delivery.transfers.claim", method: "post" } : null;
        case "handover": return app === "delivery" ? { name: "delivery.transfers.handover", method: "post" } : null;
        case "dispatch":
        case "complete":
        case "cancel":
            if (app === "stock_keeper") return { name: `stock_keeper.transfers.${step}`, method: "post" };
            if (app === "admin") return { name: `admin.inventory.transfers.${step}`, method: "patch" };
            return null;
    }
}

/** May this viewer take at least one of the hand-off steps on this run for real? */
export function canRunLive(app: GuideApp, run: RunJob | null | undefined): boolean {
    return runApp(app) && run != null && run.steps.some((step) => (RUN_STEPS as string[]).includes(step));
}

/** May this viewer take at least one step on this transfer leg for real (the steps the server lists, on an app that has the route)? */
export function canLegLive(app: GuideApp, leg: LegJob | null | undefined): boolean {
    return leg != null && leg.steps.some((step) => legRoute(app, step as LegStep) !== null);
}

/** Does any desk offer this viewer an action? The server only lists actions on the viewer's own app, so each one is real. */
export const stationsLive = (feed: PlayFeed | null) => feed?.stations.some((station) => station.items.some((item) => item.actions.length > 0)) === true;

/** The Live switch shows to someone who may do at least one job for real. */
export function canGoLive(app: GuideApp, feed: PlayFeed | null): boolean {
    return canShelveLive(app, feed) || (feed?.store != null && (feed.loads.some((load) => canLoadLive(app, load)) || feed.runs.some((run) => canRunLive(app, run)) || feed.legs.some((leg) => canLegLive(app, leg))) || stationsLive(feed));
}
