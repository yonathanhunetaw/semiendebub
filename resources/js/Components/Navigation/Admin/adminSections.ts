/**
 * Screens that share one sidebar entry and switch between each other with a
 * tab bar (AdminLayout renders it from the current path):
 *
 *   Payments   → payments, collection accounts, seller balances
 *   Customers  → customers, who has credit, customer prices & discounts
 *   Settings   → general, users and sessions (the last two global admins only)
 *   Store      → the active store's items, replenishment and price deviations,
 *                plus the inventory screens (locations, transfers, capacity,
 *                approvals, shipments). On "All stores" the first tab is the
 *                cross-store inventory overview and the per-store tabs hide.
 */
export interface AdminSectionTab {
    label: string;
    route: string;
    /** Path prefixes (or patterns) that select this tab. */
    match: Array<string | RegExp>;
    globalOnly?: boolean;
    /** The route takes the active store's id; hidden on "All stores". */
    storeParam?: boolean;
    /** Shown only on "All stores" (the cross-store stand-in for a store tab). */
    allStoresOnly?: boolean;
    /** Who sees it; every admin when unset. */
    roles?: string[];
}

export interface AdminSection {
    key: string;
    /** A heading above the tabs; `store` shows the active store's name. */
    title?: "store";
    tabs: AdminSectionTab[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
    {
        key: "payments",
        tabs: [
            { label: "Payments", route: "admin.payments.index", match: ["/payments"] },
            { label: "Accounts", route: "admin.payment-accounts.index", match: ["/payment-accounts"] },
            { label: "Seller balances", route: "admin.balances.index", match: ["/balances"] },
        ],
    },
    {
        key: "customers",
        tabs: [
            { label: "Customers", route: "admin.customers.index", match: ["/customers"] },
            { label: "Credit", route: "admin.credit.index", match: ["/credit"] },
            { label: "Prices & discounts", route: "admin.customers.discounts", match: ["/customers/discounts"] },
        ],
    },
    {
        key: "store",
        title: "store",
        tabs: [
            { label: "Items", route: "store.show", match: [/^\/stores\/\d+$/, /^\/stores\/\d+\/inventory\/items\//], storeParam: true },
            { label: "Overview", route: "inventory.index", match: [/^\/inventory$/], allStoresOnly: true },
            { label: "Replenish", route: "store.replenish", match: [/^\/stores\/\d+\/inventory\/replenish$/], storeParam: true },
            { label: "Price deviations", route: "store.deviations", match: [/^\/stores\/\d+\/inventory\/deviations$/], storeParam: true },
            { label: "Locations", route: "admin.inventory.stock-locations.index", match: ["/inventory/locations"] },
            { label: "Transfers", route: "admin.inventory.transfers", match: ["/inventory/transfers"] },
            { label: "Capacity", route: "admin.inventory.capacity.index", match: ["/inventory/capacity"] },
            { label: "Approvals", route: "admin.inventory.replenishment.index", match: ["/inventory/replenishment"], roles: ["admin", "store_manager"] },
            { label: "Shipments", route: "admin.inventory.shipments.index", match: ["/inventory/shipments"] },
        ],
    },
    {
        key: "settings",
        tabs: [
            { label: "General", route: "admin.settings", match: ["/settings"] },
            { label: "Users", route: "admin.users.index", match: ["/users"], globalOnly: true },
            { label: "Sessions", route: "admin.sessions.index", match: ["/sessions"], globalOnly: true },
        ],
    },
];

const matches = (prefix: string | RegExp, path: string): boolean =>
    typeof prefix === "string" ? path === prefix || path.startsWith(`${prefix}/`) : prefix.test(path);

/** A pattern outranks every prefix; longer prefixes outrank shorter ones. */
const weight = (prefix: string | RegExp): number => (typeof prefix === "string" ? prefix.length : 1000);

/** The tab whose prefix is the longest match, so /customers/discounts beats /customers. */
export function activeSectionTab(path: string): { section: AdminSection; tab: AdminSectionTab } | null {
    let best: { section: AdminSection; tab: AdminSectionTab; length: number } | null = null;

    for (const section of ADMIN_SECTIONS) {
        for (const tab of section.tabs) {
            for (const prefix of tab.match) {
                if (matches(prefix, path) && (best === null || weight(prefix) > best.length)) {
                    best = { section, tab, length: weight(prefix) };
                }
            }
        }
    }

    return best === null ? null : { section: best.section, tab: best.tab };
}

/** May this user see the tab in the current scope? */
export function sectionTabVisible(tab: AdminSectionTab, isGlobalAdmin: boolean, roleKey: string, activeStoreId: number | "all"): boolean {
    if (tab.globalOnly && !isGlobalAdmin) return false;
    if (tab.storeParam && activeStoreId === "all") return false;
    if (tab.allStoresOnly && activeStoreId !== "all") return false;

    return (tab.roles ?? ["admin"]).includes(roleKey);
}

/** The tab's URL in the current scope. */
export function sectionTabHref(tab: AdminSectionTab, activeStoreId: number | "all"): string {
    try {
        return tab.storeParam ? route(tab.route, activeStoreId) : route(tab.route);
    } catch {
        return "#";
    }
}
