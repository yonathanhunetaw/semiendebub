import { classifyPackagingTier } from "@/Components/Seller/itemShowHelpers";
import type { StorefrontVariantOption } from "@/types/storefront";

/**
 * Pack arithmetic for the product page, mirroring the seller item sheet.
 *
 * A pack is priced as a whole, and anything added underneath it is charged at
 * that pack's own rate: a Carton at 9.51 holding 240 pieces in 20 boxes makes a
 * box 0.48 and a piece 0.04. The server derives the same figures in
 * CartService::proratedSubUnitPrices() and ignores whatever the client posts,
 * so these are for display and must agree with it.
 */

/** Pieces in one box of the same colour and size, or null when unboxed. */
export function boxUnitsFor(
    variants: StorefrontVariantOption[],
    color: string | null,
    size: string | null,
): number | null {
    const boxVariant = variants.find(
        (variant) =>
            variant.color === color &&
            variant.size === size &&
            classifyPackagingTier(variant.packaging) === "box",
    );

    const units = boxVariant?.pieces_per_unit ?? 0;

    return units > 0 ? units : null;
}

export interface SubUnitRates {
    /** Cost of one loose piece at the chosen pack's rate. */
    perPiece: number | null;
    /** Cost of one box at the chosen pack's rate; null unless the pack exceeds a box. */
    perBox: number | null;
    /** Whole boxes inside one unit of the chosen pack. */
    boxesPerPack: number | null;
}

export function subUnitRates(
    pack: StorefrontVariantOption | undefined,
    boxUnits: number | null,
): SubUnitRates {
    const price = pack?.final_price ?? null;
    const pieces = pack?.pieces_per_unit ?? 0;

    if (price === null || pieces <= 0) {
        return { perPiece: null, perBox: null, boxesPerPack: null };
    }

    const perPiece = price / pieces;

    // Only when the chosen pack is genuinely bigger than a box does offering
    // boxes underneath it mean anything.
    const canSplitIntoBoxes = boxUnits !== null && boxUnits > 0 && pieces > boxUnits;

    return {
        perPiece,
        perBox: canSplitIntoBoxes ? perPiece * boxUnits : null,
        boxesPerPack: canSplitIntoBoxes ? Math.floor(pieces / boxUnits) : null,
    };
}

/** "240 Pieces (20 Boxes)" — what one unit of the chosen pack contains. */
export function equivalenceLabel(
    piecesPerUnit: number,
    boxesPerPack: number | null,
): string {
    if (piecesPerUnit <= 0) {
        return "";
    }

    const pieces = `${piecesPerUnit} Piece${piecesPerUnit === 1 ? "" : "s"}`;

    return boxesPerPack && boxesPerPack > 1
        ? `${pieces} (${boxesPerPack} Boxes)`
        : pieces;
}

/**
 * "1 Carton / 20 Boxes / 240 Pieces" — the running total in every unit it can
 * be expressed in, including anything added underneath.
 */
export function summaryLabel({
    tierLabel,
    count,
    piecesPerUnit,
    boxUnits,
    extraBoxes,
    extraPieces,
}: {
    tierLabel: string;
    count: number;
    piecesPerUnit: number;
    boxUnits: number | null;
    extraBoxes: number;
    extraPieces: number;
}): string {
    if (count <= 0 && extraBoxes <= 0 && extraPieces <= 0) {
        return "Nothing selected";
    }

    const parts: string[] = [];

    if (count > 0) {
        parts.push(`${count} ${tierLabel}${count === 1 ? "" : "s"}`);
    }

    const totalPieces =
        piecesPerUnit * count + extraPieces + extraBoxes * (boxUnits ?? 0);

    if (totalPieces <= 0) {
        return parts.join(" / ") || "Nothing selected";
    }

    // A piece-level pack has no meaningful breakdown below itself.
    if (piecesPerUnit <= 1 && extraBoxes <= 0) {
        return parts.join(" / ") || `${totalPieces} Pieces`;
    }

    if (boxUnits !== null && boxUnits > 0 && piecesPerUnit > boxUnits) {
        const totalBoxes = Math.floor(totalPieces / boxUnits);

        if (totalBoxes > 0) {
            parts.push(`${totalBoxes} Box${totalBoxes === 1 ? "" : "es"}`);
        }
    }

    parts.push(`${totalPieces} Piece${totalPieces === 1 ? "" : "s"}`);

    return parts.join(" / ");
}

/** What the line will cost: the packs, plus anything added underneath. */
export function lineTotal({
    packPrice,
    count,
    perBox,
    extraBoxes,
    perPiece,
    extraPieces,
}: {
    packPrice: number | null;
    count: number;
    perBox: number | null;
    extraBoxes: number;
    perPiece: number | null;
    extraPieces: number;
}): number {
    return (
        (packPrice ?? 0) * count +
        (perBox ?? 0) * extraBoxes +
        (perPiece ?? 0) * extraPieces
    );
}
