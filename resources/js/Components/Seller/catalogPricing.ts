/**
 * A seller catalogue card as App\Services\Seller\SellerCatalog::present()
 * shapes it, and the price maths every card does with it.
 */
export interface CatalogItem {
    id: number;
    product_name: string;
    image_urls: string[];
    /** Store tier price before any discount. */
    store_price: number | null;
    /** The deepest tier's price after discounts (seller, customer, …). */
    final_price: number | null;
    discount_ends_at: string | null;
    sold_count: number;
    /** Pieces at this seller's store, Store Shelf + Store Floor. */
    store_stock?: number;
    /** Shelf in the smallest unit, floor biggest unit first; Remote Hub as yes/no only. */
    stock?: {
        shelf: StockFigure;
        floor: StockFigure;
        in_remote_hub: boolean;
    };
    category?: { category_name: string; parent_name?: string | null } | null;
    /** What the item comes in, across the variants this store sells. */
    variant_summary?: {
        count: number;
        colors: string[];
        sizes: string[];
        packaging: string[];
    };
    pricing_matrix?: Array<{
        level: string;
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
        final: number;
    }>;
    individual_price?: {
        price: number | null;
        discount_price: number | null;
        discount_ends_at: string | null;
    } | null;
}

/** PackagingLadder::present() — e.g. pieces 3617, label "30 Cartons · 17 Pieces". */
export interface StockFigure {
    pieces: number;
    label: string;
}

export interface CardPricing {
    /** What the customer pays. */
    price: number;
    /** Struck-through price when there is a discount. */
    original: number;
    hasDiscount: boolean;
    discountPercent: number;
    /** When the active discount ends, if it is time-limited. */
    discountEndsAt: string | null;
    /** The price shown is the seller tier (staff price). */
    isSellerPrice: boolean;
}

/**
 * The backend already resolved every tier (individual carts, business VAT,
 * customer and seller prices); this only picks which two numbers to show.
 * An individual top cart compares against the individual tier instead of the
 * store tier.
 */
export function cardPricing(item: CatalogItem, topCartIsIndividual: boolean): CardPricing {
    let original = item.store_price ?? 0;
    if (topCartIsIndividual && item.individual_price?.price != null) {
        original = item.individual_price.price;
    }
    const price = item.final_price ?? original;
    const deepestTier = item.pricing_matrix?.[item.pricing_matrix.length - 1];
    const hasDiscount = price < original;

    return {
        price,
        original,
        hasDiscount,
        discountPercent: hasDiscount && original > 0 ? Math.round(((original - price) / original) * 100) : 0,
        discountEndsAt: deepestTier?.discount_ends_at ?? item.discount_ends_at ?? null,
        isSellerPrice: deepestTier?.level === "seller",
    };
}

export const money = (value: number): string => `$${value.toFixed(2)}`;
