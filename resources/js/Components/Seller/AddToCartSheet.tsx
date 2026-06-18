import { SELLER_BRAND_DARK, sellerPrice } from "@/Components/Seller/sellerUi";
import { Link } from "@inertiajs/react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import {
    Box,
    Button,
    Divider,
    Drawer,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
    NO_IMAGE_PLACEHOLDER,
    type OpenCart,
    type PackagingTier,
    type SellerItem,
    type SellerVariantData,
} from "./itemShowHelpers";
import PackagingSelector, {
    type PackagingTierOption,
} from "./PackagingSelector";
import InventoryDetailList, {
    PLACEHOLDER_INVENTORY_LOCATIONS,
} from "./InventoryDetailList";

export interface AddToCartSheetProps {
    open: boolean;
    onClose: () => void;
    item: SellerItem;
    variant?: SellerVariantData;
    activeVariantImage: string | null;
    hasVariantImages: boolean;
    onOpenVariantImageViewer: () => void;

    selectedPrice: number | null;
    displayPrice?: number | null;
    selectedColor: string;
    selectedSize: string;

    colors: string[];
    sizes: string[];
    onChooseColor: (color: string) => void;
    onChooseSize: (size: string) => void;

    packagingOptions: PackagingTierOption[];
    selectedTier: PackagingTier | null;
    onSelectTier: (tier: PackagingTier) => void;
    tierCount: number;
    onTierCountChange: (count: number) => void;
    extraPieces: number;
    onExtraPiecesChange: (count: number) => void;
    piecePrice: number | null;

    openCarts: OpenCart[];
    selectedCart: string;
    onSelectCart: (cartId: string) => void;

    totalLabel: string;
    totalPrice: number;
    processing: boolean;
    onAddToCart: () => void;
}

export default function AddToCartSheet({
    open,
    onClose,
    item,
    variant,
    activeVariantImage,
    hasVariantImages,
    onOpenVariantImageViewer,
    selectedPrice,
    displayPrice,
    selectedColor,
    selectedSize,
    colors,
    sizes,
    onChooseColor,
    onChooseSize,
    packagingOptions,
    selectedTier,
    onSelectTier,
    tierCount,
    onTierCountChange,
    extraPieces,
    onExtraPiecesChange,
    piecePrice,
    openCarts,
    selectedCart,
    onSelectCart,
    totalLabel,
    totalPrice,
    processing,
    onAddToCart,
}: AddToCartSheetProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const hasDiscount =
        variant?.discount_price != null &&
        variant?.price != null &&
        variant.price !== variant.discount_price;

    const selectedOption = packagingOptions.find((o) => o.tier === selectedTier);
    const unitCountLabel = (() => {
        if (!selectedOption || tierCount <= 0) return "";
        const tierWord = selectedOption.tier === "cartoon" ? "Carton" : selectedOption.tier === "packet" ? "Packet" : "Piece";
        const tierPart = `${tierCount} ${tierWord}${tierCount === 1 ? "" : "s"}`;

        if (selectedOption.tier === "piece") {
            return tierPart;
        }

        const totalPieces =
            (selectedOption.unitsPerTier ?? 0) * tierCount + extraPieces;
        if (totalPieces <= 0) return tierPart;

        return `${tierPart} / ${totalPieces} Piece${totalPieces === 1 ? "" : "s"}`;
    })();

    return (
        <Drawer
            anchor="bottom"
            open={open}
            onClose={onClose}
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
                    bgcolor: isDark ? "#1e1e1e" : "#fff",
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
                    bgcolor: isDark ? "#2a2a2a" : "#fff7ed",
                    position: "relative",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    onClick={() => hasVariantImages && onOpenVariantImageViewer()}
                    sx={{
                        width: 88,
                        height: 88,
                        flexShrink: 0,
                        border: "none",
                        borderRadius: 2,
                        overflow: "hidden",
                        background: isDark ? "#333" : "#fff",
                        p: 0,
                        cursor: hasVariantImages ? "zoom-in" : "default",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                        mb: -2,
                    }}
                >
                    <Box
                        component="img"
                        src={activeVariantImage || NO_IMAGE_PLACEHOLDER}
                        alt={item.product_name}
                        onError={(e) => {
                            e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
                        }}
                        sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                </Box>

                <Box sx={{ flex: 1, pb: 2 }}>
                    <Stack
                        direction="row"
                        alignItems="baseline"
                        spacing={1}
                        sx={{ flexWrap: "wrap" }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 800,
                                color: "error.main",
                                fontSize: 22,
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {sellerPrice(selectedPrice ?? displayPrice ?? null)}
                        </Typography>
                        {unitCountLabel && (
                            <Typography
                                sx={{
                                    color: isDark ? "rgba(255,255,255,0.6)" : "text.secondary",
                                    fontWeight: 600,
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                ({unitCountLabel})
                            </Typography>
                        )}
                    </Stack>
                    {hasDiscount && (
                        <Typography
                            variant="caption"
                            sx={{ color: "text.disabled", textDecoration: "line-through" }}
                        >
                            {sellerPrice(variant!.price)}
                        </Typography>
                    )}
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.25, fontSize: 12 }}
                    >
                        {[selectedColor, selectedSize].filter(Boolean).join(" · ") ||
                            item.product_name}
                    </Typography>
                    {variant?.stock != null && (
                        <Typography variant="caption" sx={{ color: "text.disabled" }}>
                            Stock: {variant.stock}
                        </Typography>
                    )}
                </Box>

                <IconButton
                    onClick={onClose}
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
                                <Typography
                                    sx={{ fontWeight: 700, color: isDark ? "#fff" : "inherit" }}
                                >
                                    No open carts yet.
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                >
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
                                {colors.length > 0 && (
                                    <ChipGroup
                                        label="Color"
                                        options={colors}
                                        selected={selectedColor}
                                        onSelect={onChooseColor}
                                        isDark={isDark}
                                    />
                                )}

                                {sizes.length > 0 && (
                                    <ChipGroup
                                        label="Size"
                                        options={sizes}
                                        selected={selectedSize}
                                        onSelect={onChooseSize}
                                        isDark={isDark}
                                    />
                                )}

                                {packagingOptions.length > 0 && (
                                    <PackagingSelector
                                        options={packagingOptions}
                                        selectedTier={selectedTier}
                                        onSelectTier={onSelectTier}
                                        tierCount={tierCount}
                                        onTierCountChange={onTierCountChange}
                                        extraPieces={extraPieces}
                                        onExtraPiecesChange={onExtraPiecesChange}
                                        piecePrice={piecePrice}
                                    />
                                )}

                                <InventoryDetailList
                                    inStock={(variant?.stock ?? 0) > 0}
                                    locations={PLACEHOLDER_INVENTORY_LOCATIONS}
                                />

                                <Divider
                                    sx={{
                                        bgcolor: isDark ? "#444" : "rgba(0,0,0,0.12)",
                                    }}
                                />

                                <TextField
                                    select
                                    fullWidth
                                    label="Cart"
                                    value={selectedCart}
                                    onChange={(e) => onSelectCart(e.target.value)}
                                    size="small"
                                    sx={{
                                        "& .MuiInputLabel-root": {
                                            color: isDark ? "#aaa" : "inherit",
                                        },
                                        "& .MuiOutlinedInput-root": {
                                            color: isDark ? "#fff" : "inherit",
                                            "& fieldset": {
                                                borderColor: isDark
                                                    ? "#444"
                                                    : "rgba(0,0,0,0.23)",
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
                        borderTop: "1px solid",
                        borderColor: isDark ? "#444" : "divider",
                        bgcolor: isDark ? "#1e1e1e" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1.5,
                        pb: "calc(16px + env(safe-area-inset-bottom))",
                    }}
                >
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                        <Typography
                            variant="caption"
                            sx={{ color: isDark ? "#999" : "text.secondary", fontWeight: 600 }}
                        >
                            {totalLabel}
                        </Typography>
                        <Typography
                            sx={{ fontWeight: 800, color: SELLER_BRAND_DARK, fontSize: 16 }}
                        >
                            Total: {sellerPrice(totalPrice)}
                        </Typography>
                    </Box>
                    <Button
                        disabled={processing}
                        onClick={onAddToCart}
                        variant="contained"
                        startIcon={<ShoppingCartRoundedIcon />}
                        sx={{
                            height: 56,
                            px: 3,
                            borderRadius: 99,
                            textTransform: "none",
                            fontSize: 15,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            bgcolor: SELLER_BRAND_DARK,
                            "&:hover": { bgcolor: SELLER_BRAND_DARK },
                            "&:active": { transform: "scale(0.95)" },
                            boxShadow: `0 8px 20px ${SELLER_BRAND_DARK}33`,
                        }}
                    >
                        {processing ? "Adding..." : "Add to Cart"}
                    </Button>
                </Box>
            )}
        </Drawer>
    );
}

function ChipGroup({
    label,
    options,
    selected,
    onSelect,
    isDark,
}: {
    label: string;
    options: string[];
    selected: string;
    onSelect: (value: string) => void;
    isDark: boolean;
}) {
    return (
        <Box>
            <Typography
                sx={{
                    fontWeight: 700,
                    fontSize: 18,
                    mb: 1.25,
                    color: isDark ? "#fff" : "inherit",
                }}
            >
                {label}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {options.map((option) => {
                    const active = selected === option;
                    return (
                        <Box
                            key={option}
                            component="button"
                            type="button"
                            onClick={() => onSelect(option)}
                            sx={{
                                px: 2.5,
                                py: 1.25,
                                borderRadius: 99,
                                border: "1px solid",
                                borderColor: active
                                    ? SELLER_BRAND_DARK
                                    : isDark
                                      ? "rgba(255,255,255,0.1)"
                                      : "rgba(0,0,0,0.1)",
                                bgcolor: active
                                    ? SELLER_BRAND_DARK
                                    : isDark
                                      ? "#1e1e1e"
                                      : "#f5f5f5",
                                color: active
                                    ? "#fff"
                                    : isDark
                                      ? "rgba(255,255,255,0.78)"
                                      : "text.primary",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                "&:active": { transform: "scale(0.95)" },
                                "&:hover": {
                                    bgcolor: active
                                        ? SELLER_BRAND_DARK
                                        : isDark
                                          ? "rgba(255,255,255,0.1)"
                                          : "#e0e0e0",
                                },
                            }}
                        >
                            {option}
                        </Box>
                    );
                })}
            </Stack>
        </Box>
    );
}