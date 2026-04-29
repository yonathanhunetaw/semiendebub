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
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import {
    Box,
    Button,
    Chip,
    Divider,
    Drawer,
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

    // 🔹 Initialize as null, useEffect will handle the sync
    const [selectedImage, setSelectedImage] = React.useState<string | null>(
        null,
    );

    const [sheetOpen, setSheetOpen] = React.useState(false);
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
    const images = (variant?.images ?? allImages)
        .map((image) => sellerImage(image))
        .filter(Boolean) as string[];
    const selectedPrice = visiblePrice(variant, pricingMode);
    const perPiece =
        variant?.quantity && selectedPrice != null && variant.quantity > 0
            ? selectedPrice / variant.quantity
            : null;

    const { data, setData, post, processing, errors } = useForm({
        item_id: item.id,
        quantity: 1,
        price: selectedPrice ?? displayPrice ?? 0,
    });

    React.useEffect(() => {
        setData("price", selectedPrice ?? displayPrice ?? 0);
    }, [displayPrice, selectedPrice, setData]);

    // 🔹 REPLACED: Enhanced Sync for selectedImage
    React.useEffect(() => {
        // Try current variant image, fallback to first item image
        const rawSource = variant?.images?.[0] ?? allImages[0] ?? null;
        const processed = sellerImage(rawSource);

        if (processed) {
            setSelectedImage(processed);
        }
    }, [allImages, variant?.id, variant?.images]);

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
                            }}
                        >
                            {/* 🔹 Logic: Use state first, fallback to first available image directly */}
                            {selectedImage || sellerImage(allImages[0]) ? (
                                <Box
                                    component="img"
                                    src={
                                        selectedImage ||
                                        sellerImage(allImages[0]) ||
                                        ""
                                    }
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
                                                selectedImage === image
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
                                            alt=""
                                            sx={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
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
                            <Typography
                                sx={{
                                    mt: 0.5,
                                    fontWeight: 800,
                                    color: "error.main",
                                    fontSize: 28,
                                }}
                            >
                                {sellerPrice(
                                    selectedPrice ?? displayPrice ?? null,
                                )}
                            </Typography>
                        </Stack>
                    </SellerCard>

                    <SellerCard>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant={
                                    pricingMode === "normal"
                                        ? "contained"
                                        : "outlined"
                                }
                                onClick={() => setPricingMode("normal")}
                                sx={{
                                    flex: 1,
                                    borderRadius: 3,
                                    textTransform: "none",
                                    bgcolor:
                                        pricingMode === "normal"
                                            ? SELLER_BRAND_DARK
                                            : undefined,
                                    "&:hover": {
                                        bgcolor:
                                            pricingMode === "normal"
                                                ? SELLER_BRAND_DARK
                                                : undefined,
                                    },
                                }}
                            >
                                Customer Price
                            </Button>
                            <Button
                                variant={
                                    pricingMode === "seller"
                                        ? "contained"
                                        : "outlined"
                                }
                                onClick={() => setPricingMode("seller")}
                                sx={{
                                    flex: 1,
                                    borderRadius: 3,
                                    textTransform: "none",
                                    bgcolor:
                                        pricingMode === "seller"
                                            ? SELLER_BRAND_DARK
                                            : undefined,
                                    "&:hover": {
                                        bgcolor:
                                            pricingMode === "seller"
                                                ? SELLER_BRAND_DARK
                                                : undefined,
                                    },
                                }}
                            >
                                Seller Price
                            </Button>
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

            <Drawer
                anchor="bottom"
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                PaperProps={{
                    sx: {
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        width: "min(100%, 480px)",
                        mx: "auto",
                        pb: "calc(16px + env(safe-area-inset-bottom))",
                    },
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Add to Cart
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {item.product_name} ·{" "}
                                {sellerPrice(selectedPrice)}
                            </Typography>
                        </Box>

                        {openCarts.length === 0 ? (
                            <SellerCard>
                                <Typography sx={{ fontWeight: 700 }}>
                                    No open carts yet.
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                >
                                    Create a cart first, then come back to add
                                    this item.
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
                                        "&:hover": {
                                            bgcolor: SELLER_BRAND_DARK,
                                        },
                                    }}
                                >
                                    Create Cart
                                </Button>
                            </SellerCard>
                        ) : (
                            <>
                                <TextField
                                    select
                                    fullWidth
                                    label="Cart"
                                    value={selectedCart}
                                    onChange={(event) =>
                                        setSelectedCart(event.target.value)
                                    }
                                >
                                    {openCarts.map((cart) => (
                                        <MenuItem key={cart.id} value={cart.id}>
                                            Cart #{cart.id} ·{" "}
                                            {[
                                                cart.customer?.first_name,
                                                cart.customer?.last_name,
                                            ]
                                                .filter(Boolean)
                                                .join(" ") || "No customer"}
                                        </MenuItem>
                                    ))}
                                </TextField>

                                <SellerCard>
                                    <Stack
                                        direction="row"
                                        alignItems="center"
                                        justifyContent="space-between"
                                    >
                                        <Typography sx={{ fontWeight: 700 }}>
                                            Quantity
                                        </Typography>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                        >
                                            <Button
                                                variant="outlined"
                                                onClick={() =>
                                                    setData(
                                                        "quantity",
                                                        Math.max(
                                                            1,
                                                            data.quantity - 1,
                                                        ),
                                                    )
                                                }
                                                sx={{
                                                    minWidth: 40,
                                                    borderRadius: 2,
                                                }}
                                            >
                                                <RemoveRoundedIcon fontSize="small" />
                                            </Button>
                                            <Typography
                                                sx={{
                                                    minWidth: 24,
                                                    textAlign: "center",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {data.quantity}
                                            </Typography>
                                            <Button
                                                variant="outlined"
                                                onClick={() =>
                                                    setData(
                                                        "quantity",
                                                        data.quantity + 1,
                                                    )
                                                }
                                                sx={{
                                                    minWidth: 40,
                                                    borderRadius: 2,
                                                }}
                                            >
                                                <AddRoundedIcon fontSize="small" />
                                            </Button>
                                        </Stack>
                                    </Stack>
                                </SellerCard>

                                {errors.quantity ? (
                                    <Typography variant="body2" color="error">
                                        {errors.quantity}
                                    </Typography>
                                ) : null}

                                <Button
                                    variant="contained"
                                    disabled={processing || !selectedCart}
                                    onClick={addToCart}
                                    sx={{
                                        borderRadius: 3,
                                        textTransform: "none",
                                        bgcolor: SELLER_BRAND_DARK,
                                        "&:hover": {
                                            bgcolor: SELLER_BRAND_DARK,
                                        },
                                    }}
                                >
                                    Confirm Add
                                </Button>
                            </>
                        )}
                    </Stack>
                </Box>
            </Drawer>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
