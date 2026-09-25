import React from "react";

import type { StorefrontVariantOption } from "@/types/storefront";
import { STOREFRONT_BRAND } from "./storefrontConstants";
import {
    availableColors,
    availablePackaging,
    availableSizes,
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
}

/**
 * Colour → size → packaging drill-down, the same order the seller workspace
 * uses on Seller/Items/Show. Narrowing one level re-seeds the levels below it
 * so a shopper can never land on a combination that does not exist.
 */
export default function VariantSelector({
    variants,
    selection,
    onChange,
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
        <div className="space-y-3">
            {colors.length > 0 ? (
                <OptionGroup
                    label="Colour"
                    options={colors.map((color) => ({
                        value: color,
                        available: hasStockFor(variants, { color }),
                    }))}
                    selected={selection.color}
                    onSelect={handleColor}
                />
            ) : null}

            {sizes.length > 0 ? (
                <OptionGroup
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
                <OptionGroup
                    label="Pack"
                    options={packagings.map((packaging) => ({
                        value: packaging,
                        available: hasStockFor(variants, {
                            color: selection.color,
                            size: selection.size,
                            packaging,
                        }),
                    }))}
                    selected={selection.packaging}
                    onSelect={handlePackaging}
                />
            ) : null}
        </div>
    );
}

interface OptionGroupProps {
    label: string;
    options: Array<{ value: string; available: boolean }>;
    selected: string | null;
    onSelect: (value: string) => void;
}

function OptionGroup({
    label,
    options,
    selected,
    onSelect,
}: OptionGroupProps): React.ReactElement {
    return (
        <div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {label}
                </span>
                {selected ? (
                    <span className="text-[11px] font-bold text-gray-900">
                        {selected}
                    </span>
                ) : null}
            </div>

            <div
                className="no-scrollbar scroll-smooth mt-1.5 flex gap-1.5 overflow-x-auto"
                role="group"
                aria-label={label}
            >
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
                            className={`shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                                active
                                    ? "border-transparent text-white"
                                    : option.available
                                      ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                      : "border-slate-200 bg-slate-50 text-slate-400 line-through"
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
