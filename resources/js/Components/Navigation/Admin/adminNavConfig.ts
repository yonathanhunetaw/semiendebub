/**
 * The admin sidebar, as data (adminNavConfig.ts; AdminNav.tsx is the top bar the other apps share).
 *
 * Two zones (see App\Services\Admin\ActiveStore):
 *   - store: follows the store dropdown at the top of the sidebar;
 *   - global: the catalogue, stores, warehouses, fleet and sessions, shown to
 *     global admins, and to a store admin for each `area` a global admin
 *     ticked on for them (App\Services\Admin\AdminAreas). The server 403s
 *     those routes too, so hiding a link is never the only guard.
 *
 * `roles` lists who sees an entry; it defaults to admins. A store manager is let
 * into the admin app for Approvals alone.
 */
import type { SvgIconComponent } from "@mui/icons-material";
import AccountTree from "@mui/icons-material/AccountTree";
import AirportShuttle from "@mui/icons-material/AirportShuttle";
import CalendarMonth from "@mui/icons-material/CalendarMonth";
import Dashboard from "@mui/icons-material/Dashboard";
import Draw from "@mui/icons-material/Draw";
import Layers from "@mui/icons-material/Layers";
import Lightbulb from "@mui/icons-material/Lightbulb";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Payments from "@mui/icons-material/Payments";
import PendingActions from "@mui/icons-material/PendingActions";
import People from "@mui/icons-material/People";
import Public from "@mui/icons-material/Public";
import PointOfSale from "@mui/icons-material/PointOfSale";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ShoppingCart from "@mui/icons-material/ShoppingCart";
import SpaceDashboard from "@mui/icons-material/SpaceDashboard";
import Store from "@mui/icons-material/Store";
import Storefront from "@mui/icons-material/Storefront";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import Tune from "@mui/icons-material/Tune";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import Warehouse from "@mui/icons-material/Warehouse";
import type { AdminNavCounts } from "@/types/adminScope";

export type AdminNavScope = "store" | "global";

export interface AdminNavItem {
    key: string;
    label: string;
    icon: SvgIconComponent;
    /** A Ziggy route name; resolved at render time. */
    route: string;
    /** Its query, e.g. the Guide's world view. */
    params?: Record<string, string>;
    scope: AdminNavScope;
    /** Path prefixes that light this entry up. */
    match: string[];
    /** Paths that must not light it up even when a prefix matches. */
    exclude?: string[];
    excludePattern?: RegExp;
    /** The Store entry: the active store's page, or the overview on "All stores". */
    storeSection?: boolean;
    /** Route names that only need to match exactly (e.g. the dashboard). */
    exact?: boolean;
    badge?: keyof AdminNavCounts;
    /** Who sees it; admins by default. */
    roles?: string[];
    /** Only a global admin (implied by scope "global"), or only a store admin. */
    requires?: "globalAdmin" | "storeAdmin";
    /** A global entry a store admin sees once this area is ticked on for them (AdminAreas). */
    area?: string;
    /** Lives on another subdomain: a full page load, not an Inertia visit. */
    external?: boolean;
    newTab?: boolean;
    children?: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavItem[] = [
    /*
     * The active store: its items, replenishment and price deviations, and the
     * inventory screens, as tabs (adminSections.ts). On "All stores" it opens
     * the cross-store inventory overview. A store manager lands on Approvals.
     */
    {
        key: "store",
        label: "Store",
        icon: Storefront,
        route: "store.hub",
        scope: "store",
        match: ["/inventory"],
        exclude: ["/inventory/stores", "/inventory/warehouse", "/inventory/fleet"],
        storeSection: true,
        roles: ["admin", "store_manager"],
    },
    { key: "dashboard", label: "Dashboard", icon: Dashboard, route: "admin.dashboard", scope: "store", match: ["/dashboard"], exact: true },
    { key: "carts", label: "Carts", icon: ShoppingCart, route: "admin.carts.index", scope: "store", match: ["/carts"], badge: "carts" },
    // Credit and customer prices/discounts are tabs of Customers (adminSections.ts).
    { key: "customers", label: "Customers", icon: People, route: "admin.customers.index", scope: "store", match: ["/customers", "/credit"], badge: "customers" },
    { key: "orders", label: "Orders", icon: PointOfSale, route: "admin.orders.index", scope: "store", match: ["/orders"], badge: "orders" },
    // Accounts and seller balances are tabs of Payments.
    { key: "payments", label: "Payments", icon: Payments, route: "admin.payments.index", scope: "store", match: ["/payments", "/payment-accounts", "/balances"] },
    { key: "deliveries", label: "Delivery", icon: LocalShipping, route: "admin.deliveries.index", scope: "store", match: ["/deliveries"], badge: "deliveries" },
    { key: "calendar", label: "Calendar", icon: CalendarMonth, route: "admin.calendar", scope: "store", match: ["/calendar"] },
    // My work: today (opening and closing), shifts, keys, leave, rides; site setup from there (Pages/Work/*).
    { key: "work", label: "My work", icon: BadgeRounded, route: "admin.work", scope: "store", match: ["/work"] },
    // Products the stores and procurement think we should sell (ProductIdeaService).
    { key: "ideas", label: "Product ideas", icon: Lightbulb, route: "admin.ideas.index", scope: "store", match: ["/ideas", "/price-checks", "/shops"] },
    { key: "purchase-orders", label: "Purchase Orders", icon: ReceiptLong, route: "admin.purchase_orders.index", scope: "global", match: ["/purchase-orders"], area: "purchase_orders" },
    // Freight, customs and port fees procurement recorded, waiting for a second person (ConsignmentService).
    { key: "import-costs", label: "Import Costs", icon: PendingActions, route: "admin.import_costs.index", scope: "global", match: ["/import-costs"], area: "import_costs" },
    { key: "supplier-payments", label: "Supplier Payments", icon: PendingActions, route: "admin.supplier_payments.index", scope: "global", match: ["/supplier-payments"], area: "supplier_payments" },
    // Fuel for staff rides, rent, salaries: a second person confirms each (ExpenseService).
    { key: "expenses", label: "Expenses", icon: ReceiptLong, route: "admin.expenses.index", scope: "global", match: ["/expenses"], area: "expenses" },
    { key: "canvas", label: "White Board", icon: Draw, route: "admin.canvas.index", scope: "store", match: ["/canvas"], external: true, newTab: true },
    // The Live Operations world: a store admin's store; a global admin has the whole business's in the global zone.
    { key: "world", label: "World", icon: Public, route: "admin.guide", params: { view: "world" }, scope: "store", match: [], requires: "storeAdmin" },
    { key: "items", label: "Items", icon: Layers, route: "admin.items.index", scope: "global", match: ["/items"], area: "items" },
    { key: "stores", label: "All stores", icon: Store, route: "admin.inventory.stores", scope: "global", match: ["/inventory/stores", "/stores"], excludePattern: /^\/stores\/\d+/, area: "stores" },
    { key: "warehouses", label: "Warehouses", icon: Warehouse, route: "admin.inventory.warehouse.index", scope: "global", match: ["/inventory/warehouse"], area: "warehouses" },
    { key: "fleet", label: "Fleet", icon: AirportShuttle, route: "admin.inventory.fleet.index", scope: "global", match: ["/inventory/fleet"], area: "fleet" },
    { key: "world-hq", label: "World: every site", icon: Public, route: "admin.guide", params: { view: "world" }, scope: "global", match: [] },
];


/** May this user see the entry? `areas` are the global-zone parts ticked on for a store admin. */
export function navItemVisible(item: AdminNavItem, roleKey: string, isGlobalAdmin: boolean, areas: string[] = []): boolean {
    if (item.requires === "storeAdmin" && isGlobalAdmin) {
        return false;
    }

    if ((item.scope === "global" || item.requires === "globalAdmin") && !isGlobalAdmin && !(item.area && areas.includes(item.area))) {
        return false;
    }


    return (item.roles ?? ["admin"]).includes(roleKey);
}

/** Does the current path light this entry up? */
export function navItemActive(item: AdminNavItem, path: string, activeStoreId: number | "all" = "all"): boolean {
    if (item.storeSection && /^\/stores\/\d+(\/|$)/.test(path)) {
        return true;
    }

    if (item.exclude?.some((prefix) => path.startsWith(prefix)) || item.excludePattern?.test(path)) {
        return false;
    }

    if (item.exact) {
        return item.match.includes(path);
    }

    return item.match.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

/** Resolve an entry's route name to a URL; a missing route never breaks the sidebar. */
export function navItemHref(item: AdminNavItem, activeStoreId: number | "all" = "all", roleKey = "admin"): string {
    try {
        if (item.storeSection) {
            if (roleKey !== "admin") return route("admin.inventory.replenishment.index");
            return activeStoreId === "all" ? route("inventory.index") : route(item.route, activeStoreId);
        }

        return route(item.route, item.params);
    } catch {
        return "#";
    }
}
