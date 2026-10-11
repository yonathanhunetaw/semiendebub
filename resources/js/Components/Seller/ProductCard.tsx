import { Link } from "@inertiajs/react";
import Box from "@mui/material/Box";
import React from "react";
import { type CatalogItem, cardPricing, money } from "@/Components/Seller/catalogPricing";

/** Stored paths come back absolute from ImageResolver; this covers stragglers. */
function imageUrl(path?: string): string | null {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const base = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${base}/${path.replace(/^\//, "")}`;
}

// ======================== NO-PHOTO ART ========================

/** Tonal pairs a photo-less card is painted in, picked by category so a category reads as one colour. */
const TONES = [
    "from-primary-container to-primary-container/40 text-on-primary-container",
    "from-secondary-container to-secondary-container/40 text-on-secondary-container",
    "from-tertiary-container to-tertiary-container/40 text-on-tertiary-container",
    "from-info-container to-info-container/40 text-on-info-container",
    "from-success-container to-success-container/40 text-on-success-container",
    "from-warning-container to-warning-container/40 text-on-warning-container",
];

function toneFor(key: string): string {
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return TONES[Math.abs(hash) % TONES.length];
}

function monogram(name: string): string {
    const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** A CSS colour for a colour name the browser knows ("Red", "Navy Blue" → navyblue), else null. */
function swatch(color: string): string | null {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return null;
    const name = color.trim().toLowerCase().replace(/\s+/g, "");
    return CSS.supports("color", name) ? name : null;
}

/** "Small · Medium · +2" */
function listed(values: string[], max = 3): string {
    return values.length > max ? `${values.slice(0, max).join(" · ")} · +${values.length - max}` : values.join(" · ");
}

function ColorDots({ colors, max = 5 }: { colors: string[]; max?: number }) {
    const shown = colors.slice(0, max);
    return (
        <span className="inline-flex items-center gap-1">
            <span className="inline-flex -space-x-1">
                {shown.map((c) => {
                    const css = swatch(c);
                    return (
                        <Box
                            key={c}
                            component="span"
                            title={c}
                            sx={{ width: 12, height: 12, borderRadius: "999px", border: "1.5px solid", borderColor: "background.paper", bgcolor: css ?? "action.disabled", display: "inline-block" }}
                        />
                    );
                })}
            </span>
            <span>
                {colors.length} {colors.length === 1 ? "colour" : "colours"}
            </span>
        </span>
    );
}

/**
 * Stands in for the photo: the item's monogram on its category's colour, and
 * what it comes in (colours, sizes, packs) so the card still says something.
 */
function NoPhotoArt({ item }: { item: CatalogItem }) {
    const summary = item.variant_summary;
    const category = item.category?.category_name || "General";

    return (
        <div className={`flex h-full w-full flex-col justify-between bg-gradient-to-br p-2.5 pt-9 ${toneFor(category)}`}>
            <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-container-lowest/70 text-[17px] font-black tracking-tight shadow-sm">
                    {monogram(item.product_name)}
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight opacity-80">
                    {item.category?.parent_name ? `${item.category.parent_name} › ` : ""}
                    {category}
                </span>
            </div>

            {summary && summary.count > 0 && (
                <div className="space-y-1 text-[10px] font-semibold">
                    {summary.colors.length > 0 && (
                        <div className="flex items-center gap-1 rounded-md bg-surface-container-lowest/70 px-1.5 py-0.5">
                            <ColorDots colors={summary.colors} />
                        </div>
                    )}
                    {summary.sizes.length > 0 && (
                        <div className="flex items-center gap-1 truncate rounded-md bg-surface-container-lowest/70 px-1.5 py-0.5">
                            <span className="material-symbols-outlined text-[13px]">straighten</span>
                            <span className="truncate">{listed(summary.sizes)}</span>
                        </div>
                    )}
                    {summary.packaging.length > 0 && (
                        <div className="flex items-center gap-1 truncate rounded-md bg-surface-container-lowest/70 px-1.5 py-0.5">
                            <span className="material-symbols-outlined text-[13px]">package_2</span>
                            <span className="truncate">{listed(summary.packaging)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** One line under a photographed card's name: "3 variants · 2 colours · Piece · Carton". */
function variantLine(item: CatalogItem): string | null {
    const s = item.variant_summary;
    if (!s || s.count <= 1) return s?.packaging.length ? s.packaging.join(" · ") : null;
    const parts = [`${s.count} variants`];
    if (s.colors.length > 1) parts.push(`${s.colors.length} colours`);
    if (s.sizes.length > 1) parts.push(`${s.sizes.length} sizes`);
    if (s.packaging.length) parts.push(listed(s.packaging, 2));
    return parts.join(" · ");
}

// ======================== STOCK ========================

function StockLines({ item }: { item: CatalogItem }) {
    const stock = item.stock;
    if (!stock) return null;

    const row = (icon: string, label: string, figure: { pieces: number; label: string }) => (
        <div className="flex items-start gap-1">
            <span className="material-symbols-outlined mt-px text-[13px] text-outline">{icon}</span>
            <span className="w-9 flex-shrink-0 text-on-surface-variant">{label}</span>
            <strong className={`min-w-0 flex-1 font-semibold ${figure.pieces > 0 ? "text-on-surface" : "text-warning"}`}>
                {figure.pieces > 0 ? figure.label : "None"}
            </strong>
        </div>
    );

    return (
        <div className="mt-2 space-y-0.5 border-t border-outline-variant pt-2 text-[11px] font-medium leading-snug">
            {row("shelves", "Shelf", stock.shelf)}
            {row("warehouse", "Floor", stock.floor)}
            {stock.in_remote_hub && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-[999px] bg-info-container px-1.5 py-0.5 text-[10px] font-semibold text-on-info-container">
                    <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                    Stocked in Remote Hub
                </div>
            )}
        </div>
    );
}

// ======================== DISCOUNT COUNTDOWN ========================

function useCountdown(endsAt: string | null): string | null {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        if (!endsAt) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [endsAt]);

    if (!endsAt) return null;
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return null;

    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function DiscountCountdown({ endsAt }: { endsAt: string }): React.ReactElement | null {
    const label = useCountdown(endsAt);
    if (!label) return null;

    return (
        <span
            title={`Discount ends ${new Date(endsAt).toLocaleString()}`}
            className="inline-flex items-center gap-0.5 rounded-md bg-inverse-surface/80 px-1.5 py-0.5 text-[10px] font-bold text-inverse-on-surface backdrop-blur-sm"
        >
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            {label}
        </span>
    );
}

// ======================== PRODUCT CARD ========================

/**
 * One catalogue card (Store page and search results): image (or, without one,
 * the item's monogram and what it comes in) with stock pill, discount badge,
 * countdown and seller-price tag; category, name, price with the
 * struck-through original and "incl. VAT" for individual carts; Store Shelf and
 * Store Floor stock, and a Remote Hub flag (never a figure: it is a transfer).
 */
export default function ProductCard({ item, hasTinCart, topCartIsIndividual }: { item: CatalogItem; hasTinCart: boolean; topCartIsIndividual: boolean }) {
    const pricing = cardPricing(item, topCartIsIndividual);
    const src = imageUrl(item.image_urls?.[0]);
    const [loaded, setLoaded] = React.useState(false);
    const [broken, setBroken] = React.useState(!src);
    const stock = item.store_stock;
    const outOfStock = stock !== undefined && stock !== null && stock <= 0;
    const remoteOnly = outOfStock && !!item.stock?.in_remote_hub;
    const variants = broken ? null : variantLine(item);

    return (
        <Link
            href={route("seller.items.show", item.id)}
            className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md"
        >
            <div>
                <div className="relative aspect-square w-full overflow-hidden bg-surface-container-low">
                    {broken ? (
                        <NoPhotoArt item={item} />
                    ) : (
                        <>
                            {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-container" />}
                            <img
                                src={src!}
                                alt={item.product_name}
                                loading="lazy"
                                onLoad={() => setLoaded(true)}
                                onError={() => setBroken(true)}
                                className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
                            />
                        </>
                    )}

                    {stock !== undefined && stock !== null && (
                        <span
                            className={`absolute left-2 top-2 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold shadow-sm ${
                                remoteOnly
                                    ? "border-info/30 bg-info-container text-on-info-container"
                                    : outOfStock
                                      ? "border-warning/30 bg-warning-container text-on-warning-container"
                                      : "border-success/30 bg-success-container text-on-success-container"
                            }`}
                        >
                            {remoteOnly ? "Remote Hub" : outOfStock ? "Out of stock" : "In stock"}
                        </span>
                    )}
                    {pricing.hasDiscount && (
                        <span className="absolute right-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary shadow-sm">
                            -{pricing.discountPercent}%
                        </span>
                    )}
                    {((pricing.hasDiscount && pricing.discountEndsAt) || pricing.isSellerPrice) && (
                        <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1">
                            {pricing.hasDiscount && pricing.discountEndsAt && <DiscountCountdown endsAt={pricing.discountEndsAt} />}
                            {pricing.isSellerPrice && (
                                <span className="rounded-md bg-inverse-surface px-1.5 py-0.5 text-[10px] font-semibold text-inverse-on-surface">
                                    Seller price
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-2.5 pt-2">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {item.category?.category_name || "General"}
                    </span>
                    <h2 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-tight text-on-surface" title={item.product_name}>
                        {item.product_name}
                    </h2>
                    {variants && <p className="mt-1 truncate text-[10px] font-medium text-on-surface-variant">{variants}</p>}
                </div>
            </div>

            <div className="mt-1 p-2.5 pt-0">
                {(pricing.hasDiscount || hasTinCart) && (
                    <div className="mb-0.5 flex items-center justify-between gap-1">
                        {pricing.hasDiscount ? (
                            <span className="text-[11px] text-outline line-through">{money(pricing.original)}</span>
                        ) : (
                            <span />
                        )}
                        {hasTinCart && (
                            <span className="rounded-[4px] border border-success/30 bg-success-container px-1 text-[10px] font-medium text-on-success-container">
                                incl. VAT
                            </span>
                        )}
                    </div>
                )}
                <span className="text-[16px] font-extrabold text-on-surface">{money(pricing.price)}</span>

                <StockLines item={item} />
            </div>
        </Link>
    );
}
