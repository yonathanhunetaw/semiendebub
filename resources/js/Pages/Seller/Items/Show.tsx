import {
    SELLER_BRAND_DARK,
    SellerHeader,
    sellerImage,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import { Box, Button, Stack } from "@mui/material";
import React from "react";

import AddToCartSheet from "@/Components/Seller/AddToCartSheet";
import ImageViewerDialog from "@/Components/Seller/ImageViewerDialog";
import ItemImageGallery from "@/Components/Seller/ItemImageGallery";
import ItemInfoCard from "@/Components/Seller/ItemInfoCard";
import ItemStockCard from "@/Components/Seller/ItemStockCard";
import {
    availablePackaging,
    availableSizes,
    findVariant,
    firstVariant,
    orderedPackagingTiers,
    summarizeBreakdown,
    totalFromBreakdown,
    unitsPerTier,
    uniqueValues,
    visiblePrice,
    type OpenCart,
    type PackagingBreakdownLine,
    type PackagingTier,
    type PricingMode,
    type SellerItem,
    type SellerVariantData,
} from "@/Components/Seller/itemShowHelpers";
import type { PackagingTierOption } from "@/Components/Seller/PackagingSelector";

export default function Show({
    item,
    allImages = [],
    variantData = [],
    displayPrice,
    openCarts = [],
    selectedCartId,
}: {
    item: SellerItem;
    allImages?: string[];
    variantData?: SellerVariantData[];
    displayPrice?: number | null;
    openCarts?: OpenCart[];
    selectedCartId?: number | string | null;
}) {
    const initialVariant = firstVariant(variantData) as
        | SellerVariantData
        | undefined;

    // Pricing mode (normal vs hidden seller-price view)
    const [pricingMode, setPricingMode] = React.useState<PricingMode>("normal");
    const [priceTapCount, setPriceTapCount] = React.useState(0);

    // Variant selections
    const [selectedColor, setSelectedColor] = React.useState(
        initialVariant?.color ?? "",
    );
    const [selectedSize, setSelectedSize] = React.useState(
        initialVariant?.size ?? "",
    );

    // Hierarchical packaging selection: which tier tab, and counts within it
    const [selectedTier, setSelectedTier] = React.useState<PackagingTier | null>(
        null,
    );
    const [tierCount, setTierCount] = React.useState(1);
    const [extraPieces, setExtraPieces] = React.useState(0);

    // Images
    const [selectedMainImage, setSelectedMainImage] = React.useState<
        string | null
    >(null);
    const [variantImageViewerOpen, setVariantImageViewerOpen] =
        React.useState(false);
    const [selectedVariantImage, setSelectedVariantImage] = React.useState<
        string | null
    >(null);
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [imageViewerOpen, setImageViewerOpen] = React.useState(false);
    const [viewerZoom, setViewerZoom] = React.useState(1);
    const [showAllThumbs, setShowAllThumbs] = React.useState(false);

    // Cart selection
    const [selectedCart, setSelectedCart] = React.useState(
        selectedCartId
            ? String(selectedCartId)
            : openCarts[0]?.id
              ? String(openCarts[0].id)
              : "",
    );

    const colors = uniqueValues(variantData.map((entry) => entry.color));
    const sizes = availableSizes(variantData, selectedColor);
    const packagingOptionsRaw = availablePackaging(
        variantData,
        selectedColor,
        selectedSize,
    );

    // Group raw packaging strings into Piece / Packet / Carton tiers, each
    // carrying its own unit price and how many base pieces it contains.
    const packagingOptions: PackagingTierOption[] = React.useMemo(() => {
        return orderedPackagingTiers(packagingOptionsRaw).map(({ tier, raw }) => {
            const tierVariant = findVariant(
                variantData,
                selectedColor,
                selectedSize,
                raw,
            );
            return {
                tier,
                raw,
                unitPrice: visiblePrice(tierVariant, pricingMode),
                unitsPerTier: unitsPerTier(
                    variantData,
                    selectedColor,
                    selectedSize,
                    raw,
                ),
            };
        });
    }, [packagingOptionsRaw, variantData, selectedColor, selectedSize, pricingMode]);

    // Auto-select the first available tier whenever the option list changes
    React.useEffect(() => {
        if (packagingOptions.length === 0) {
            setSelectedTier(null);
            return;
        }
        if (!packagingOptions.some((o) => o.tier === selectedTier)) {
            setSelectedTier(packagingOptions[0].tier);
            setTierCount(1);
            setExtraPieces(0);
        }
    }, [packagingOptions, selectedTier]);

    const selectedPackagingRaw =
        packagingOptions.find((o) => o.tier === selectedTier)?.raw ?? "";

    // The "primary" variant matching color/size/packaging — used for stock,
    // images, and id when posting to the cart.
    const variant = findVariant(
        variantData,
        selectedColor,
        selectedSize,
        selectedPackagingRaw,
    );

    const pieceOption = packagingOptions.find((o) => o.tier === "piece");
    const piecePrice = pieceOption?.unitPrice ?? null;

    // MAIN PRODUCT IMAGES (never change with variant)
    const mainImages = React.useMemo(() => {
        return allImages
            .map((image) => {
                if (
                    typeof image === "string" &&
                    (image.startsWith("http") || image.startsWith("//"))
                ) {
                    return image;
                }
                return sellerImage(image);
            })
            .filter(Boolean) as string[];
    }, [allImages]);

    // VARIANT-SPECIFIC IMAGES (change when variant changes)
    const variantImages = React.useMemo(() => {
        if (variant?.images && variant.images.length > 0) {
            return variant.images
                .map((image) => {
                    if (
                        typeof image === "string" &&
                        (image.startsWith("http") || image.startsWith("//"))
                    ) {
                        return image;
                    }
                    return sellerImage(image);
                })
                .filter(Boolean) as string[];
        }
        return [];
    }, [variant?.id, variant?.images]);

    const activeMainImage = selectedMainImage || mainImages[0] || null;
    const activeVariantImage = selectedVariantImage || variantImages[0] || null;
    const displayedThumbs = showAllThumbs
        ? variantImages
        : variantImages.slice(0, 8);

    const priceTapped = () => {
        const next = priceTapCount + 1;
        if (next >= 3) {
            setPricingMode((m) => (m === "normal" ? "seller" : "normal"));
            setPriceTapCount(0);
        } else {
            setPriceTapCount(next);
        }
    };

    const openImageViewer = () => {
        setViewerZoom(1);
        setImageViewerOpen(true);
    };

    const openVariantImageViewer = () => {
        setViewerZoom(1);
        setVariantImageViewerOpen(true);
    };

    const selectedPrice = visiblePrice(variant, pricingMode);
    const perPiece =
        variant?.quantity && selectedPrice != null && variant.quantity > 0
            ? selectedPrice / variant.quantity
            : null;
    const isCartoon = (variant?.packaging ?? "")
        .toLowerCase()
        .includes("cartoon");
    const perPacket = isCartoon && selectedPrice != null ? selectedPrice : null;

    // --- Hierarchical packaging breakdown for the cart total ---
    const breakdownLines: PackagingBreakdownLine[] = React.useMemo(() => {
        const lines: PackagingBreakdownLine[] = [];
        const selected = packagingOptions.find((o) => o.tier === selectedTier);
        if (selected) {
            lines.push({
                tier: selected.tier,
                raw: selected.raw,
                label: selected.tier === "cartoon" ? "Carton" : selected.tier === "packet" ? "Packet" : "Piece",
                count: tierCount,
                unitPrice: selected.unitPrice,
            });
        }
        if (selectedTier && selectedTier !== "piece" && extraPieces > 0) {
            lines.push({
                tier: "piece",
                raw: pieceOption?.raw ?? "",
                label: "Piece",
                count: extraPieces,
                unitPrice: piecePrice,
            });
        }
        return lines;
    }, [packagingOptions, selectedTier, tierCount, extraPieces, piecePrice, pieceOption]);

    const totalPrice = totalFromBreakdown(breakdownLines);
    const totalLabel = summarizeBreakdown(breakdownLines) || "No items selected";

    const { data, setData, post, processing } = useForm({
        variant_id: variant?.id ?? 0,
        quantity: tierCount,
        extra_pieces: extraPieces,
        price: totalPrice || selectedPrice || displayPrice || 0,
    });

    React.useEffect(() => {
        setData("price", totalPrice || selectedPrice || displayPrice || 0);
        setData("variant_id", variant?.id ?? 0);
        setData("quantity", tierCount);
        setData("extra_pieces", extraPieces);
    }, [displayPrice, selectedPrice, totalPrice, tierCount, extraPieces, setData, variant?.id]);

    const chooseColor = (color: string) => {
        const nextSizes = availableSizes(variantData, color);
        const nextSize = nextSizes[0] ?? "";
        setSelectedColor(color);
        setSelectedSize(nextSize);
        setSelectedTier(null);
        setTierCount(1);
        setExtraPieces(0);
        setSelectedVariantImage(null);
    };

    const chooseSize = (size: string) => {
        setSelectedSize(size);
        setSelectedTier(null);
        setTierCount(1);
        setExtraPieces(0);
        setSelectedVariantImage(null);
    };

    const handleSelectTier = (tier: PackagingTier) => {
        setSelectedTier(tier);
        setTierCount(1);
        setExtraPieces(0);
        setSelectedVariantImage(null);
    };

    const addToCart = () => {
        if (!selectedCart) {
            return;
        }

        post(route("seller.carts.items.store", selectedCart), {
            preserveScroll: true,
            onSuccess: () => setSheetOpen(false),
        });
    };

    return (
        <>
            <Head title={item.product_name} />

            <SellerHeader
                title={item.product_name}
                backHref={
                    selectedCart
                        ? route("seller.carts.show", selectedCart)
                        : route("seller.dashboard")
                }
                subtitle={
                    selectedCart ? `Adding into Cart #${selectedCart}` : undefined
                }
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    <ItemImageGallery
                        productName={item.product_name}
                        images={mainImages}
                        activeImage={activeMainImage}
                        onSelectImage={setSelectedMainImage}
                        onOpenViewer={openImageViewer}
                    />

                    <ItemInfoCard
                        item={item}
                        variant={variant}
                        selectedPrice={selectedPrice}
                        displayPrice={displayPrice}
                        pricingMode={pricingMode}
                        onPriceTap={priceTapped}
                    />

                    <ItemStockCard
                        stock={variant?.stock ?? 0}
                        unitsInPack={variant?.quantity ?? 1}
                        perPiece={perPiece}
                        perPacket={perPacket}
                    />

                    <Stack direction="row" spacing={1.5} sx={{ pb: 1 }}>
                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<ShoppingBagRoundedIcon />}
                            onClick={() => setSheetOpen(true)}
                            sx={{
                                borderRadius: 3,
                                textTransform: "none",
                                bgcolor: SELLER_BRAND_DARK,
                                "&:hover": { bgcolor: SELLER_BRAND_DARK },
                            }}
                        >
                            Add to Cart
                        </Button>
                        <Button
                            fullWidth
                            component={Link}
                            href={route("seller.carts.index")}
                            variant="outlined"
                            sx={{ borderRadius: 3, textTransform: "none" }}
                        >
                            View Carts
                        </Button>
                    </Stack>
                </Stack>
            </Box>

            {/* Main product image viewer (no thumbnail strip) */}
            <ImageViewerDialog
                open={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                productName={item.product_name}
                activeImage={activeMainImage}
                zoom={viewerZoom}
                onZoomChange={setViewerZoom}
            />

            {/* Variant image viewer (with thumbnail strip) */}
            <ImageViewerDialog
                open={variantImageViewerOpen}
                onClose={() => setVariantImageViewerOpen(false)}
                productName={item.product_name}
                activeImage={activeVariantImage}
                zoom={viewerZoom}
                onZoomChange={setViewerZoom}
                thumbnails={variantImages}
                displayedThumbnails={displayedThumbs}
                selectedThumbnail={selectedVariantImage}
                onSelectThumbnail={setSelectedVariantImage}
                showAllThumbs={showAllThumbs}
                onToggleShowAllThumbs={() => setShowAllThumbs((v) => !v)}
            />

            <AddToCartSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                item={item}
                variant={variant}
                activeVariantImage={activeVariantImage}
                hasVariantImages={variantImages.length > 0}
                onOpenVariantImageViewer={openVariantImageViewer}
                selectedPrice={selectedPrice}
                displayPrice={displayPrice}
                selectedColor={selectedColor}
                selectedSize={selectedSize}
                colors={colors}
                sizes={sizes}
                onChooseColor={chooseColor}
                onChooseSize={chooseSize}
                packagingOptions={packagingOptions}
                selectedTier={selectedTier}
                onSelectTier={handleSelectTier}
                tierCount={tierCount}
                onTierCountChange={setTierCount}
                extraPieces={extraPieces}
                onExtraPiecesChange={setExtraPieces}
                piecePrice={piecePrice}
                openCarts={openCarts}
                selectedCart={selectedCart}
                onSelectCart={setSelectedCart}
                totalLabel={totalLabel}
                totalPrice={totalPrice}
                processing={processing}
                onAddToCart={addToCart}
            />
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout children={page} />;
