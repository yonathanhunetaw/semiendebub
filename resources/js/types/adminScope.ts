/**
 * The admin app's store scope, shared on every admin page by
 * HandleInertiaRequests (see App\Services\Admin\ActiveStore).
 */

export type ActiveStoreId = number | "all";

export interface ActiveStoreRef {
    id: ActiveStoreId;
    name: string;
}

export interface AccessibleStore {
    id: number;
    name: string;
    /** retail | central_warehouse | remote_warehouse */
    type: string;
}

export interface AdminNavCounts {
    carts: number;
    customers: number;
    orders: number;
    deliveries: number;
}

export interface AdminScopeProps {
    activeStore: ActiveStoreRef | null;
    accessibleStores: AccessibleStore[];
    isGlobalAdmin: boolean;
    adminNav: { counts: AdminNavCounts } | null;
    auth: {
        user: {
            id: number;
            first_name: string;
            last_name: string | null;
            email: string;
            role: string;
            role_key: string;
            store_id: number | null;
        } | null;
    };
}
