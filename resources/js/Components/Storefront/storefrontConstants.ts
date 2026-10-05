import type { StockStatus } from "@/types/storefront";

/**
 * Color tokens for the public storefront, for the places that set a color
 * through `style` (hover handlers, conditional fills).
 *
 * They read the theme's CSS variables, so the storefront follows the role of
 * the host it is served on (the root domain resolves to `admin`; the shop has
 * no brand color of its own yet) and the app's light/dark mode. Text on a
 * STOREFRONT_BRAND fill is `text-on-primary`.
 */
export const STOREFRONT_BRAND = "rgb(var(--primary))";
export const STOREFRONT_BRAND_HOVER = "rgb(var(--primary) / 0.9)";
export const STOREFRONT_BRAND_SOFT = "rgb(var(--primary-container))";
export const STOREFRONT_BRAND_BORDER = "rgb(var(--primary) / 0.3)";
export const STOREFRONT_BG = "rgb(var(--background))";
export const STOREFRONT_SURFACE = "rgb(var(--surface-container-lowest))";

export const STOREFRONT_CURRENCY = "ETB";

/**
 * The storefront's content shell.
 *
 * Matches SellerLayout's own constraint — `maxWidth: { xs: 480px, sm: 100%,
 * md: 1200px }` — so the buyer surface sits on the same measure as the seller
 * workspace instead of running the full width of the viewport.
 *
 * Every storefront surface (masthead, filter strip, grid, product page) uses
 * this one token. They previously each declared `max-w-7xl` independently,
 * which is 1280px of full-bleed layout: on a phone the grid fell to a single
 * column of enormous cards, and on a desktop the content stretched wider than
 * anything else in the app.
 */
export const STOREFRONT_SHELL =
    "mx-auto w-full max-w-[480px] px-4 sm:max-w-full md:max-w-[1200px] md:px-8";

/**
 * Product grid columns, matching the seller dashboard's 2 / 3 / 4.
 *
 * The storefront started at one column on mobile, which is what made the cards
 * look oversized — a shopper could see a single product at a time.
 */
export const STOREFRONT_GRID =
    "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4";

/**
 * Neutral SVG shown when a variant and its parent item both lack imagery.
 * An image asset (data URI), so its slate fills are fixed: CSS variables do
 * not reach inside it.
 */
export const NO_IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f8fafc'/%3E%3Crect x='130' y='140' width='140' height='120' rx='10' fill='none' stroke='%23cbd5e1' stroke-width='8'/%3E%3Cpath d='M150 240 L190 195 L220 230 L245 205 L250 240 Z' fill='%23cbd5e1'/%3E%3Ccircle cx='230' cy='172' r='12' fill='%23cbd5e1'/%3E%3C/svg%3E";

export interface StockTone {
    label: string;
    className: string;
    dotClassName: string;
}

/** Badge presentation for each availability bucket. */
export const STOCK_TONES: Record<StockStatus, StockTone> = {
    in_stock: {
        label: "In Stock",
        className: "bg-success-container text-on-success-container border-success/30",
        dotClassName: "bg-success",
    },
    low_stock: {
        label: "Low Stock",
        className: "bg-warning-container text-on-warning-container border-warning/30",
        dotClassName: "bg-warning",
    },
    out_of_stock: {
        label: "Out of Stock",
        className: "bg-surface-container text-on-surface-variant border-outline-variant",
        dotClassName: "bg-outline",
    },
};

/** Money formatter shared by the cards and the cart drawer. */
export function formatPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "—";
    }

    return `${STOREFRONT_CURRENCY} ${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)}`;
}

export function resolveImage(url: string | null | undefined): string {
    return url && url.length > 0 ? url : NO_IMAGE_PLACEHOLDER;
}

/**
 * Whether a stored image URL actually points at something.
 *
 * resolveImage() answers with a grey "No Image" data URI when it does not,
 * which means a component can no longer tell a real photograph from a missing
 * one — and so cannot choose to draw a PackagingPlaceholder instead. Call this
 * first and only fall back to resolveImage() when it returns true.
 */
export function hasImage(url: string | null | undefined): boolean {
    return typeof url === "string" && url.trim().length > 0;
}

/**
 * Height of UserBottomNav, in pixels.
 *
 * The buyer bottom bar is `fixed bottom-0`, and so is the product page's
 * add-to-cart bar. They were both pinned to the same edge with the nav on the
 * higher z-index, so the nav sat on top of "Add to Cart" and the button could
 * not be seen or pressed. Anything else anchored to the bottom offsets by this
 * while the nav is on screen (phones and tablets; it is hidden from `md` up).
 *
 * Measured from the rendered bar rather than added up from its padding: the
 * Material Symbols glyphs make each icon span taller than its nominal 24px, so
 * the arithmetic figure (59) left the bar's last few pixels under the nav.
 */
export const USER_BOTTOM_NAV_HEIGHT = 66;

/** Bottom offset for a fixed bar that must clear the buyer nav and the home indicator. */
export const ABOVE_USER_BOTTOM_NAV = `calc(${USER_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;
