/**
 * The admin item list (Admin/Items/Index), as built by
 * App\Services\Admin\ItemCatalogue.
 */

export type ItemStatus = "draft" | "active" | "inactive" | "archived";

export type ItemSort = "name" | "updated" | "created" | "variants" | "live";

export interface ItemRow {
    id: number;
    product_name: string;
    status: ItemStatus | string;
    category: string | null;
    /** Some variant still lacks image proof (see ItemVariant::hasImageProof). */
    is_incomplete: boolean;
    variants_count: number;
    /** Active variants listed and switched on in at least one store. */
    live_variants_count: number;
    /** Stores with at least one of the item's variants on. */
    stores_count: number;
    /** Up to four resolved image URLs: general images, then variant covers. */
    images: string[];
    updated_at: string | null;
}

export interface ItemFilters {
    q: string;
    status: ItemStatus | "all";
    category: number | null;
    needs_photos: boolean;
    sort: ItemSort;
    direction: "asc" | "desc";
    per_page: number;
}

/** Items per status under the other filters, plus `all` and `needs_photos`. */
export type ItemCounts = Record<ItemStatus | "all" | "needs_photos", number>;

export interface ItemCategoryOption {
    id: number;
    name: string;
    parent: string | null;
    /** Items filed directly under this category. */
    items: number;
}

export interface ItemPage {
    data: ItemRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
}
