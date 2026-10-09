import type { GuideApp } from "./chapters";

/**
 * Which guide step explains the page you are on, per app. The first pattern
 * that matches the path wins, so specific paths come before their parents.
 * Used by GuideButton.
 */
type StepRef = [RegExp, string, string];

const MAP: Record<GuideApp, StepRef[]> = {
    admin: [
        [/^\/stores\/\d+\/inventory\/replenish/, "moving", "tr-raise"],
        [/^\/stores\/\d+/, "admin", "prices"],
        [/^\/(inventory\/)?stores/, "admin", "store"],
        [/^\/inventory\/locations/, "moving", "sh-list"],
        [/^\/inventory\/transfers/, "moving", "tr-hand"],
        [/^\/inventory\/capacity/, "admin", "capacity"],
        [/^\/inventory\/replenishment/, "moving", "tr-raise"],
        [/^\/inventory\/(shipments|warehouse)/, "moving", "ship-build"],
        [/^\/inventory\/fleet/, "delivery", "freight"],
        [/^\/inventory/, "admin", "store"],
        [/^\/carts/, "seller", "cart"],
        [/^\/customers\/discounts/, "admin", "prices"],
        [/^\/credit/, "seller", "checkout"],
        [/^\/customers/, "seller", "cart"],
        [/^\/orders/, "seller", "checkout"],
        [/^\/payment-accounts/, "admin", "money"],
        [/^\/balances/, "seller", "balance"],
        [/^\/payments/, "seller", "confirm"],
        [/^\/deliveries/, "delivery", "claim"],
        [/^\/items/, "admin", "catalogue"],
        [/^\/(users|sessions)/, "admin", "people"],
        [/^\/settings/, "admin", "store"],
        [/^\/dashboard/, "admin", "dashboard"],
    ],
    seller: [
        [/^\/items\/\d+/, "seller", "variant"],
        [/^\/(items|categories|menu)/, "seller", "catalogue"],
        [/^\/carts\/create/, "seller", "cart"],
        [/^\/carts/, "seller", "add"],
        [/^\/orders/, "seller", "checkout"],
        [/^\/payments/, "seller", "confirm"],
        [/^\/balance/, "seller", "balance"],
        [/^\/customers/, "seller", "cart"],
        [/^\/refills/, "stock_keeper", "alerts"],
        [/^\/shipments/, "moving", "ship-agree"],
    ],
    stock_keeper: [
        [/^\/shipments/, "stock_keeper", "receive"],
        [/^\/shelving/, "stock_keeper", "shelve"],
        [/^\/stock-alerts/, "stock_keeper", "alerts"],
        [/^\/orders/, "stock_keeper", "pack"],
        [/^\/transfers/, "stock_keeper", "send"],
        [/^\/inventory/, "stock_keeper", "count"],
    ],
    delivery: [
        [/^\/delivery/, "delivery", "claim"],
        [/^\/history/, "delivery", "deliver"],
        [/^\/shipments/, "delivery", "freight"],
        [/^\/transfers/, "moving", "tr-road"],
        [/^\/dashboard/, "delivery", "runs"],
    ],
};

/** The guide URL for this page, or the app's own chapter when no step fits. */
export function guideHrefFor(app: GuideApp, path: string): string {
    const hit = MAP[app].find(([pattern]) => pattern.test(path));
    try {
        return route(`${app}.guide`, hit ? { chapter: hit[1], step: hit[2] } : {});
    } catch {
        return "/guide";
    }
}
