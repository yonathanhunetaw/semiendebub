import React from "react";

import {
    PACKAGING_TIER_LABEL,
    PACKAGING_TIER_ORDER,
    classifyPackagingTier,
    type PackagingTier,
} from "@/Components/Seller/itemShowHelpers";
import type { StorefrontVariantOption } from "@/types/storefront";
import {
    boxUnitsFor,
    equivalenceLabel,
    subUnitRates,
} from "./packagingMath";
import {
    STOREFRONT_BRAND,
    STOREFRONT_BRAND_BORDER,
    STOREFRONT_BRAND_SOFT,
    formatPrice,
} from "./storefrontConstants";
import {
    availableColors,
    availablePackaging,
    availableSizes,
    findVariant,
    hasStockFor,
} from "./variantSelection";

export interface VariantSelection {
    color: string | null;
    size: string | null;
    packaging: string | null;
}

export interface VariantSelectorProps {
    variants: StorefrontVariantOption[];
    selection: VariantSelection;
    onChange: (selection: VariantSelection) => void;

    /* -- counts, owned by the page so the footer can total them -- */
    quantity: number;
    onQuantityChange: (next: number) => void;
    extraBoxes: number;
    onExtraBoxesChange: (next: number) => void;
    extraPieces: number;
    onExtraPiecesChange: (next: number) => void;
}

/**
 * Colour → size → packaging drill-down, built to the same spec as the seller's
 * AddToCartSheet.
 *
 * The storefront's own version was three identical rows of small chips in
 * horizontal scrollers. The seller's is a different shape and it is the better
 * one: options *wrap* rather than scroll, so nothing hides off the edge of a
 * phone, the labels are readable at a glance, and packaging is a row of tier
 * tabs (Piece / Packet / Box / Carton) over a card that spells out what one unit
 * of the chosen pack actually is.
 *
 * Tier classification is imported from the seller helpers rather than copied, so
 * both surfaces agree on what counts as a Carton.
 *
 * One deliberate difference: the seller's `orderedPackagingTiers()` drops any
 * packaging string it cannot classify, which is fine for an internal tool with a
 * known taxonomy. Here it would make a purchasable SKU unreachable, so every
 * option is kept — classification only decides the label and the order.
 */
export default function VariantSelector({
    variants,
    selection,
    onChange,
    quantity,
    onQuantityChange,
    extraBoxes,
    onExtraBoxesChange,
    extraPieces,
    onExtraPiecesChange,
}: VariantSelectorProps): React.ReactElement {
    const colors = availableColors(variants);
    const sizes = availableSizes(variants, selection.color);
    const packagings = availablePackaging(variants, selection.color, selection.size);

    const handleColor = (color: string): void => {
        const nextSizes = availableSizes(variants, color);
        const nextSize = nextSizes.includes(selection.size ?? "")
            ? selection.size
            : (nextSizes[0] ?? null);
        const nextPackagings = availablePackaging(variants, color, nextSize);

        onChange({
            color,
            size: nextSize,
            packaging: nextPackagings.includes(selection.packaging ?? "")
                ? selection.packaging
                : (nextPackagings[0] ?? null),
        });
    };

    const handleSize = (size: string): void => {
        const nextPackagings = availablePackaging(variants, selection.color, size);

        onChange({
            color: selection.color,
            size,
            packaging: nextPackagings.includes(selection.packaging ?? "")
                ? selection.packaging
                : (nextPackagings[0] ?? null),
        });
    };

    const handlePackaging = (packaging: string): void => {
        onChange({ ...selection, packaging });
    };

    return (
        <div className="space-y-4">
            {colors.length > 0 ? (
                <ChipGroup
                    label="Color"
                    options={colors.map((color) => ({
                        value: color,
                        available: hasStockFor(variants, { color }),
                    }))}
                    selected={selection.color}
                    onSelect={handleColor}
                />
            ) : null}

            {sizes.length > 0 ? (
                <ChipGroup
                    label="Size"
                    options={sizes.map((size) => ({
                        value: size,
                        available: hasStockFor(variants, {
                            color: selection.color,
                            size,
                        }),
                    }))}
                    selected={selection.size}
                    onSelect={handleSize}
                />
            ) : null}

            {packagings.length > 0 ? (
                <PackagingTiers
                    variants={variants}
                    options={packagings}
                    selection={selection}
                    onSelect={handlePackaging}
                    quantity={quantity}
                    onQuantityChange={onQuantityChange}
                    extraBoxes={extraBoxes}
                    onExtraBoxesChange={onExtraBoxesChange}
                    extraPieces={extraPieces}
                    onExtraPiecesChange={onExtraPiecesChange}
                />
            ) : null}
        </div>
    );
}

/* ----------------------------------------------------------
 | Wrapping pill group — the seller's ChipGroup
 |----------------------------------------------------------*/

interface ChipGroupProps {
    label: string;
    options: Array<{ value: string; available: boolean }>;
    selected: string | null;
    onSelect: (value: string) => void;
}

function ChipGroup({
    label,
    options,
    selected,
    onSelect,
}: ChipGroupProps): React.ReactElement {
    return (
        <div>
            <p className="mb-2.5 text-[18px] font-bold leading-none text-on-surface">
                {label}
            </p>

            {/* Wrapping, not scrolling. A row that scrolls hides options a
                shopper never learns exist, and its scroll width is what used to
                push this column off the side of the page. */}
            <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
                {options.map((option) => {
                    const active = option.value === selected;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelect(option.value)}
                            aria-pressed={active}
                            title={
                                option.available
                                    ? undefined
                                    : `${option.value} — out of stock`
                            }
                            className={`min-w-0 max-w-full break-words rounded-full border px-5 py-2.5 text-[14px] font-semibold transition-all active:scale-95 ${
                                active
                                    ? "border-transparent text-on-primary"
                                    : option.available
                                      ? "border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high"
                                      : "border-outline-variant bg-surface-container text-outline line-through"
                            }`}
                            style={
                                active
                                    ? {
                                          backgroundColor: STOREFRONT_BRAND,
                                          borderColor: STOREFRONT_BRAND,
                                      }
                                    : undefined
                            }
                        >
                            {option.value}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Packaging tier tabs + the chosen-pack card
 |----------------------------------------------------------*/

interface PackagingTiersProps {
    variants: StorefrontVariantOption[];
    options: string[];
    selection: VariantSelection;
    onSelect: (packaging: string) => void;
    quantity: number;
    onQuantityChange: (next: number) => void;
    extraBoxes: number;
    onExtraBoxesChange: (next: number) => void;
    extraPieces: number;
    onExtraPiecesChange: (next: number) => void;
}

function PackagingTiers({
    variants,
    options,
    selection,
    onSelect,
    quantity,
    onQuantityChange,
    extraBoxes,
    onExtraBoxesChange,
    extraPieces,
    onExtraPiecesChange,
}: PackagingTiersProps): React.ReactElement {
    /**
     * Label and order come from the shared tier classification; anything it
     * cannot place keeps its own name and sorts last, so no pack is hidden.
     */
    const tiers = React.useMemo(() => {
        const rank = (tier: PackagingTier | null): number =>
            tier === null ? PACKAGING_TIER_ORDER.length : PACKAGING_TIER_ORDER.indexOf(tier);

        return options
            .map((raw) => {
                const tier = classifyPackagingTier(raw);

                return {
                    raw,
                    tier,
                    label: tier ? PACKAGING_TIER_LABEL[tier] : raw,
                    available: hasStockFor(variants, {
                        color: selection.color,
                        size: selection.size,
                        packaging: raw,
                    }),
                };
            })
            .sort((a, b) => rank(a.tier) - rank(b.tier));
    }, [options, variants, selection.color, selection.size]);

    const chosen = findVariant(
        variants,
        selection.color,
        selection.size,
        selection.packaging,
    );
    const chosenTier = tiers.find((tier) => tier.raw === selection.packaging);
    const tierLabel = chosenTier?.label ?? selection.packaging ?? "Unit";

    const boxUnits = boxUnitsFor(variants, selection.color, selection.size);
    const rates = subUnitRates(chosen, boxUnits);
    const contains = equivalenceLabel(chosen?.pieces_per_unit ?? 0, rates.boxesPerPack);

    // A pack only splits into something smaller than itself.
    const canAddBoxes = rates.perBox !== null;
    const canAddPieces = rates.perPiece !== null && (chosen?.pieces_per_unit ?? 0) > 1;

    return (
        <div>
            <p className="mb-2.5 text-[18px] font-bold leading-none text-on-surface">
                Packaging
            </p>

            {/* Equal-width tabs, as on the seller sheet. */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Packaging">
                {tiers.map((tier) => {
                    const active = tier.raw === selection.packaging;

                    return (
                        <button
                            key={tier.raw}
                            type="button"
                            onClick={() => onSelect(tier.raw)}
                            aria-pressed={active}
                            title={
                                tier.available ? undefined : `${tier.label} — out of stock`
                            }
                            className={`min-w-[5.5rem] flex-1 break-words rounded-2xl border py-2 text-[14px] font-bold transition-all active:scale-95 ${
                                active
                                    ? "border-transparent text-on-primary"
                                    : tier.available
                                      ? "border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                                      : "border-outline-variant bg-surface-container text-outline line-through"
                            }`}
                            style={
                                active
                                    ? {
                                          backgroundColor: STOREFRONT_BRAND,
                                          borderColor: STOREFRONT_BRAND,
                                      }
                                    : undefined
                            }
                        >
                            {tier.label}
                        </button>
                    );
                })}
            </div>

            {/*
              The chosen pack, and everything that fits underneath it.

              Picking a Carton should not force a shopper who wants 1 carton and
              3 more boxes to work in cartons or start again in boxes. The nested
              rows charge the carton's own rate for those extras — a box is the
              carton price over the boxes it holds — which is the whole point of
              buying at pack scale.
            */}
            {chosen ? (
                <div
                    className="mt-3 rounded-2xl border p-3"
                    style={{
                        backgroundColor: STOREFRONT_BRAND_SOFT,
                        borderColor: STOREFRONT_BRAND_BORDER,
                    }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-[15px] font-bold text-on-surface">
                                {tierLabel}
                            </p>
                            {contains ? (
                                <p className="mt-0.5 text-[12px] font-medium text-on-surface-variant">
                                    {contains}
                                </p>
                            ) : null}
                            <p
                                className="mt-0.5 text-[12px] font-bold"
                                style={{ color: STOREFRONT_BRAND }}
                            >
                                {formatPrice(chosen.final_price)} / {tierLabel.toLowerCase()}
                            </p>
                        </div>

                        <Stepper
                            value={quantity}
                            onChange={onQuantityChange}
                            min={0}
                            max={chosen.available_stock}
                            size="lg"
                            label={`${tierLabel} quantity`}
                        />
                    </div>

                    {canAddBoxes || canAddPieces ? (
                        <div className="ml-3 mt-3 space-y-3 border-l-2 border-outline-variant pl-3">
                            {canAddBoxes ? (
                                <SubUnitRow
                                    label="+ Boxes"
                                    rate={rates.perBox}
                                    value={extraBoxes}
                                    onChange={onExtraBoxesChange}
                                />
                            ) : null}

                            {canAddPieces ? (
                                <SubUnitRow
                                    label="+ Pieces"
                                    rate={rates.perPiece}
                                    value={extraPieces}
                                    onChange={onExtraPiecesChange}
                                />
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function SubUnitRow({
    label,
    rate,
    value,
    onChange,
}: {
    label: string;
    rate: number | null;
    value: number;
    onChange: (next: number) => void;
}): React.ReactElement {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[13px] font-semibold text-on-surface-variant">{label}</p>
                {rate !== null ? (
                    <p
                        className="mt-0.5 text-[12px] font-bold"
                        style={{ color: STOREFRONT_BRAND }}
                    >
                        {formatPrice(rate)} ea.
                    </p>
                ) : null}
            </div>

            <Stepper value={value} onChange={onChange} min={0} size="sm" label={label} />
        </div>
    );
}

function Stepper({
    value,
    onChange,
    min = 0,
    max,
    size = "lg",
    label,
}: {
    value: number;
    onChange: (next: number) => void;
    min?: number;
    max?: number;
    size?: "lg" | "sm";
    label: string;
}): React.ReactElement {
    const clamp = (next: number): number => {
        const floored = Math.max(min, next);

        return max !== undefined ? Math.min(max, floored) : floored;
    };

    const dimension = size === "lg" ? "h-9 w-9" : "h-7 w-7";
    const icon = size === "lg" ? "text-[20px]" : "text-[16px]";

    return (
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest p-1">
            <button
                type="button"
                onClick={() => onChange(clamp(value - 1))}
                disabled={value <= min}
                aria-label={`Decrease ${label}`}
                className={`${dimension} flex items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-30`}
            >
                <span className={`material-symbols-outlined ${icon}`}>remove</span>
            </button>

            <span
                aria-live="polite"
                className={`text-center font-bold text-on-surface ${
                    size === "lg" ? "min-w-[2rem] text-[16px]" : "min-w-[1.5rem] text-[14px]"
                }`}
            >
                {value}
            </span>

            <button
                type="button"
                onClick={() => onChange(clamp(value + 1))}
                disabled={max !== undefined && value >= max}
                aria-label={`Increase ${label}`}
                className={`${dimension} flex items-center justify-center rounded-full text-on-primary transition-opacity hover:opacity-90 disabled:opacity-30`}
                style={{ backgroundColor: STOREFRONT_BRAND }}
            >
                <span className={`material-symbols-outlined ${icon}`}>add</span>
            </button>
        </div>
    );
}
