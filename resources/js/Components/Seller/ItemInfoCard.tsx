import { SELLER_BRAND_DARK, SellerCard, sellerPrice } from "@/Components/Seller/sellerUi";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { PricingMode, SellerItem, SellerVariantData } from "./itemShowHelpers";

export interface ItemInfoCardProps {
    item: SellerItem;
    variant?: SellerVariantData;
    selectedPrice: number | null;
    displayPrice?: number | null;
    pricingMode: PricingMode;
    onPriceTap: () => void;
}

export default function ItemInfoCard({
    item,
    variant,
    selectedPrice,
    displayPrice,
    pricingMode,
    onPriceTap,
}: ItemInfoCardProps) {
    const hasDiscount =
        variant?.discount_price != null &&
        variant?.price != null &&
        variant.price !== variant.discount_price;

    return (
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
                    onClick={onPriceTap}
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
                    {hasDiscount && (
                        <Typography
                            variant="body2"
                            sx={{ color: "text.disabled", textDecoration: "line-through" }}
                        >
                            {sellerPrice(variant!.price)}
                        </Typography>
                    )}
                    {hasDiscount && (
                        <Chip
                            label={`-${Math.round(
                                ((variant!.price! - variant!.discount_price!) /
                                    variant!.price!) *
                                    100,
                            )}%`}
                            size="small"
                            sx={{
                                bgcolor: "#EAB308",
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: "0.7rem",
                            }}
                        />
                    )}
                    {pricingMode === "seller" && (
                        <Chip
                            label="Seller"
                            size="small"
                            sx={{
                                bgcolor: SELLER_BRAND_DARK,
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: "0.7rem",
                            }}
                        />
                    )}
                </Box>
            </Stack>
        </SellerCard>
    );
}
