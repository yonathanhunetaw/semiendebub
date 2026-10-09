import { router, usePage } from "@inertiajs/react";
import type { ActiveStoreId, AdminScopeProps } from "@/types/adminScope";

/**
 * The admin store scope from the shared props, and the one way to change it.
 *
 * Switching is a visit with `?store=`, which ActiveStore validates and keeps
 * in the session, so the sidebar dropdown and the dashboard chips always agree
 * and plain links afterwards stay on the chosen store.
 */
export function useAdminScope() {
    const { props, url } = usePage<AdminScopeProps & Record<string, unknown>>();

    const accessibleStores = props.accessibleStores ?? [];
    const isGlobalAdmin = Boolean(props.isGlobalAdmin);
    const activeStore = props.activeStore ?? { id: "all" as ActiveStoreId, name: "All stores" };

    const setStore = (store: ActiveStoreId): void => {
        if (store === activeStore.id) {
            return;
        }

        // A record page (/carts/12, /orders/REF/custody) may belong to the
        // store being left, so switching from one goes to the dashboard.
        const path = url.split("?")[0];
        const onRecord = /\/\d+(\/|$)/.test(path) || /\/custody$/.test(path);

        router.get(onRecord ? route("admin.dashboard") : path, { store: String(store) }, { preserveScroll: true });
    };

    return {
        activeStore,
        accessibleStores,
        isGlobalAdmin,
        // A store admin with one store has nothing to switch to.
        canSwitch: isGlobalAdmin || accessibleStores.length > 1,
        roleKey: props.auth?.user?.role_key ?? "",
        counts: props.adminNav?.counts ?? null,
        setStore,
    };
}
