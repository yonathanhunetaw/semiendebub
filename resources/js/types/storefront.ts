/**
 * Centralized TypeScript contracts for the public storefront
 * (resources/js/Pages/Guest/Dashboard/** and resources/js/Components/Storefront/**).
 *
 * Mirrors the payloads produced by:
 *   - App\Services\StorefrontCatalogService::presentItemCard()
 *   - App\Services\StorefrontCatalogService::presentItemDetail()
 *   - App\Services\CartService::presentBuyerCart()
 *   - App\Http\Controllers\Storefront\StorefrontController
 *
 * The shape follows the seller journey: the grid is item-level, and variant
 * selection happens on the item Show page.
 */

/* ----------------------------------------------------------
 | Shared primitives
 |----------------------------------------------------------*/

/** Availability bucket driven by config('storefront.low_stock_threshold'). */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface StorefrontStore {
    id: number;
    name: string;
    location: string | null;
}

/** A category facet; `count` is scoped to the sellable catalogue of this store. */
export interface StorefrontCategory {
    id: number;
    name: string;
    count: number;
}

export interface StorefrontCategoryRef {
    id: number;
    name: string;
}

/* ----------------------------------------------------------
 | Catalogue — grid
 |----------------------------------------------------------*/

/**
 * One product as rendered in the storefront grid.
 *
 * Prices are "from" figures: the cheapest sellable variant of the item. The
 * exact price is settled once a variant is chosen on the Show page.
 */
export interface StorefrontItemCard {
    id: number;
    title: string;
    description: string | null;
    category: StorefrontCategoryRef | null;
    image_url: string | null;
    /** Cheapest payable price across sellable variants. */
    price_from: number | null;
    /** List price of that same cheapest variant, for strike-through. */
    list_price_from: number | null;
    is_discounted: boolean;
    variant_count: number;
    colors: string[];
    sizes: string[];
    /** Units in stock summed across every sellable variant. */
    available_stock: number;
    stock_status: StockStatus;
}

/* ----------------------------------------------------------
 | Catalogue — detail
 |----------------------------------------------------------*/

/**
 * One purchasable SKU behind a product.
 *
 * `id` is the item_variants id — the identifier every cart endpoint expects.
 */
export interface StorefrontVariantOption {
    id: number;
    store_variant_id: number;
    sku: string | null;
    barcode: string | null;
    color: string | null;
    size: string | null;
    packaging: string | null;
    /** Loose pieces contained in one purchasable unit; 0 when not configured. */
    pieces_per_unit: number;
    image_url: string | null;
    images: string[];
    /** List price before any live discount. */
    price: number | null;
    /** Price actually charged today. */
    final_price: number | null;
    discount_ends_at: string | null;
    is_discounted: boolean;
    available_stock: number;
    stock_status: StockStatus;
}

export interface StorefrontItemDetail {
    id: number;
    title: string;
    description: string | null;
    category: StorefrontCategoryRef | null;
    images: string[];
    variants: StorefrontVariantOption[];
    available_stock: number;
    stock_status: StockStatus;
}

/* ----------------------------------------------------------
 | Cart (single-user)
 |----------------------------------------------------------*/

/**
 * One line of the shopper's cart. Unlike the seller workspace there is no
 * vendor or manifest dimension here — a buyer holds exactly one cart.
 */
export interface StorefrontCartLine {
    variant_id: number;
    /** Parent product, so the grid can show an "n in cart" hint on a card. */
    item_id: number;
    title: string;
    /** Human-readable descriptor, e.g. "Blue · A4 · Box of 12". */
    variant_label: string;
    sku: string | null;
    image_url: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    available_stock: number;
}

export interface StorefrontCart {
    id: number | null;
    lines: StorefrontCartLine[];
    /** Sum of line quantities — the header badge count. */
    item_count: number;
    subtotal: number;
    /** True while the cart is keyed to a session rather than a user account. */
    is_guest: boolean;
}

/* ----------------------------------------------------------
 | Page props
 |----------------------------------------------------------*/

export interface StorefrontAuthUser {
    id: number;
    first_name: string | null;
    email: string;
    role: string | null;
    store_id: number | null;
}

export interface StorefrontFilters {
    search: string;
    category_id: number | null;
}

export interface StorefrontPagination {
    current_page: number;
    last_page: number;
    next_page_url: string | null;
    total: number;
}

export interface StorefrontFlash {
    success?: string | null;
    error?: string | null;
}

/** Shared by HandleInertiaRequests::share(). */
export interface StorefrontSharedProps {
    auth: { user: StorefrontAuthUser | null };
    flash?: StorefrontFlash;
}

/** Inertia page props for Guest/Dashboard/index. */
export interface StorefrontPageProps extends StorefrontSharedProps {
    store: StorefrontStore | null;
    items: StorefrontItemCard[];
    categories: StorefrontCategory[];
    cart: StorefrontCart;
    filters: StorefrontFilters;
    pagination: StorefrontPagination;
    error?: string | null;
}

/** Inertia page props for Guest/Dashboard/Show. */
export interface StorefrontShowPageProps extends StorefrontSharedProps {
    store: StorefrontStore | null;
    item: StorefrontItemDetail;
    categories: StorefrontCategory[];
    cart: StorefrontCart;
}
