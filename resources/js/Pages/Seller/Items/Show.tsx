import {
    SELLER_BRAND_DARK,
    SellerCard,
    SellerHeader,
    sellerImage,
    sellerPrice,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import {
    Box,
    Button,
    Chip,
    Dialog,
    Divider,
    Drawer,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import React from "react";

interface SellerVariantData {
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

interface SellerItem {
    id: number;
    product_name: string;
    product_description?: string | null;
}

interface OpenCart {
    id: number;
    customer?: {
        first_name?: string;
        last_name?: string;
    } | null;
}

function firstVariant(variants: SellerVariantData[]) {
    return variants[0];
}

function uniqueValues(values: Array<string | null | undefined>) {
    return Array.from(
        new Set(values.filter((value): value is string => Boolean(value))),
    );
}

function availableSizes(variants: SellerVariantData[], color: string) {
    return uniqueValues(
        variants
            .filter((variant) => variant.color === color)
            .map((variant) => variant.size),
    );
}

function availablePackaging(
    variants: SellerVariantData[],
    color: string,
    size: string,
) {
    const filtered = variants.filter(
        (variant) => variant.color === color && variant.size === size
    );
    return uniqueValues(filtered.map((variant) => variant.packaging));
}

function findVariant(
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

function visiblePrice(
    variant?: SellerVariantData,
    mode: "normal" | "seller" = "normal",
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
    const theme = useTheme();
    const initialVariant = firstVariant(variantData) as
        | SellerVariantData
        | undefined;

    // State for pricing mode
    const [pricingMode, setPricingMode] = React.useState<"normal" | "seller">(
        "normal",
    );
    
    // State for variant selections
    const [selectedColor, setSelectedColor] = React.useState(
        initialVariant?.color ?? "",
    );
    const [selectedSize, setSelectedSize] = React.useState(
        initialVariant?.size ?? "",
    );
    const [selectedPackaging, setSelectedPackaging] = React.useState(
        initialVariant?.packaging ?? "",
    );

    // State for images - MAIN product images (don't change with variant)
    const [selectedMainImage, setSelectedMainImage] = React.useState<string | null>(null);
    const [variantImageViewerOpen, setVariantImageViewerOpen] = React.useState(false);
    const [selectedVariantImage, setSelectedVariantImage] = React.useState<string | null>(null);
    
    // State for UI
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [priceTapCount, setPriceTapCount] = React.useState(0);
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

    // Get current variant based on selections
    const variant = findVariant(
        variantData,
        selectedColor,
        selectedSize,
        selectedPackaging,
    );

    // MAIN PRODUCT IMAGES (never change with variant)
    const mainImages = React.useMemo(() => {
        return allImages
            .map((image) => {
                if (typeof image === "string" && (image.startsWith("http") || image.startsWith("//"))) {
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
                    if (typeof image === "string" && (image.startsWith("http") || image.startsWith("//"))) {
                        return image;
                    }
                    return sellerImage(image);
                })
                .filter(Boolean) as string[];
        }
        return [];
    }, [variant?.id, variant?.images]);

    // Active main image (for the top gallery)
    const activeMainImage = selectedMainImage || mainImages[0] || null;
    
    // Active variant image (for the drawer header)
    const activeVariantImage = selectedVariantImage || variantImages[0] || null;
    
    // Displayed thumbnails for the image viewer
    const displayedThumbs = showAllThumbs ? variantImages : variantImages.slice(0, 8);

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
    const isCartoon = (variant?.packaging ?? "").toLowerCase().includes("cartoon");
    const perPacket = isCartoon && selectedPrice != null ? selectedPrice : null;

    const { data, setData, post, processing } = useForm({
        variant_id: variant?.id ?? 0,
        quantity: 1,
        price: selectedPrice ?? displayPrice ?? 0,
    });

    React.useEffect(() => {
        setData("price", selectedPrice ?? displayPrice ?? 0);
        setData("variant_id", variant?.id ?? 0);
    }, [displayPrice, selectedPrice, setData, variant?.id]);

    const colors = uniqueValues(variantData.map((entry) => entry.color));
    const sizes = availableSizes(variantData, selectedColor);
    const packagingOptions = availablePackaging(
        variantData,
        selectedColor,
        selectedSize,
    );

    const chooseColor = (color: string) => {
        const nextSizes = availableSizes(variantData, color);
        const nextSize = nextSizes[0] ?? "";
        const nextPackaging = availablePackaging(variantData, color, nextSize)[0] ?? "";
        setSelectedColor(color);
        setSelectedSize(nextSize);
        setSelectedPackaging(nextPackaging);
        setSelectedVariantImage(null);
    };

    const chooseSize = (size: string) => {
        const nextPackagingOptions = availablePackaging(variantData, selectedColor, size);
        const nextPackaging = nextPackagingOptions.includes(selectedPackaging) 
            ? selectedPackaging 
            : nextPackagingOptions[0] ?? "";
        setSelectedSize(size);
        setSelectedPackaging(nextPackaging);
        setSelectedVariantImage(null);
    };

    const choosePackaging = (packaging: string) => {
        setSelectedPackaging(packaging);
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
                        : route("seller.items.index")
                }
                subtitle={
                    selectedCart
                        ? `Adding into Cart #${selectedCart}`
                        : undefined
                }
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    {/* Main Product Image Gallery */}
                    <SellerCard sx={{ p: 0, overflow: "hidden" }}>
                        <Box
                            sx={{
                                height: 280,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: theme.palette.mode === 'dark' ? '#1a1a1a' : '#fff7ed',
                                cursor: activeMainImage ? "zoom-in" : "default",
                            }}
                            onClick={() => activeMainImage && openImageViewer()}
                        >
                            {activeMainImage ? (
                                <Box
                                    component="img"
                                    src={activeMainImage}
                                    alt={item.product_name}
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                    }}
                                />
                            ) : (
                                <Typography color="text.secondary">
                                    No images available.
                                </Typography>
                            )}
                        </Box>

                        {/* Main Gallery Thumbnails (Product images only) */}
                        {mainImages.length > 1 && (
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ p: 1.5, overflowX: "auto" }}
                            >
                                {mainImages.map((image) => (
                                    <Box
                                        key={image}
                                        component="button"
                                        type="button"
                                        onClick={() => setSelectedMainImage(image)}
                                        sx={{
                                            width: 64,
                                            height: 64,
                                            p: 0,
                                            border:
                                                activeMainImage === image
                                                    ? `2px solid ${SELLER_BRAND_DARK}`
                                                    : "1px solid rgba(148, 163, 184, 0.24)",
                                            borderRadius: 2,
                                            overflow: "hidden",
                                            background: theme.palette.mode === 'dark' ? '#333' : '#fff',
                                            flexShrink: 0,
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                            "&:hover": {
                                                transform: "scale(1.05)",
                                            },
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={image}
                                            alt={item.product_name}
                                            loading="eager"
                                            sx={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "contain",
                                            }}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </SellerCard>

                    {/* Product Info Card */}
                    <SellerCard>
                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                Product
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {item.product_name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {item.product_description ||
                                    "Choose a variant and add it to a customer cart."}
                            </Typography>
                            <Box
                                onClick={priceTapped}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    mt: 0.5,
                                    cursor: "pointer",
                                    userSelect: "none",
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        color: "error.main",
                                        fontSize: 28,
                                    }}
                                >
                                    {sellerPrice(selectedPrice ?? displayPrice ?? null)}
                                </Typography>
                                {variant?.discount_price != null &&
                                    variant?.price != null &&
                                    variant.price !== variant.discount_price && (
                                        <Typography
                                            variant="body2"
                                            sx={{ color: "text.disabled", textDecoration: "line-through" }}
                                        >
                                            {sellerPrice(variant.price)}
                                        </Typography>
                                    )}
                                {variant?.discount_price != null &&
                                    variant?.price != null &&
                                    variant.price !== variant.discount_price && (
                                        <Chip
                                            label={`-${Math.round(((variant.price - variant.discount_price) / variant.price) * 100)}%`}
                                            size="small"
                                            sx={{ bgcolor: "#EAB308", color: "#fff", fontWeight: 700, fontSize: "0.7rem" }}
                                        />
                                    )}
                                {pricingMode === "seller" && (
                                    <Chip
                                        label="Seller"
                                        size="small"
                                        sx={{ bgcolor: SELLER_BRAND_DARK, color: "#fff", fontWeight: 700, fontSize: "0.7rem" }}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </SellerCard>

                    {/* Stock Info Card */}
                    <SellerCard>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            spacing={2}
                        >
                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Stock
                                </Typography>
                                <Typography sx={{ fontWeight: 700 }}>
                                    {variant?.stock ?? 0}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Units in pack
                                </Typography>
                                <Typography sx={{ fontWeight: 700 }}>
                                    {variant?.quantity ?? 1}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Per unit
                                </Typography>
                                <Typography sx={{ fontWeight: 700 }}>
                                    {sellerPrice(perPiece)}
                                </Typography>
                            </Box>
                            {perPacket != null && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary">
                                        Per packet
                                    </Typography>
                                    <Typography sx={{ fontWeight: 700 }}>
                                        {sellerPrice(perPacket)}
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </SellerCard>

                    {/* Action Buttons */}
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

            {/* Main Image Viewer Dialog (for product images) */}
            <Dialog
                open={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                fullScreen
                PaperProps={{ sx: { bgcolor: "#000", display: "flex", flexDirection: "column" } }}
            >
                <Box sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}>
                    <IconButton onClick={() => setImageViewerOpen(false)} sx={{ color: "#fff" }}>
                        <CloseRoundedIcon />
                    </IconButton>
                </Box>
                <Box
                    sx={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {activeMainImage && (
                        <Box
                            component="img"
                            src={activeMainImage}
                            alt={item.product_name}
                            sx={{
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                            }}
                        />
                    )}
                </Box>
            </Dialog>

            {/* Variant Image Viewer Dialog (for variant images) */}
            <Dialog
                open={variantImageViewerOpen}
                onClose={() => setVariantImageViewerOpen(false)}
                fullScreen
                PaperProps={{ sx: { bgcolor: "#000", display: "flex", flexDirection: "column" } }}
            >
                {/* Toolbar */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2 }}>
                    <IconButton onClick={() => setShowAllThumbs(!showAllThumbs)} sx={{ color: "#fff" }}>
                        {showAllThumbs ? "Show Less" : "Show All"}
                    </IconButton>
                    <Box sx={{ display: "flex", gap: 2 }}>
                        <IconButton onClick={() => setViewerZoom(z => Math.max(0.5, z - 0.25))} sx={{ color: "#fff" }}>
                            <ZoomOutRoundedIcon />
                        </IconButton>
                        <Typography sx={{ color: "#fff", alignSelf: "center" }}>{Math.round(viewerZoom * 100)}%</Typography>
                        <IconButton onClick={() => setViewerZoom(z => Math.min(3, z + 0.25))} sx={{ color: "#fff" }}>
                            <ZoomInRoundedIcon />
                        </IconButton>
                    </Box>
                    <IconButton onClick={() => setVariantImageViewerOpen(false)} sx={{ color: "#fff" }}>
                        <CloseRoundedIcon />
                    </IconButton>
                </Box>

                {/* Thumbnail strip */}
                {variantImages.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: showAllThumbs ? "wrap" : "nowrap", gap: 1.5, overflowX: showAllThumbs ? "unset" : "auto", pb: 1, px: 2 }}>
                        {displayedThumbs.map((img, i) => (
                            <Box
                                key={i}
                                component="img"
                                src={img}
                                onClick={() => setSelectedVariantImage(img)}
                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                    e.currentTarget.src = "/images/defaults/no-image.png";
                                }}
                                sx={{
                                    width: 64,
                                    height: 64,
                                    minWidth: 64,
                                    borderRadius: 1.5,
                                    cursor: "pointer",
                                    border: "2px solid",
                                    borderColor: selectedVariantImage === img ? "primary.main" : "transparent",
                                    bgcolor: "background.paper",
                                    objectFit: "cover",
                                    transition: "0.2s",
                                    "&:hover": {
                                        transform: "scale(1.05)",
                                        borderColor: "primary.light",
                                    },
                                }}
                            />
                        ))}
                    </Box>
                )}

                {/* Zoomable image */}
                <Box
                    sx={{
                        flex: 1,
                        overflow: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                    onDoubleClick={() => setViewerZoom((z) => z < 2 ? 2 : 1)}
                >
                    {activeVariantImage && (
                        <Box
                            component="img"
                            src={activeVariantImage}
                            alt={item.product_name}
                            sx={{
                                maxWidth: "none",
                                width: `${viewerZoom * 100}%`,
                                maxHeight: viewerZoom === 1 ? "100%" : "none",
                                objectFit: "contain",
                                transition: "width 0.2s ease",
                            }}
                        />
                    )}
                </Box>
            </Dialog>

            {/* Add to Cart Bottom Sheet with Dark Mode */}
            <Drawer
                anchor="bottom"
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                PaperProps={{
                    sx: {
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        width: "min(100%, 480px)",
                        mx: "auto",
                        maxHeight: "90dvh",
                        display: "flex",
                        flexDirection: "column",
                        pb: "calc(0px + env(safe-area-inset-bottom))",
                        overflow: "hidden",
                        bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
                    },
                }}
            >
                {/* Header row: variant image + price + close */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 1.5,
                        p: 2,
                        pb: 1.5,
                        bgcolor: theme.palette.mode === 'dark' ? '#2a2a2a' : '#fff7ed',
                        position: "relative",
                    }}
                >
                    {/* Variant thumbnail - clickable to open variant image viewer */}
                    <Box
                        component="button"
                        type="button"
                        onClick={() => variantImages.length > 0 && openVariantImageViewer()}
                        sx={{
                            width: 88,
                            height: 88,
                            flexShrink: 0,
                            border: "none",
                            borderRadius: 2,
                            overflow: "hidden",
                            background: theme.palette.mode === 'dark' ? '#333' : '#fff',
                            p: 0,
                            cursor: variantImages.length > 0 ? "zoom-in" : "default",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                            mb: -2,
                        }}
                    >
                        {activeVariantImage ? (
                            <Box
                                component="img"
                                src={activeVariantImage}
                                alt={item.product_name}
                                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                        ) : activeMainImage ? (
                            <Box
                                component="img"
                                src={activeMainImage}
                                alt={item.product_name}
                                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                        ) : (
                            <Box sx={{ width: "100%", height: "100%", bgcolor: "#f0f0f0" }} />
                        )}
                    </Box>

                    {/* Price + name */}
                    <Box sx={{ flex: 1, pb: 2 }}>
                        <Typography
                            sx={{ fontWeight: 800, color: "error.main", fontSize: 22, lineHeight: 1.2 }}
                        >
                            {sellerPrice(selectedPrice ?? displayPrice ?? null)}
                        </Typography>
                        {variant?.discount_price != null &&
                            variant?.price != null &&
                            variant.price !== variant.discount_price && (
                                <Typography variant="caption" sx={{ color: "text.disabled", textDecoration: "line-through" }}>
                                    {sellerPrice(variant.price)}
                                </Typography>
                            )}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
                            {[selectedColor, selectedSize, selectedPackaging].filter(Boolean).join(" · ") || item.product_name}
                        </Typography>
                        {variant?.stock != null && (
                            <Typography variant="caption" sx={{ color: "text.disabled" }}>
                                Stock: {variant.stock}
                            </Typography>
                        )}
                    </Box>

                    {/* Close button */}
                    <IconButton
                        onClick={() => setSheetOpen(false)}
                        size="small"
                        sx={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            bgcolor: "rgba(0,0,0,0.06)",
                            "&:hover": { bgcolor: "rgba(0,0,0,0.12)" },
                        }}
                    >
                        <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                </Box>

                {/* Scrollable body with variant options */}
                <Box sx={{ overflowY: "auto", flex: 1 }}>
                    <Box sx={{ p: 2, pt: 3 }}>
                        <Stack spacing={2}>
                            {openCarts.length === 0 ? (
                                <Box>
                                    <Typography sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                        No open carts yet.
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        Create a cart first, then come back to add this item.
                                    </Typography>
                                    <Button
                                        component={Link}
                                        href={route("seller.carts.create")}
                                        variant="contained"
                                        sx={{
                                            mt: 2,
                                            borderRadius: 3,
                                            textTransform: "none",
                                            bgcolor: SELLER_BRAND_DARK,
                                            "&:hover": { bgcolor: SELLER_BRAND_DARK },
                                        }}
                                    >
                                        Create Cart
                                    </Button>
                                </Box>
                            ) : (
                                <>
                                    {/* Color Selection */}
                                    {colors.length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                                Color
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {colors.map((color) => (
                                                    <Chip
                                                        key={color}
                                                        label={color}
                                                        clickable
                                                        onClick={() => chooseColor(color)}
                                                        sx={{
                                                            bgcolor: selectedColor === color ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#333' : "#f5f5f5",
                                                            color: selectedColor === color ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedColor === color ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                            "&:hover": {
                                                                bgcolor: selectedColor === color ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#444' : "#e0e0e0",
                                                            },
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {/* Size Selection */}
                                    {sizes.length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                                Size
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {sizes.map((size) => (
                                                    <Chip
                                                        key={size}
                                                        label={size}
                                                        clickable
                                                        onClick={() => chooseSize(size)}
                                                        sx={{
                                                            bgcolor: selectedSize === size ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#333' : "#f5f5f5",
                                                            color: selectedSize === size ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedSize === size ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                            "&:hover": {
                                                                bgcolor: selectedSize === size ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#444' : "#e0e0e0",
                                                            },
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {/* Packaging Selection */}
                                    {packagingOptions.length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                                Packaging
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {packagingOptions.map((pack) => (
                                                    <Chip
                                                        key={pack}
                                                        label={pack}
                                                        clickable
                                                        onClick={() => choosePackaging(pack)}
                                                        sx={{
                                                            bgcolor: selectedPackaging === pack ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#333' : "#f5f5f5",
                                                            color: selectedPackaging === pack ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedPackaging === pack ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                            "&:hover": {
                                                                bgcolor: selectedPackaging === pack ? SELLER_BRAND_DARK : theme.palette.mode === 'dark' ? '#444' : "#e0e0e0",
                                                            },
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    <Divider sx={{ bgcolor: theme.palette.mode === 'dark' ? '#444' : 'rgba(0,0,0,0.12)' }} />

                                    {/* Cart Selector */}
                                    <TextField
                                        select
                                        fullWidth
                                        label="Cart"
                                        value={selectedCart}
                                        onChange={(e) => setSelectedCart(e.target.value)}
                                        size="small"
                                        sx={{
                                            '& .MuiInputLabel-root': {
                                                color: theme.palette.mode === 'dark' ? '#aaa' : 'inherit',
                                            },
                                            '& .MuiOutlinedInput-root': {
                                                color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                                                '& fieldset': {
                                                    borderColor: theme.palette.mode === 'dark' ? '#444' : 'rgba(0,0,0,0.23)',
                                                },
                                            },
                                        }}
                                    >
                                        {openCarts.map((cart) => (
                                            <MenuItem key={cart.id} value={cart.id}>
                                                Cart #{cart.id} ·{" "}
                                                {[cart.customer?.first_name, cart.customer?.last_name]
                                                    .filter(Boolean)
                                                    .join(" ") || "No customer"}
                                            </MenuItem>
                                        ))}
                                    </TextField>

                                    {/* Quantity Selector */}
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        <Typography sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                            Quantity
                                        </Typography>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => setData("quantity", Math.max(1, data.quantity - 1))}
                                                sx={{ 
                                                    border: "1px solid", 
                                                    borderColor: theme.palette.mode === 'dark' ? '#555' : "divider", 
                                                    borderRadius: 2,
                                                    color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                                                }}
                                            >
                                                <RemoveRoundedIcon fontSize="small" />
                                            </IconButton>
                                            <Typography sx={{ minWidth: 28, textAlign: "center", fontWeight: 700, color: theme.palette.mode === 'dark' ? '#fff' : 'inherit' }}>
                                                {data.quantity}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                onClick={() => setData("quantity", data.quantity + 1)}
                                                sx={{ 
                                                    border: "1px solid", 
                                                    borderColor: theme.palette.mode === 'dark' ? '#555' : "divider", 
                                                    borderRadius: 2,
                                                    color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                                                }}
                                            >
                                                <AddRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    </Box>
                </Box>

                {/* Sticky footer CTA */}
                {openCarts.length > 0 && (
                    <Box
                        sx={{
                            p: 2,
                            pt: 1,
                            borderTop: "1px solid",
                            borderColor: theme.palette.mode === 'dark' ? '#444' : "divider",
                            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
                            pb: "calc(16px + env(safe-area-inset-bottom))",
                        }}
                    >
                        <Button
                            fullWidth
                            disabled={processing}
                            onClick={addToCart}
                            variant="contained"
                            sx={{
                                py: 1.5,
                                borderRadius: 3,
                                textTransform: "none",
                                fontSize: 16,
                                fontWeight: 700,
                                bgcolor: SELLER_BRAND_DARK,
                                "&:hover": { bgcolor: SELLER_BRAND_DARK },
                            }}
                        >
                            {processing ? "Adding..." : "Add to Cart"}
                        </Button>
                    </Box>
                )}
            </Drawer>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout children={page} />;