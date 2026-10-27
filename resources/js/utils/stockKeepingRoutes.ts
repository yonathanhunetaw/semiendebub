/**
 * Stock keeping exists twice: `stock_keeper.*` on the stockkeeper app and
 * `seller.stock.*` inside the seller app, for a seller who is also a stock
 * keeper (routes/web/partials/stock-keeping.php). The stock keeper pages name
 * their links `stock_keeper.*`; inside the seller app this wraps Ziggy's global
 * `route()` so the same names resolve to the seller app's copy and the person
 * never leaves the app they are in.
 */
const STOCK_KEEPER = "stock_keeper.";
const SELLER_COPY = "seller.stock.";

/** True on the seller app, where the stock keeping area is mounted under /stock. */
export const onSellerHost = (): boolean => typeof window !== "undefined" && window.location.hostname.startsWith("seller.");

/**
 * True on a page of the stock keeping area inside the seller app. Only there do
 * `stock_keeper.*` names mean the seller app's copy: the seller app's other
 * pages (the Guide world, for one) use those names for the stock keeper app's
 * own routes and must keep them.
 */
export const inSellerStockArea = (): boolean => onSellerHost() && /^\/stock(\/|$)/.test(window.location.pathname);

export function installStockKeepingRoutes(): void {
    const original = window.route as unknown as ((...args: unknown[]) => unknown) & { __stockKeeping?: boolean };

    if (typeof original !== "function" || original.__stockKeeping) {
        return;
    }

    const wrapped = function (name?: unknown, ...rest: unknown[]) {
        if (typeof name === "string" && name.startsWith(STOCK_KEEPER) && inSellerStockArea()) {
            try {
                // Ziggy throws for a name it does not know, so a screen that exists only in the
                // stock keeper app (the guide, the calendar) falls through to its own name below.
                return original(SELLER_COPY + name.slice(STOCK_KEEPER.length), ...rest);
            } catch {
                // fall through
            }
        }

        return original(name, ...rest);
    } as typeof original;

    Object.assign(wrapped, original);
    wrapped.__stockKeeping = true;
    window.route = wrapped as unknown as typeof window.route;
}
