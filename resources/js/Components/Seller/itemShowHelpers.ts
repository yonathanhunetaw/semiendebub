// SVG placeholder for missing images
export const NO_IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='500' viewBox='0 0 500 500'%3E%3Crect width='500' height='500' fill='%23f5f5f5'/%3E%3Ctext x='250' y='250' font-family='Arial, sans-serif' font-size='20' text-anchor='middle' fill='%23999'%3ENo Image%3C/text%3E%3C/svg%3E";

export interface SellerVariantData {
    id: number;
    color?: string | null;
    size?: string | null;
    packaging?: string | null;
    price?: number | null;
    discount_price?: number | null;
    final_price?: number | null;
    seller_price?: number | null;
    seller_discount_price?: number | null;
    stock?: number | null;
    status?: string | null;
    images?: string[];
    quantity?: number | null;
}

export interface SellerItem {
    id: number;
    product_name: string;
    product_description?: string | null;
}

export interface OpenCart {
    id: number;
    customer?: {
        first_name?: string;
        last_name?: string;
    } | null;
}

export type PricingMode = "normal" | "seller";

export function firstVariant(variants: SellerVariantData[]) {
    return variants[0];
}

export function uniqueValues(values: Array<string | null | undefined>) {
    return Array.from(
        new Set(values.filter((value): value is string => Boolean(value))),
    );
}

export function availableSizes(variants: SellerVariantData[], color: string) {
    return uniqueValues(
        variants
            .filter((variant) => variant.color === color)
            .map((variant) => variant.size),
    );
}

export function availablePackaging(
    variants: SellerVariantData[],
    color: string,
    size: string,
) {
    const filtered = variants.filter(
        (variant) => variant.color === color && variant.size === size,
    );
    return uniqueValues(filtered.map((variant) => variant.packaging));
}

export function findVariant(
    variants: SellerVariantData[],
    color: string,
    size: string,
    packaging: string,
) {
    return (
        variants.find(
            (variant) =>
                variant.color === color &&
                variant.size === size &&
                variant.packaging === packaging,
        ) ?? firstVariant(variants)
    );
}

export function visiblePrice(
    variant?: SellerVariantData,
    mode: PricingMode = "normal",
) {
    if (!variant) {
        return null;
    }

    if (mode === "seller") {
        return (
            variant.seller_discount_price ??
            variant.seller_price ??
            variant.final_price ??
            variant.discount_price ??
            variant.price ??
            null
        );
    }

    return (
        variant.final_price ?? variant.discount_price ?? variant.price ?? null
    );
}

// --- Hierarchical packaging (Piece / Packet / Carton) ---
//
// A variant's `packaging` field is treated as a tier name. We classify the
// tiers found in `availablePackaging()` into a known order so we can render
// the Piece/Packet/Carton tab UI, and figure out which tier nests inside
// which (e.g. a Carton contains N Packets, a Packet contains M Pieces).

export type PackagingTier = "piece" | "packet" | "cartoon";

export const PACKAGING_TIER_ORDER: PackagingTier[] = [
    "piece",
    "packet",
    "cartoon",
];

export const PACKAGING_TIER_LABEL: Record<PackagingTier, string> = {
    piece: "Piece",
    packet: "Packet",
    cartoon: "Carton",
};

export function classifyPackagingTier(
    packaging?: string | null,
): PackagingTier | null {
    const value = (packaging ?? "").toLowerCase();
    if (!value) return null;
    if (value.includes("carton") || value.includes("cartoon")) return "cartoon";
    if (value.includes("packet") || value.includes("pack")) return "packet";
    if (value.includes("piece") || value.includes("pcs") || value.includes("pc"))
        return "piece";
    return null;
}

/**
 * Given the packaging option strings available for the current color/size,
 * return them grouped + ordered by tier (piece -> packet -> cartoon), each
 * paired with the original string so we can still match it back to a variant.
 */
export function orderedPackagingTiers(
    packagingOptions: string[],
): Array<{ tier: PackagingTier; raw: string }> {
    const withTier = packagingOptions
        .map((raw) => ({ raw, tier: classifyPackagingTier(raw) }))
        .filter(
            (entry): entry is { raw: string; tier: PackagingTier } =>
                entry.tier !== null,
        );

    return withTier.sort(
        (a, b) =>
            PACKAGING_TIER_ORDER.indexOf(a.tier) -
            PACKAGING_TIER_ORDER.indexOf(b.tier),
    );
}

/**
 * How many of `childTier` make up one `parentTier`, derived from each
 * variant's `quantity` field. Quantity is assumed to represent "how many
 * base pieces are in this packaging unit" (e.g. a Packet variant might have
 * quantity = 50, a Carton variant might have quantity = 600).
 *
 * Returns null if we don't have enough data to compute a ratio.
 */
export function unitsPerTier(
    variants: SellerVariantData[],
    color: string,
    size: string,
    raw: string,
): number | null {
    const match = variants.find(
        (v) => v.color === color && v.size === size && v.packaging === raw,
    );
    return match?.quantity ?? null;
}

/**
 * The breakdown of a chosen quantity in the "current" tier, expressed
 * in terms of the next tier down (how many of the smaller unit it takes to
 * make one of the current unit), e.g. "3 Packets" + "10 extra Pieces".
 */
export interface PackagingBreakdownLine {
    tier: PackagingTier;
    raw: string;
    label: string;
    count: number;
    unitPrice: number | null;
}

export function totalFromBreakdown(lines: PackagingBreakdownLine[]) {
    return lines.reduce(
        (sum, line) => sum + line.count * (line.unitPrice ?? 0),
        0,
    );
}

export function summarizeBreakdown(lines: PackagingBreakdownLine[]) {
    return lines
        .filter((line) => line.count > 0)
        .map((line) => `${line.count} ${line.label}${line.count === 1 ? "" : "s"}`)
        .join(", ");
}
