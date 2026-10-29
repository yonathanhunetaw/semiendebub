import { usePage } from "@inertiajs/react";

type Query = Record<string, string | number | boolean | null | undefined>;

/**
 * Links inside the shop that stay in the store being browsed: /shop for the
 * default store, /s/{slug} on a store's own page (a vendor is a store).
 */
export default function useShopLinks(): { index: (query?: Query) => string; item: (id: number) => string } {
    const store = (usePage().props as { store?: { slug?: string | null; explicit?: boolean } | null }).store;
    const slug = store?.explicit && store.slug ? store.slug : null;

    return {
        index: (query = {}) => (slug ? route("storefront.store", { store: slug, ...query }) : route("storefront.index", query)),
        item: (id) => (slug ? route("storefront.store.items.show", { store: slug, item: id }) : route("storefront.items.show", id)),
    };
}
