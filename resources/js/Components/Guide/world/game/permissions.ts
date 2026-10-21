import type { GuideApp } from "@/Components/Guide/chapters";
import type { FreightLoad } from "./freight";
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
 *
 * Sellers and admins have none of these routes on their apps, so they practise only.
 */

export function canShelveLive(app: GuideApp, feed: PlayFeed | null): boolean {
    return app === "stock_keeper" && feed?.store != null && feed.canShelve;
}

export function canLoadLive(app: GuideApp, load: FreightLoad | null | undefined): boolean {
    return app === "stock_keeper" && load?.canPick === true;
}

/** The Live switch shows to someone who may do at least one job for real. */
export function canGoLive(app: GuideApp, feed: PlayFeed | null): boolean {
    return canShelveLive(app, feed) || (feed?.store != null && feed.loads.some((load) => canLoadLive(app, load)));
}
