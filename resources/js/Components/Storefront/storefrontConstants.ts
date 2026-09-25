import type { StockStatus } from "@/types/storefront";

/**
 * Design tokens for the public storefront.
 *
 * Borrowed from the Seller module (`theme.ts` -> roles.seller.color, used
 * throughout Pages/Seller/Shipments) so buyer and seller surfaces read as one
 * product.
 */
export const STOREFRONT_BRAND = "#c2410c";
export const STOREFRONT_BRAND_HOVER = "#9a3412";
export const STOREFRONT_BRAND_SOFT = "#fff7ed";
export const STOREFRONT_BRAND_BORDER = "#fed7aa";
export const STOREFRONT_BG = "#f8fafc";
export const STOREFRONT_SURFACE = "#ffffff";

export const STOREFRONT_CURRENCY = "ETB";

/** Neutral SVG shown when a variant and its parent item both lack imagery. */
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
        className: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
        dotClassName: "bg-emerald-500",
    },
    low_stock: {
        label: "Low Stock",
        className: "bg-amber-50 text-amber-700 border-amber-200/70",
        dotClassName: "bg-amber-500",
    },
    out_of_stock: {
        label: "Out of Stock",
        className: "bg-slate-100 text-slate-500 border-slate-200",
        dotClassName: "bg-slate-400",
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
