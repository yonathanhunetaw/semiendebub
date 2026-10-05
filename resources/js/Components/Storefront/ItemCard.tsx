import { Link } from "@inertiajs/react";
import React from "react";

import PackagingPlaceholder from "@/Components/Shared/PackagingPlaceholder";
import type { StorefrontItemCard } from "@/types/storefront";
import {
    STOCK_TONES,
    STOREFRONT_BRAND,
    formatPrice,
    hasImage,
    resolveImage,
} from "./storefrontConstants";

export interface ItemCardProps {
    item: StorefrontItemCard;
    /** Units of this product already in the cart, across all its variants. */
    quantityInCart?: number;
}

/**
 * One product in the storefront grid.
 *
 * Mirrors the seller flow: the card is a doorway, not a checkout. Choosing a
 * colour / size / packaging combination happens on the item Show page, which
 * is where a specific SKU gets added to the cart.
 */
export default function ItemCard({
    item,
    quantityInCart = 0,
}: ItemCardProps): React.ReactElement {
    const tone = STOCK_TONES[item.stock_status];
    const isOutOfStock = item.stock_status === "out_of_stock";
    const hasChoices = item.variant_count > 1;

    return (
        <Link
            href={route("storefront.items.show", item.id)}
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/80 bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label={`View options for ${item.title}`}
        >
            {/* ── Media ── */}
            <div className="relative aspect-square overflow-hidden bg-surface-container-low">
                {/* Most of the catalogue has no photograph yet. Rather than a
                    grid of identical grey tiles, draw the packaging the
                    cheapest variant comes in — the one thing we do know. */}
                {hasImage(item.image_url) ? (
                    <img
                        src={resolveImage(item.image_url)}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                ) : (
                    <PackagingPlaceholder
                        packaging={item.packaging_from}
                        size="md"
                        className="border-0"
                    />
                )}

                {/* On a low-stock line the exact figure is the useful part — the
                    ledger already knows it, and "Low Stock" alone does not tell a
                    shopper whether to hurry. */}
                <span
                    className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone.className}`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dotClassName}`} />
                    {item.stock_status === "low_stock" && item.available_stock > 0
                        ? `${item.available_stock} left`
                        : tone.label}
                </span>

                {item.is_discounted ? (
                    <span
                        className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-on-primary shadow-sm"
                        style={{ backgroundColor: STOREFRONT_BRAND }}
                    >
                        Sale
                    </span>
                ) : null}

                {quantityInCart > 0 ? (
                    <span className="absolute bottom-2 right-2 rounded-full border border-primary/30 bg-surface-container-lowest/95 px-2 py-0.5 text-[9px] font-bold text-primary shadow-sm">
                        {quantityInCart} in cart
                    </span>
                ) : null}
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 flex-col gap-2 p-3">
                <div>
                    {item.category ? (
                        <p className="truncate text-[9px] font-bold uppercase tracking-wide text-outline">
                            {item.category.name}
                        </p>
                    ) : null}
                    <h3 className="mt-0.5 line-clamp-2 break-words text-[13px] font-bold leading-snug text-on-surface">
                        {item.title}
                    </h3>
                </div>

                {/* Variant preview: what the shopper will get to choose from */}
                {item.colors.length > 0 || item.sizes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {item.colors.slice(0, 2).map((color) => (
                            <span
                                key={`color-${color}`}
                                className="rounded-md border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant"
                            >
                                {color}
                            </span>
                        ))}
                        {item.sizes.slice(0, 2).map((size) => (
                            <span
                                key={`size-${size}`}
                                className="rounded-md border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant"
                            >
                                {size}
                            </span>
                        ))}
                        {hasChoices ? (
                            <span className="rounded-md border border-primary/30 bg-primary-container px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                {item.variant_count} options
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {/* Pricing — a "from" figure until a variant is chosen */}
                <div className="mt-auto pt-1">
                    {hasChoices ? (
                        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-outline">
                            From
                        </span>
                    ) : null}
                    <span className="text-[15px] font-extrabold tracking-tight text-on-surface">
                        {formatPrice(item.price_from)}
                    </span>
                    {item.is_discounted && item.list_price_from !== null ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-outline line-through">
                            {formatPrice(item.list_price_from)}
                        </span>
                    ) : null}
                </div>

                {/* ── CTA ── */}
                <span
                    className={`flex h-8 items-center justify-center gap-1 rounded-xl text-[11px] font-bold shadow-sm transition-transform group-active:scale-95 ${
                        isOutOfStock
                            ? "bg-surface-container-highest text-on-surface-variant"
                            : "bg-primary text-on-primary"
                    }`}
                >
                    <span className="material-symbols-outlined text-[15px]">
                        {isOutOfStock ? "visibility" : "tune"}
                    </span>
                    {isOutOfStock
                        ? "View product"
                        : hasChoices
                          ? "Choose options"
                          : "View & add"}
                </span>
            </div>
        </Link>
    );
}
