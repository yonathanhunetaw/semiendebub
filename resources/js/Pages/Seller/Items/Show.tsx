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
    return uniqueValues(
        variants
            .filter(
                (variant) => variant.color === color && variant.size === size,
            )
            .map((variant) => variant.packaging),
    );
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
    const initialVariant = firstVariant(variantData) as
        | SellerVariantData
        | undefined;

    const [pricingMode, setPricingMode] = React.useState<"normal" | "seller">(
        "normal",
    );
    const [selectedColor, setSelectedColor] = React.useState(
        initialVariant?.color ?? "",
    );
    const [selectedSize, setSelectedSize] = React.useState(
        initialVariant?.size ?? "",
    );
    const [selectedPackaging, setSelectedPackaging] = React.useState(
        initialVariant?.packaging ?? "",
    );

    const [selectedImage, setSelectedImage] = React.useState<string | null>(
        null,
    );

    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [priceTapCount, setPriceTapCount] = React.useState(0);
    const [imageViewerOpen, setImageViewerOpen] = React.useState(false);
    const [viewerZoom, setViewerZoom] = React.useState(1);

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
    const [selectedCart, setSelectedCart] = React.useState(
        selectedCartId
            ? String(selectedCartId)
            : openCarts[0]?.id
              ? String(openCarts[0].id)
              : "",
    );

    const variant = findVariant(
        variantData,
        selectedColor,
        selectedSize,
        selectedPackaging,
    );

    // 🔹 CALCULATE ACTIVE IMAGE (Prevents the flash/disappear effect)
    // 🔹 Update activeImage
    const activeImage = React.useMemo(() => {
        if (selectedImage) return selectedImage;

        const source = variant?.images?.[0] || allImages[0] || null;

        // IF THE SOURCE IS ALREADY A FULL URL, DON'T USE THE HELPER
        if (typeof source === "string" && source.startsWith("http")) {
            return source;
        }

        return sellerImage(source);
    }, [selectedImage, variant?.id, allImages]);

    // 🔹 Update thumbnails mapping
    const images = (variant?.images ?? allImages)
        .map((image) => {
            // IF THE IMAGE IS ALREADY A FULL URL, RETURN IT AS IS
            if (typeof image === "string" && image.startsWith("http")) {
                return image;
            }
            return sellerImage(image);
        })
        .filter(Boolean) as string[];

    const selectedPrice = visiblePrice(variant, pricingMode);
    const perPiece =
        variant?.quantity && selectedPrice != null && variant.quantity > 0
            ? selectedPrice / variant.quantity
            : null;
    const isCartoon = (variant?.packaging ?? "").toLowerCase().includes("cartoon");
    const perPacket = isCartoon && selectedPrice != null ? selectedPrice : null;

    const { data, setData, post, processing, errors } = useForm({
        item_id: item.id,
        quantity: 1,
        price: selectedPrice ?? displayPrice ?? 0,
    });

    React.useEffect(() => {
        setData("price", selectedPrice ?? displayPrice ?? 0);
    }, [displayPrice, selectedPrice, setData]);

    const colors = uniqueValues(variantData.map((entry) => entry.color));
    const sizes = availableSizes(variantData, selectedColor);
    const packaging = availablePackaging(
        variantData,
        selectedColor,
        selectedSize,
    );

    const chooseColor = (color: string) => {
        const nextSizes = availableSizes(variantData, color);
        const nextSize = nextSizes[0] ?? "";
        const nextPackaging =
            availablePackaging(variantData, color, nextSize)[0] ?? "";
        setSelectedColor(color);
        setSelectedSize(nextSize);
        setSelectedPackaging(nextPackaging);
        setSelectedImage(null); // Reset manual choice to snap to new variant image
    };

    const chooseSize = (size: string) => {
        const nextPackaging =
            availablePackaging(variantData, selectedColor, size)[0] ?? "";
        setSelectedSize(size);
        setSelectedPackaging(nextPackaging);
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
                    <SellerCard sx={{ p: 0, overflow: "hidden" }}>
                        <Box
                            sx={{
                                height: 280,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#fff7ed",
                                cursor: activeImage ? "zoom-in" : "default",
                            }}
                            onClick={() => activeImage && openImageViewer()}
                        >
                            {activeImage ? (
                                <Box
                                    component="img"
                                    src={activeImage}
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

                        {images.length > 1 ? (
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ p: 1.5, overflowX: "auto" }}
                            >
                                {images.map((image) => (
                                    <Box
                                        key={image}
                                        component="button"
                                        type="button"
                                        onClick={() => setSelectedImage(image)}
                                        sx={{
                                            width: 64,
                                            height: 64,
                                            p: 0,
                                            border:
                                                activeImage === image
                                                    ? `2px solid ${SELLER_BRAND_DARK}`
                                                    : "1px solid rgba(148, 163, 184, 0.24)",
                                            borderRadius: 2,
                                            overflow: "hidden",
                                            background: "#fff",
                                            flexShrink: 0,
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
                        ) : null}
                    </SellerCard>

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

                    <SellerCard>
                        <Stack spacing={1.5}>
                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 1 }}
                                >
                                    Color
                                </Typography>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ overflowX: "auto" }}
                                >
                                    {colors.map((color) => (
                                        <Chip
                                            key={color}
                                            label={color}
                                            clickable
                                            onClick={() => chooseColor(color)}
                                            color={
                                                selectedColor === color
                                                    ? "primary"
                                                    : "default"
                                            }
                                            sx={{
                                                bgcolor:
                                                    selectedColor === color
                                                        ? SELLER_BRAND_DARK
                                                        : undefined,
                                                color:
                                                    selectedColor === color
                                                        ? "#fff"
                                                        : undefined,
                                                fontWeight: 700,
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Box>

                            <Divider />

                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 1 }}
                                >
                                    Size
                                </Typography>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ overflowX: "auto" }}
                                >
                                    {sizes.map((size) => (
                                        <Chip
                                            key={size}
                                            label={size}
                                            clickable
                                            onClick={() => chooseSize(size)}
                                            color={
                                                selectedSize === size
                                                    ? "primary"
                                                    : "default"
                                            }
                                            sx={{
                                                bgcolor:
                                                    selectedSize === size
                                                        ? SELLER_BRAND_DARK
                                                        : undefined,
                                                color:
                                                    selectedSize === size
                                                        ? "#fff"
                                                        : undefined,
                                                fontWeight: 700,
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Box>

                            <Divider />

                            <Box>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 1 }}
                                >
                                    Packaging
                                </Typography>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ overflowX: "auto" }}
                                >
                                    {packaging.map((pack) => (
                                        <Chip
                                            key={pack}
                                            label={pack}
                                            clickable
                                            onClick={() =>
                                                setSelectedPackaging(pack)
                                            }
                                            color={
                                                selectedPackaging === pack
                                                    ? "primary"
                                                    : "default"
                                            }
                                            sx={{
                                                bgcolor:
                                                    selectedPackaging === pack
                                                        ? SELLER_BRAND_DARK
                                                        : undefined,
                                                color:
                                                    selectedPackaging === pack
                                                        ? "#fff"
                                                        : undefined,
                                                fontWeight: 700,
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        </Stack>
                    </SellerCard>

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

            {/* ── Image Viewer Dialog ── */}
            <Dialog
                open={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                fullScreen
                PaperProps={{ sx: { bgcolor: "#000", display: "flex", flexDirection: "column" } }}
            >
                {/* Toolbar */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5 }}>
                    <Stack direction="row" spacing={1}>
                        <IconButton
                            onClick={() => setViewerZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                            sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.1)", borderRadius: 2 }}
                        >
                            <ZoomOutRoundedIcon />
                        </IconButton>
                        <IconButton
                            onClick={() => setViewerZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                            sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.1)", borderRadius: 2 }}
                        >
                            <ZoomInRoundedIcon />
                        </IconButton>
                        <Box sx={{ display: "flex", alignItems: "center", px: 1 }}>
                            <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                                {Math.round(viewerZoom * 100)}%
                            </Typography>
                        </Box>
                    </Stack>
                    <IconButton
                        onClick={() => setImageViewerOpen(false)}
                        sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.1)", borderRadius: 2 }}
                    >
                        <CloseRoundedIcon />
                    </IconButton>
                </Box>

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
                    {activeImage && (
                        <Box
                            component="img"
                            src={activeImage}
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

                {/* Thumbnail strip */}
                {images.length > 1 && (
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ p: 1.5, overflowX: "auto", bgcolor: "rgba(255,255,255,0.05)" }}
                    >
                        {images.map((img) => (
                            <Box
                                key={img}
                                component="button"
                                type="button"
                                onClick={() => { setSelectedImage(img); }}
                                sx={{
                                    width: 56,
                                    height: 56,
                                    flexShrink: 0,
                                    p: 0,
                                    border: activeImage === img ? "2px solid #fff" : "2px solid transparent",
                                    borderRadius: 1.5,
                                    overflow: "hidden",
                                    background: "#111",
                                    cursor: "pointer",
                                    opacity: activeImage === img ? 1 : 0.55,
                                    transition: "opacity 0.15s, border-color 0.15s",
                                }}
                            >
                                <Box component="img" src={img} sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            </Box>
                        ))}
                    </Stack>
                )}
            </Dialog>

            {/* ── Taobao-style Add-to-Cart Bottom Sheet ── */}
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
                    },
                }}
            >
                {/* Header row: image + price + close */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 1.5,
                        p: 2,
                        pb: 1.5,
                        bgcolor: "#fff7ed",
                        position: "relative",
                    }}
                >
                    {/* Variant thumbnail — tappable to open viewer */}
                    <Box
                        component="button"
                        type="button"
                        onClick={() => activeImage && openImageViewer()}
                        sx={{
                            width: 88,
                            height: 88,
                            flexShrink: 0,
                            border: "none",
                            borderRadius: 2,
                            overflow: "hidden",
                            background: "#fff",
                            p: 0,
                            cursor: activeImage ? "zoom-in" : "default",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                            mb: -2, // overlap the white body below
                        }}
                    >
                        {activeImage ? (
                            <Box
                                component="img"
                                src={activeImage}
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

                {/* Scrollable body */}
                <Box sx={{ overflowY: "auto", flex: 1 }}>
                    <Box sx={{ p: 2, pt: 3 }}>
                        <Stack spacing={2}>

                            {openCarts.length === 0 ? (
                                <Box>
                                    <Typography sx={{ fontWeight: 700 }}>No open carts yet.</Typography>
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
                                    {/* Color */}
                                    {uniqueValues(variantData.map((e) => e.color)).length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                                                Color
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {uniqueValues(variantData.map((e) => e.color)).map((color) => (
                                                    <Chip
                                                        key={color}
                                                        label={color}
                                                        clickable
                                                        onClick={() => chooseColor(color)}
                                                        sx={{
                                                            bgcolor: selectedColor === color ? SELLER_BRAND_DARK : "#f5f5f5",
                                                            color: selectedColor === color ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedColor === color ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {/* Size */}
                                    {availableSizes(variantData, selectedColor).length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                                                Size
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {availableSizes(variantData, selectedColor).map((size) => (
                                                    <Chip
                                                        key={size}
                                                        label={size}
                                                        clickable
                                                        onClick={() => chooseSize(size)}
                                                        sx={{
                                                            bgcolor: selectedSize === size ? SELLER_BRAND_DARK : "#f5f5f5",
                                                            color: selectedSize === size ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedSize === size ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {/* Packaging */}
                                    {availablePackaging(variantData, selectedColor, selectedSize).length > 0 && (
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                                                Packaging
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                                                {availablePackaging(variantData, selectedColor, selectedSize).map((pack) => (
                                                    <Chip
                                                        key={pack}
                                                        label={pack}
                                                        clickable
                                                        onClick={() => setSelectedPackaging(pack)}
                                                        sx={{
                                                            bgcolor: selectedPackaging === pack ? SELLER_BRAND_DARK : "#f5f5f5",
                                                            color: selectedPackaging === pack ? "#fff" : "text.primary",
                                                            fontWeight: 700,
                                                            border: selectedPackaging === pack ? `1.5px solid ${SELLER_BRAND_DARK}` : "1.5px solid transparent",
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    <Divider />

                                    {/* Cart selector */}
                                    <TextField
                                        select
                                        fullWidth
                                        label="Cart"
                                        value={selectedCart}
                                        onChange={(e) => setSelectedCart(e.target.value)}
                                        size="small"
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

                                    {/* Quantity */}
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        <Typography sx={{ fontWeight: 700 }}>Quantity</Typography>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => setData("quantity", Math.max(1, data.quantity - 1))}
                                                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
                                            >
                                                <RemoveRoundedIcon fontSize="small" />
                                            </IconButton>
                                            <Typography sx={{ minWidth: 28, textAlign: "center", fontWeight: 700 }}>
                                                {data.quantity}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                onClick={() => setData("quantity", data.quantity + 1)}
                                                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
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
                            borderColor: "divider",
                            bgcolor: "#fff",
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
