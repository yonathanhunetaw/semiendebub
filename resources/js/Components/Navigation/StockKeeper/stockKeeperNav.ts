/**
 * The stock keeper app's sections, shared by the bottom nav (phones and
 * tablets), the "More" sheet and the desktop sidebar so the three never
 * disagree.
 */
export interface SkNavItem {
    key: string;
    label: string;
    /** Material Symbols ligature. */
    icon: string;
    /** Ziggy route name. */
    route: string;
    /** Path prefixes that mark this section active. */
    paths: string[];
    /** One line under the label in the sidebar and the More sheet. */
    hint: string;
}

export interface SkNavGroup {
    label: string;
    items: SkNavItem[];
}

export const SK_NAV: SkNavGroup[] = [
    {
        label: "Overview",
        items: [
            { key: "home", label: "Home", icon: "home", route: "stock_keeper.dashboard", paths: ["/dashboard"], hint: "Today at a glance" },
            { key: "alerts", label: "Stock alerts", icon: "notification_important", route: "stock_keeper.alerts.index", paths: ["/stock-alerts"], hint: "Low and out of stock" },
            { key: "calendar", label: "Calendar", icon: "calendar_month", route: "stock_keeper.calendar", paths: ["/calendar"], hint: "Freight, transfers and arrivals by day" },
        ],
    },
    {
        label: "Stock",
        items: [
            { key: "stock", label: "Stock", icon: "inventory_2", route: "stock_keeper.inventory.index", paths: ["/inventory", "/items"], hint: "What is where, receive, adjust" },
            { key: "levels", label: "Levels", icon: "speed", route: "stock_keeper.levels.index", paths: ["/levels"], hint: "Full, low, crit low and volume" },
            { key: "floor", label: "Floor plan", icon: "grid_view", route: "stock_keeper.floor.index", paths: ["/floor"], hint: "Which area of the floor holds what" },
            { key: "stocktakes", label: "Stocktake", icon: "fact_check", route: "stock_keeper.stocktakes.index", paths: ["/stocktakes"], hint: "Count a place, approve the differences" },
            { key: "shelving", label: "Shelving", icon: "shelves", route: "stock_keeper.shelving.index", paths: ["/shelving"], hint: "Shelf refills to do" },
        ],
    },
    {
        label: "Movements",
        items: [
            { key: "shipments", label: "Shipments", icon: "local_shipping", route: "stock_keeper.shipments.index", paths: ["/shipments"], hint: "Hub runs: pick, send, receive" },
            { key: "receiving", label: "Receiving", icon: "move_to_inbox", route: "stock_keeper.receiving.index", paths: ["/receiving"], hint: "Short, damaged and over deliveries" },
            { key: "transfers", label: "Transfers", icon: "swap_horiz", route: "stock_keeper.transfers.index", paths: ["/transfers"], hint: "One item between places" },
            { key: "orders", label: "Orders", icon: "package_2", route: "stock_keeper.orders.index", paths: ["/orders"], hint: "Pick & pack for delivery" },
        ],
    },
];

export const SK_NAV_ITEMS: SkNavItem[] = SK_NAV.flatMap((group) => group.items);

/** The four tabs on the phone bar; everything else sits under "More". */
export const SK_BOTTOM_TABS = ["home", "stock", "levels", "shipments"] as const;

export function activeSkItem(url: string): SkNavItem | undefined {
    const path = url.split("?")[0];
    return SK_NAV_ITEMS.find((item) => item.paths.some((prefix) => path.startsWith(prefix)));
}
