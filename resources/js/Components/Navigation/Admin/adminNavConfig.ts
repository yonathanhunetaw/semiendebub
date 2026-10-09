/**
 * The admin sidebar, as data (adminNavConfig.ts; AdminNav.tsx is the top bar the other apps share).
 *
 * Two zones (see App\Services\Admin\ActiveStore):
 *   - store: follows the store dropdown at the top of the sidebar;
 *   - global: the catalogue, stores, warehouses, fleet and sessions, shown to
 *     global admins only. The server 403s those routes for a store admin too,
 *     so hiding a link is never the only guard.
 *
 * `roles` lists who sees an entry; it defaults to admins. A store manager is let
 * into the admin app for Approvals alone.
 */
import type { SvgIconComponent } from "@mui/icons-material";
import AccountTree from "@mui/icons-material/AccountTree";
import AirportShuttle from "@mui/icons-material/AirportShuttle";
import Dashboard from "@mui/icons-material/Dashboard";
import Draw from "@mui/icons-material/Draw";
import Layers from "@mui/icons-material/Layers";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Payments from "@mui/icons-material/Payments";
import PendingActions from "@mui/icons-material/PendingActions";
import People from "@mui/icons-material/People";
import PointOfSale from "@mui/icons-material/PointOfSale";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ShoppingCart from "@mui/icons-material/ShoppingCart";
import SpaceDashboard from "@mui/icons-material/SpaceDashboard";
import Store from "@mui/icons-material/Store";
import Storefront from "@mui/icons-material/Storefront";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import Tune from "@mui/icons-material/Tune";
import Warehouse from "@mui/icons-material/Warehouse";
import type { AdminNavCounts } from "@/types/adminScope";

export type AdminNavScope = "store" | "global";

export interface AdminNavItem {
    key: string;
    label: string;
    icon: SvgIconComponent;
    /** A Ziggy route name; resolved at render time. */
    route: string;
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
    /** Only a global admin. Implied by scope "global". */
    requires?: "globalAdmin";
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
        route: "store.show",
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
    { key: "purchase-orders", label: "Purchase Orders", icon: ReceiptLong, route: "procurement.purchase_orders.index", scope: "store", match: [], external: true },
    { key: "canvas", label: "White Board", icon: Draw, route: "admin.canvas.index", scope: "store", match: ["/canvas"], external: true, newTab: true },
    { key: "items", label: "Items", icon: Layers, route: "admin.items.index", scope: "global", match: ["/items"] },
    { key: "stores", label: "All stores", icon: Store, route: "admin.inventory.stores", scope: "global", match: ["/inventory/stores", "/stores"], excludePattern: /^\/stores\/\d+/ },
    { key: "warehouses", label: "Warehouses", icon: Warehouse, route: "admin.inventory.warehouse.index", scope: "global", match: ["/inventory/warehouse"] },
    { key: "fleet", label: "Fleet", icon: AirportShuttle, route: "admin.inventory.fleet.index", scope: "global", match: ["/inventory/fleet"] },
];


/** May this user see the entry? */
export function navItemVisible(item: AdminNavItem, roleKey: string, isGlobalAdmin: boolean, activeStoreId: number | "all" = "all"): boolean {
    if ((item.scope === "global" || item.requires === "globalAdmin") && !isGlobalAdmin) {
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

        return route(item.route);
    } catch {
        return "#";
    }
}
