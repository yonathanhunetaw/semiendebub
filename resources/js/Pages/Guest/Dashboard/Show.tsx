import { Head, Link } from "@inertiajs/react";
import { Alert, Snackbar } from "@mui/material";
import React from "react";

import CartDrawer from "@/Components/Storefront/CartDrawer";
import StorefrontHeader from "@/Components/Storefront/StorefrontHeader";
import VariantSelector, {
    type VariantSelection,
} from "@/Components/Storefront/VariantSelector";
import {
    STOCK_TONES,
    STOREFRONT_BG,
    STOREFRONT_BRAND,
    formatPrice,
    resolveImage,
} from "@/Components/Storefront/storefrontConstants";
import { useStorefrontCart } from "@/Components/Storefront/useStorefrontCart";
import { defaultVariant, findVariant } from "@/Components/Storefront/variantSelection";
import type { StorefrontShowPageProps } from "@/types/storefront";

/**
 * Product detail page.
 *
 * Mirrors Seller/Items/Show: a gallery on one side, a colour → size → pack
 * drill-down on the other, resolving to one SKU that the shopper adds to their
 * cart. Simplified for buyers — no pricing modes, no cart picker, no manifest.
 */
export default function StorefrontItemShow({
    store,
    item,
    categories,
    cart,
    auth,
    flash,
}: StorefrontShowPageProps): React.ReactElement {
    const {
        cartOpen,
        openCart,
        closeCart,
        isMutating,
        pendingVariantId,
        addVariant,
        updateQuantity,
        removeLine,
        checkout,
        notice,
        dismissNotice,
    } = useStorefrontCart(flash);

    // Land on the cheapest in-stock SKU, as a shopper would expect.
    const initial = defaultVariant(item.variants);

    const [selection, setSelection] = React.useState<VariantSelection>({
        color: initial?.color ?? null,
        size: initial?.size ?? null,
        packaging: initial?.packaging ?? null,
    });
    const [quantity, setQuantity] = React.useState<number>(1);
    const [activeImage, setActiveImage] = React.useState<string | null>(
        initial?.image_url ?? item.images[0] ?? null,
    );

    const variant = findVariant(
        item.variants,
        selection.color,
        selection.size,
        selection.packaging,
    );

    const maxQuantity = Math.max(1, variant?.available_stock ?? 0);
    const isOutOfStock = (variant?.available_stock ?? 0) <= 0;
    const tone = STOCK_TONES[variant?.stock_status ?? item.stock_status];

    // Keep the stepper within the selected SKU's remaining stock.
    React.useEffect(() => {
        setQuantity((current) => Math.min(current, maxQuantity));
    }, [maxQuantity]);

    // Follow the selection with the gallery when the SKU has its own photo.
    React.useEffect(() => {
        if (variant?.image_url) {
            setActiveImage(variant.image_url);
        }
    }, [variant?.image_url]);

    // Variant photography augments the product gallery.
    const gallery = React.useMemo<string[]>(() => {
        const combined = [...item.images, ...item.variants.flatMap((v) => v.images)];
        return Array.from(new Set(combined.filter(Boolean)));
    }, [item.images, item.variants]);

    const handleAdd = (): void => {
        if (!variant || isOutOfStock) {
            return;
        }
        addVariant(variant, quantity);
    };

    const step = (delta: number): void => {
        setQuantity((current) =>
            Math.min(maxQuantity, Math.max(1, current + delta)),
        );
    };

    return (
        <>
            <Head title={`${item.title} — ${store?.name ?? "Stationery Shop"}`}>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="min-h-screen" style={{ backgroundColor: STOREFRONT_BG }}>
                <StorefrontHeader
                    store={store}
                    categories={categories}
                    activeCategoryId={item.category?.id ?? null}
                    cartCount={cart.item_count}
                    onOpenCart={openCart}
                    user={auth?.user ?? null}
                />

                <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                    {/* ── Breadcrumb ── */}
                    <nav
                        className="mb-3 flex items-center gap-1 text-[11px] font-semibold text-slate-400"
                        aria-label="Breadcrumb"
                    >
                        <Link
                            href={route("storefront.index")}
                            className="transition-colors hover:text-slate-600"
                        >
                            Shop
                        </Link>
                        {item.category ? (
                            <>
                                <span className="material-symbols-outlined text-[14px]">
                                    chevron_right
                                </span>
                                <Link
                                    href={route("storefront.index", {
                                        category_id: item.category.id,
                                    })}
                                    className="transition-colors hover:text-slate-600"
                                >
                                    {item.category.name}
                                </Link>
                            </>
                        ) : null}
                        <span className="material-symbols-outlined text-[14px]">
                            chevron_right
                        </span>
                        <span className="truncate text-slate-600">{item.title}</span>
                    </nav>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* ── Gallery ── */}
                        <section aria-label="Product images">
                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                                <img
                                    src={resolveImage(activeImage)}
                                    alt={item.title}
                                    className="aspect-square w-full object-cover"
                                />
                            </div>

                            {gallery.length > 1 ? (
                                <div className="no-scrollbar scroll-smooth mt-2 flex gap-2 overflow-x-auto">
                                    {gallery.map((image) => (
                                        <button
                                            key={image}
                                            type="button"
                                            onClick={() => setActiveImage(image)}
                                            aria-label="Show this image"
                                            className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                                                image === activeImage
                                                    ? "border-[#c2410c]"
                                                    : "border-slate-200 hover:border-slate-300"
                                            }`}
                                        >
                                            <img
                                                src={image}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </section>

                        {/* ── Buy box ── */}
                        <section
                            className="rounded-2xl border border-slate-200/80 bg-white p-4"
                            aria-label="Product options"
                        >
                            {item.category ? (
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {item.category.name}
                                </p>
                            ) : null}

                            <h1 className="mt-1 text-[19px] font-extrabold leading-tight tracking-tight text-gray-900">
                                {item.title}
                            </h1>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.className}`}
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full ${tone.dotClassName}`}
                                    />
                                    {tone.label}
                                </span>
                                {variant?.sku ? (
                                    <span className="font-mono text-[10px] text-slate-400">
                                        {variant.sku}
                                    </span>
                                ) : null}
                            </div>

                            {/* Price of the currently selected SKU */}
                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-[24px] font-extrabold tracking-tight text-gray-900">
                                    {formatPrice(variant?.final_price ?? null)}
                                </span>
                                {variant?.is_discounted && variant.price !== null ? (
                                    <span className="text-[13px] font-semibold text-slate-400 line-through">
                                        {formatPrice(variant.price)}
                                    </span>
                                ) : null}
                                {variant && variant.pieces_per_unit > 0 ? (
                                    <span className="text-[11px] font-semibold text-slate-400">
                                        · {variant.pieces_per_unit} pcs per unit
                                    </span>
                                ) : null}
                            </div>

                            {item.description ? (
                                <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500">
                                    {item.description}
                                </p>
                            ) : null}

                            <div className="my-3.5 h-px bg-slate-100" />

                            {/* ── Variant pickers ── */}
                            <VariantSelector
                                variants={item.variants}
                                selection={selection}
                                onChange={setSelection}
                            />

                            <div className="my-3.5 h-px bg-slate-100" />

                            {/* ── Quantity + add to cart ── */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50">
                                    <button
                                        type="button"
                                        onClick={() => step(-1)}
                                        disabled={isOutOfStock || quantity <= 1}
                                        aria-label="Decrease quantity"
                                        className="flex h-10 w-9 items-center justify-center rounded-l-xl text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">
                                            remove
                                        </span>
                                    </button>
                                    <span
                                        aria-live="polite"
                                        className="w-8 text-center text-[13px] font-bold text-gray-900"
                                    >
                                        {quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => step(1)}
                                        disabled={isOutOfStock || quantity >= maxQuantity}
                                        aria-label="Increase quantity"
                                        className="flex h-10 w-9 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">
                                            add
                                        </span>
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleAdd}
                                    disabled={
                                        isOutOfStock ||
                                        !variant ||
                                        pendingVariantId === variant.id
                                    }
                                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                    style={
                                        isOutOfStock || !variant
                                            ? undefined
                                            : { backgroundColor: STOREFRONT_BRAND }
                                    }
                                >
                                    {variant && pendingVariantId === variant.id ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                                    ) : (
                                        <span className="material-symbols-outlined text-[18px]">
                                            add_shopping_cart
                                        </span>
                                    )}
                                    {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                                </button>
                            </div>

                            {!isOutOfStock && variant ? (
                                <p className="mt-2 text-[11px] font-medium text-slate-400">
                                    {variant.available_stock} unit
                                    {variant.available_stock === 1 ? "" : "s"} available
                                </p>
                            ) : null}
                        </section>
                    </div>
                </main>
            </div>

            <CartDrawer
                open={cartOpen}
                onClose={closeCart}
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeLine}
                onCheckout={checkout}
                isBusy={isMutating}
                isAuthenticated={Boolean(auth?.user)}
            />

            <Snackbar
                open={notice !== null}
                autoHideDuration={3000}
                onClose={dismissNotice}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={flash?.error ? "error" : "success"}
                    variant="filled"
                    onClose={dismissNotice}
                    sx={{ fontSize: 13, fontWeight: 600 }}
                >
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}
