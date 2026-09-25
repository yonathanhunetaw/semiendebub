import type { StorefrontVariantOption } from "@/types/storefront";

/**
 * Variant pivoting for the storefront Show page.
 *
 * Mirrors the seller's colour → size → packaging drill-down
 * (@/Components/Seller/itemShowHelpers) but is typed against
 * StorefrontVariantOption so the buyer-facing price and stock fields survive
 * the lookup.
 */

export function uniqueValues(
    values: Array<string | null | undefined>,
): string[] {
    return Array.from(
        new Set(values.filter((value): value is string => Boolean(value))),
    );
}

export function availableColors(
    variants: StorefrontVariantOption[],
): string[] {
    return uniqueValues(variants.map((variant) => variant.color));
}

export function availableSizes(
    variants: StorefrontVariantOption[],
    color: string | null,
): string[] {
    return uniqueValues(
        variants
            .filter((variant) => variant.color === color)
            .map((variant) => variant.size),
    );
}

export function availablePackaging(
    variants: StorefrontVariantOption[],
    color: string | null,
    size: string | null,
): string[] {
    return uniqueValues(
        variants
            .filter(
                (variant) => variant.color === color && variant.size === size,
            )
            .map((variant) => variant.packaging),
    );
}

/**
 * Resolve the exact SKU for a selection, falling back to the first variant so
 * the page always has something to price and add.
 */
export function findVariant(
    variants: StorefrontVariantOption[],
    color: string | null,
    size: string | null,
    packaging: string | null,
): StorefrontVariantOption | undefined {
    return (
        variants.find(
            (variant) =>
                variant.color === color &&
                variant.size === size &&
                variant.packaging === packaging,
        ) ?? variants[0]
    );
}

/**
 * The variant a shopper should land on first: the cheapest one actually in
 * stock, else the cheapest overall.
 */
export function defaultVariant(
    variants: StorefrontVariantOption[],
): StorefrontVariantOption | undefined {
    if (variants.length === 0) {
        return undefined;
    }

    const byPrice = [...variants].sort(
        (a, b) => (a.final_price ?? Infinity) - (b.final_price ?? Infinity),
    );

    return byPrice.find((variant) => variant.available_stock > 0) ?? byPrice[0];
}

/** True when at least one variant matching the partial selection is sellable. */
export function hasStockFor(
    variants: StorefrontVariantOption[],
    selection: { color?: string | null; size?: string | null; packaging?: string | null },
): boolean {
    return variants.some((variant) => {
        if (selection.color !== undefined && variant.color !== selection.color) {
            return false;
        }
        if (selection.size !== undefined && variant.size !== selection.size) {
            return false;
        }
        if (
            selection.packaging !== undefined &&
            variant.packaging !== selection.packaging
        ) {
            return false;
        }
        return variant.available_stock > 0;
    });
}
