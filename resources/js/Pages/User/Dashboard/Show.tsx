import { Head, Link, router } from "@inertiajs/react";
import { Alert, Snackbar } from "@mui/material";
import React from "react";

import CartDrawer from "@/Components/Storefront/CartDrawer";
import UserBottomNav from "@/Components/Navigation/User/UserBottomNav";
import ItemCard from "@/Components/Storefront/ItemCard";
import StorefrontHeader from "@/Components/Storefront/StorefrontHeader";
import StorefrontMenuDrawer from "@/Components/Storefront/StorefrontMenuDrawer";
import PackagingPlaceholder from "@/Components/Shared/PackagingPlaceholder";
import VariantSelector, {
    type VariantSelection,
} from "@/Components/Storefront/VariantSelector";
import {
    ABOVE_USER_BOTTOM_NAV,
    STOCK_TONES,
    STOREFRONT_BG,
    STOREFRONT_BRAND,
    STOREFRONT_GRID,
    STOREFRONT_SHELL,
    formatPrice,
    hasImage,
    resolveImage,
} from "@/Components/Storefront/storefrontConstants";
import { useStorefrontCart } from "@/Components/Storefront/useStorefrontCart";
import {
    boxUnitsFor,
    lineTotal,
    subUnitRates,
    summaryLabel,
} from "@/Components/Storefront/packagingMath";
import { defaultVariant, findVariant } from "@/Components/Storefront/variantSelection";
import {
    PACKAGING_TIER_LABEL,
    classifyPackagingTier,
} from "@/Components/Seller/itemShowHelpers";
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
    related,
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
    // Smaller packs topped onto the chosen one, billed at its rate.
    const [extraBoxes, setExtraBoxes] = React.useState<number>(0);
    const [extraPieces, setExtraPieces] = React.useState<number>(0);
    const [activeImage, setActiveImage] = React.useState<string | null>(
        initial?.image_url ?? item.images[0] ?? null,
    );
    // The masthead search is present here too, but this page has no grid to
    // filter — submitting carries the term back to the catalogue.
    const [search, setSearch] = React.useState<string>("");
    const [menuOpen, setMenuOpen] = React.useState<boolean>(false);

    const submitSearch = (): void => {
        router.get(
            route("storefront.index"),
            search.trim() === "" ? {} : { search: search.trim() },
        );
    };

    const variant = findVariant(
        item.variants,
        selection.color,
        selection.size,
        selection.packaging,
    );

    const maxQuantity = Math.max(1, variant?.available_stock ?? 0);
    const isOutOfStock = (variant?.available_stock ?? 0) <= 0;
    const tone = STOCK_TONES[variant?.stock_status ?? item.stock_status];

    const boxUnits = boxUnitsFor(item.variants, selection.color, selection.size);
    const rates = subUnitRates(variant, boxUnits);
    const tierLabel = (() => {
        const tier = classifyPackagingTier(selection.packaging);
        return tier ? PACKAGING_TIER_LABEL[tier] : (selection.packaging ?? "Unit");
    })();

    // "1 Carton / 20 Boxes / 240 Pieces" — the same order the seller sheet
    // states it in, so the two screens describe a load identically.
    const breakdown = summaryLabel({
        tierLabel,
        count: quantity,
        piecesPerUnit: variant?.pieces_per_unit ?? 0,
        boxUnits,
        extraBoxes,
        extraPieces,
    });

    const total = lineTotal({
        packPrice: variant?.final_price ?? null,
        count: quantity,
        perBox: rates.perBox,
        extraBoxes,
        perPiece: rates.perPiece,
        extraPieces,
    });

    // Keep the stepper within the selected SKU's remaining stock.
    React.useEffect(() => {
        setQuantity((current) => Math.min(current, maxQuantity));
    }, [maxQuantity]);

    // A different pack has different sub-units at a different rate, so the
    // extras cannot carry over — the seller sheet clears them the same way.
    React.useEffect(() => {
        setExtraBoxes(0);
        setExtraPieces(0);
    }, [selection.color, selection.size, selection.packaging]);

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

        addVariant(variant, quantity, { extraBoxes, extraPieces });
    };

    // Nothing to add when every stepper is at zero.
    const hasSelection = quantity > 0 || extraBoxes > 0 || extraPieces > 0;

    return (
        <>
            <Head title={`${item.title} — ${store?.name ?? "Stationery Shop"}`} />

            <div className="min-h-screen" style={{ backgroundColor: STOREFRONT_BG }}>
                <StorefrontHeader
                    store={store}
                    categories={categories}
                    activeCategoryId={item.category?.id ?? null}
                    cartCount={cart.item_count}
                    onOpenCart={openCart}
                    user={auth?.user ?? null}
                    search={search}
                    onSearchChange={setSearch}
                    onSearchSubmit={submitSearch}
                    onSearchClear={() => setSearch("")}
                    onOpenMenu={() => setMenuOpen(true)}
                />

                <main className={`${STOREFRONT_SHELL} py-4 pb-44 md:pb-28`}>
                    {/* ── Breadcrumb ── */}
                    {/* Every crumb is pinned except the product name, which is the
                        one of unbounded length — `truncate` alone does nothing on a
                        flex child, because flex items default to
                        `min-width: auto` and refuse to shrink below their text. */}
                    <nav
                        className="mb-3 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-400"
                        aria-label="Breadcrumb"
                    >
                        <Link
                            href={route("storefront.index")}
                            className="shrink-0 transition-colors hover:text-slate-600"
                        >
                            Shop
                        </Link>
                        {item.category ? (
                            <>
                                <span className="material-symbols-outlined shrink-0 text-[14px]">
                                    chevron_right
                                </span>
                                <Link
                                    href={route("storefront.index", {
                                        category_id: item.category.id,
                                    })}
                                    className="max-w-[40%] shrink-0 truncate transition-colors hover:text-slate-600"
                                >
                                    {item.category.name}
                                </Link>
                            </>
                        ) : null}
                        <span className="material-symbols-outlined shrink-0 text-[14px]">
                            chevron_right
                        </span>
                        <span className="min-w-0 truncate text-slate-600">{item.title}</span>
                    </nav>

                    {/*
                      Both columns carry `min-w-0`.

                      Each one contains a horizontal scroller — the thumbnail rail
                      here, the colour / size / pack rails in VariantSelector — and
                      a grid item defaults to `min-width: auto`, which resolves to
                      the scroller's full content width. With nine variants the
                      column grew past its track, widened the grid, and pushed the
                      page off the side of the window instead of letting the rail
                      scroll inside it.
                    */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* ── Gallery ── */}
                        <section className="min-w-0" aria-label="Product images">
                            <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                                {/* Falls back to the packaging of whichever
                                    pack is currently selected, so the hero
                                    changes with the picker instead of sitting
                                    blank. */}
                                {hasImage(activeImage) ? (
                                    <img
                                        src={resolveImage(activeImage)}
                                        alt={item.title}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <PackagingPlaceholder
                                        packaging={selection.packaging}
                                        label={item.title}
                                        size="lg"
                                        className="border-0"
                                    />
                                )}
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
                            className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4"
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

                            {/* Price of the selected SKU, with what a unit of it
                                amounts to — the seller sheet's headline. */}
                            <div className="mt-3 flex flex-wrap items-baseline gap-2">
                                <span
                                    className="text-[24px] font-extrabold tracking-tight"
                                    style={{ color: STOREFRONT_BRAND }}
                                >
                                    {formatPrice(variant?.final_price ?? null)}
                                </span>
                                {variant?.is_discounted && variant.price !== null ? (
                                    <span className="text-[13px] font-semibold text-slate-400 line-through">
                                        {formatPrice(variant.price)}
                                    </span>
                                ) : null}
                                {breakdown !== "Nothing selected" ? (
                                    <span className="text-[12px] font-semibold text-slate-500">
                                        ({breakdown})
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
                                quantity={quantity}
                                onQuantityChange={setQuantity}
                                extraBoxes={extraBoxes}
                                onExtraBoxesChange={setExtraBoxes}
                                extraPieces={extraPieces}
                                onExtraPiecesChange={setExtraPieces}
                            />

                        </section>
                    </div>

                    {/* ── More from this shelf ── */}
                    {related.length > 0 ? (
                        <section className="mt-6" aria-label="Related products">
                            <div className="mb-3 flex items-baseline justify-between gap-2">
                                <h2 className="min-w-0 truncate text-[15px] font-bold tracking-tight text-gray-900">
                                    {item.category
                                        ? `More in ${item.category.name}`
                                        : "More from this store"}
                                </h2>
                                {item.category ? (
                                    <Link
                                        href={route("storefront.index", {
                                            category_id: item.category.id,
                                        })}
                                        className="shrink-0 text-[11px] font-bold text-[#c2410c] transition-colors hover:text-[#9a3412]"
                                    >
                                        See all
                                    </Link>
                                ) : null}
                            </div>

                            <div className={STOREFRONT_GRID}>
                                {related.map((relatedItem) => (
                                    <ItemCard key={relatedItem.id} item={relatedItem} />
                                ))}
                            </div>
                        </section>
                    ) : null}
                </main>

                {/*
                  Sticky footer, as on the seller's add-to-cart sheet: what is
                  being added stated in every unit it can be, the money it comes
                  to, and the action. The steppers live up in the packaging card,
                  so the decision and its consequence stay on screen together
                  however far the page is scrolled.

                  It sits *above* UserBottomNav rather than beside it. Both were
                  pinned to `bottom-0` with the nav on the higher z-index, so on
                  a phone the nav covered this bar completely and "Add to Cart"
                  could not be seen, let alone pressed. The nav is hidden from
                  `md` up, so the offset is dropped there and the bar returns to
                  the foot of the window.
                */}
                <div
                    className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:!bottom-0"
                    style={{ bottom: ABOVE_USER_BOTTOM_NAV }}
                >
                    <div
                        className={`${STOREFRONT_SHELL} flex items-center justify-between gap-3 py-3`}
                    >
                        <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-slate-500">
                                {breakdown}
                            </p>
                            <p
                                className="text-[16px] font-extrabold tracking-tight"
                                style={{ color: STOREFRONT_BRAND }}
                            >
                                Total: {formatPrice(total)}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={
                                isOutOfStock ||
                                !variant ||
                                !hasSelection ||
                                pendingVariantId === variant.id
                            }
                            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold text-white shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                            style={
                                isOutOfStock || !variant || !hasSelection
                                    ? undefined
                                    : { backgroundColor: STOREFRONT_BRAND }
                            }
                        >
                            {variant && pendingVariantId === variant.id ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                            ) : (
                                <span className="material-symbols-outlined text-[20px]">
                                    shopping_cart
                                </span>
                            )}
                            {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                        </button>
                    </div>
                </div>
            </div>

            <UserBottomNav
                cartCount={cart.item_count}
                onOpenCart={openCart}
                isAuthenticated={Boolean(auth?.user)}
            />

            <StorefrontMenuDrawer
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                categories={categories}
                activeCategoryId={item.category?.id ?? null}
                onSelectCategory={(categoryId) =>
                    router.get(
                        route("storefront.index"),
                        categoryId === null ? {} : { category_id: categoryId },
                    )
                }
                cartCount={cart.item_count}
                onOpenCart={openCart}
                user={auth?.user ?? null}
            />

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
