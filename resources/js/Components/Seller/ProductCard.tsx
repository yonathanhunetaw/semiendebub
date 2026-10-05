import { Link } from "@inertiajs/react";
import React from "react";
import { type CatalogItem, cardPricing, money } from "@/Components/Seller/catalogPricing";

/** Stored paths come back absolute from ImageResolver; this covers stragglers. */
function imageUrl(path?: string): string | null {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const base = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${base}/${path.replace(/^\//, "")}`;
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
 * One catalogue card (Store page and search results): image with stock pill,
 * discount badge, countdown and seller-price tag; category, name, price with
 * the struck-through original and "incl. VAT" for individual carts; stock.
 */
export default function ProductCard({ item, hasTinCart, topCartIsIndividual }: { item: CatalogItem; hasTinCart: boolean; topCartIsIndividual: boolean }) {
    const pricing = cardPricing(item, topCartIsIndividual);
    const src = imageUrl(item.image_urls?.[0]);
    const [loaded, setLoaded] = React.useState(false);
    const [broken, setBroken] = React.useState(!src);
    const stock = item.store_stock;
    const outOfStock = stock !== undefined && stock !== null && stock <= 0;

    return (
        <Link
            href={route("seller.items.show", item.id)}
            className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md"
        >
            <div>
                <div className="relative aspect-square w-full overflow-hidden bg-surface-container-low">
                    {broken ? (
                        <div className="flex h-full w-full items-center justify-center text-outline">
                            <span className="material-symbols-outlined text-[40px]">image</span>
                        </div>
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
                                outOfStock
                                    ? "border-warning/30 bg-warning-container text-on-warning-container"
                                    : "border-success/30 bg-success-container text-on-success-container"
                            }`}
                        >
                            {outOfStock ? "Out of stock" : "In stock"}
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

                {stock !== undefined && stock !== null && (
                    <div className="mt-2 border-t border-outline-variant pt-2 text-[11px] font-medium">
                        {outOfStock ? (
                            <span className="font-bold text-warning">Out of stock</span>
                        ) : (
                            <span className="text-on-surface-variant">
                                Stock: <strong className="font-semibold text-on-surface">{stock.toLocaleString()}</strong>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
}
