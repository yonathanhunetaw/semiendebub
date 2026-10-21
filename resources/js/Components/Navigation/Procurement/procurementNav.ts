/**
 * The procurement app's sections, shared by the sidebar (lg and up) and the
 * phone top bar so the two never disagree.
 */
export interface ProcurementNavItem {
    key: string;
    label: string;
    /** Material Symbols ligature. */
    icon: string;
    /** Ziggy route name. */
    route: string;
    /** Path prefixes that mark this section active. */
    paths: string[];
    hint: string;
}

export const PROCUREMENT_NAV: ProcurementNavItem[] = [
    { key: "home", label: "Home", icon: "home", route: "procurement.dashboard", paths: ["/dashboard"], hint: "What waits on whom" },
    { key: "ideas", label: "Product ideas", icon: "lightbulb", route: "procurement.ideas.index", paths: ["/ideas"], hint: "What the stores want to sell" },
    { key: "orders", label: "Purchase orders", icon: "receipt_long", route: "procurement.purchase_orders.index", paths: ["/purchase-orders"], hint: "Raise, approve, place" },
    { key: "consignments", label: "Shipments in", icon: "sailing", route: "procurement.consignments.index", paths: ["/consignments", "/import-costs"], hint: "Goods on their way, and what they cost" },
    { key: "payables", label: "Payables", icon: "account_balance", route: "procurement.payables.index", paths: ["/payables"], hint: "What we owe, what is due" },
    { key: "suppliers", label: "Suppliers", icon: "storefront", route: "procurement.suppliers.index", paths: ["/suppliers"], hint: "The shops we buy from" },
    { key: "costs", label: "Costs & tariffs", icon: "calculate", route: "procurement.costs.index", paths: ["/costs", "/tariffs"], hint: "Rates, routes, import taxes" },
    { key: "calendar", label: "Calendar", icon: "calendar_month", route: "procurement.calendar", paths: ["/calendar"], hint: "Arrivals and supplier payments" },
];

export function activeProcurementItem(url: string): ProcurementNavItem | undefined {
    const path = url.split("?")[0];
    return PROCUREMENT_NAV.find((item) => item.paths.some((prefix) => path.startsWith(prefix)));
}
