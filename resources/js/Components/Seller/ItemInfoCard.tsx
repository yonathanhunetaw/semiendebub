import { SELLER_BRAND_DARK, SellerCard, sellerPrice } from "@/Components/Seller/sellerUi";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { PACKAGING_TIER_LABEL, type PricingMode, type SellerItem, type SellerVariantData } from "./itemShowHelpers";
import type { PackagingTierOption } from "./PackagingSelector";

export interface ItemInfoCardProps {
    item: SellerItem;
    variant?: SellerVariantData;
    selectedPrice: number | null;
    displayPrice?: number | null;
    pricingMode: PricingMode;
    onPriceTap: () => void;
    /** All packaging tiers (Piece/Packet/Carton) with unit prices */
    packagingOptions?: PackagingTierOption[];
    hasTinCart?: boolean;
}

export default function ItemInfoCard({
    item,
    variant,
    selectedPrice,
    displayPrice,
    pricingMode,
    onPriceTap,
    packagingOptions = [],
    hasTinCart = false,
}: ItemInfoCardProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const activePrice = selectedPrice ?? displayPrice ?? null;
    const basePrice = variant?.price ?? null;
    const hasDiscount = activePrice != null && basePrice != null && activePrice < basePrice;

    // Find the piece-tier unit price to compute "per piece" for bigger tiers
    const pieceTier = packagingOptions.find((o) => o.tier === "piece");
    const pieceUnitPrice = pieceTier?.unitPrice ?? null;

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

                {/* Active price display */}
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
                                ((basePrice! - activePrice!) / basePrice!) * 100,
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
                            label="Seller Mode"
                            size="small"
                            sx={{
                                bgcolor: SELLER_BRAND_DARK,
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: "0.7rem",
                            }}
                        />
                    )}
                    {hasTinCart && (
                        <Typography
                            variant="caption"
                            color="success.main"
                            sx={{ fontWeight: 700, fontSize: "0.75rem", ml: "auto" }}
                        >
                            incl. VAT
                        </Typography>
                    )}
                </Box>

                {/* ── Price Tier Breakdown ── */}
                {variant && (
                    <Box
                        sx={{
                            bgcolor: isDark ? "#1a1a1a" : "#f9f7f4",
                            border: "1px solid",
                            borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
                            borderRadius: 3,
                            p: 1.5,
                            mt: 0.5,
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, color: "text.secondary", mb: 1, display: "block" }}
                        >
                            Price Tiers
                        </Typography>
                        <Stack spacing={0.5}>
                            {/* Base / Store price */}
                            {variant.price != null && (() => {
                                const isActive = pricingMode === "normal" && variant.seller_price == null && variant.customer_price == null;
                                return (
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" color="text.secondary">Base</Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.75}>
                                            {variant.discount_price != null && variant.discount_price < variant.price && (
                                                <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>
                                                    {sellerPrice(variant.price)}
                                                </Typography>
                                            )}
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: isActive ? 800 : 500,
                                                    color: isActive ? "error.main" : "text.primary",
                                                }}
                                            >
                                                {sellerPrice(variant.discount_price != null && variant.discount_price < variant.price
                                                    ? variant.discount_price
                                                    : variant.price)}
                                            </Typography>
                                            {isActive && (
                                                <Chip label="Active" size="small" sx={{ bgcolor: "#22c55e", color: "#fff", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                                            )}
                                        </Stack>
                                    </Stack>
                                );
                            })()}

                            {/* Seller price */}
                            {variant.seller_price != null && (() => {
                                const isActive = pricingMode === "seller";
                                return (
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" color="text.secondary">Seller</Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.75}>
                                            {variant.seller_discount_price != null && variant.seller_price != null && variant.seller_discount_price < variant.seller_price && (
                                                <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>
                                                    {sellerPrice(variant.seller_price)}
                                                </Typography>
                                            )}
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: isActive ? 800 : 500,
                                                    color: isActive ? "error.main" : "text.primary",
                                                }}
                                            >
                                                {sellerPrice(
                                                    variant.seller_discount_price != null && variant.seller_price != null && variant.seller_discount_price < variant.seller_price
                                                        ? variant.seller_discount_price
                                                        : variant.seller_price
                                                )}
                                            </Typography>
                                            <Chip label="Seller" size="small" sx={{ bgcolor: SELLER_BRAND_DARK, color: "#fff", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                                            {isActive && (
                                                <Chip label="Active" size="small" sx={{ bgcolor: "#22c55e", color: "#fff", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                                            )}
                                        </Stack>
                                    </Stack>
                                );
                            })()}

                            {/* Customer price */}
                            {variant.customer_price != null && (() => {
                                const isActive = pricingMode === "normal" && variant.seller_price == null;
                                return (
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" color="text.secondary">Customer</Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.75}>
                                            {variant.customer_discount_price != null && variant.customer_price != null && variant.customer_discount_price < variant.customer_price && (
                                                <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>
                                                    {sellerPrice(variant.customer_price)}
                                                </Typography>
                                            )}
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: isActive ? 800 : 500,
                                                    color: isActive ? "error.main" : "text.primary",
                                                }}
                                            >
                                                {sellerPrice(
                                                    variant.customer_discount_price != null && variant.customer_price != null && variant.customer_discount_price < variant.customer_price
                                                        ? variant.customer_discount_price
                                                        : variant.customer_price
                                                )}
                                            </Typography>
                                            <Chip label="Customer" size="small" sx={{ bgcolor: "#6366f1", color: "#fff", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                                        </Stack>
                                    </Stack>
                                );
                            })()}
                        </Stack>
                    </Box>
                )}

                {/* ── Packaging price breakdown ── */}
                {packagingOptions.length > 0 && (
                    <Box
                        sx={{
                            bgcolor: isDark ? "#1a1a1a" : "#f9f7f4",
                            border: "1px solid",
                            borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
                            borderRadius: 3,
                            p: 1.5,
                            mt: 0.5,
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, color: "text.secondary", mb: 1, display: "block" }}
                        >
                            Packaging Prices
                        </Typography>

                        <Stack divider={<Divider flexItem sx={{ opacity: 0.5 }} />} spacing={0}>
                            {packagingOptions.map((opt, idx) => {
                                const label = PACKAGING_TIER_LABEL[opt.tier];
                                const unitPrice = opt.unitPrice;
                                const qty = opt.unitsPerTier; // pieces in this unit

                                // Per-smaller-unit cost:
                                // Packet → per piece; Carton → per packet (if packet exists)
                                let perSmallerLabel: string | null = null;
                                let perSmallerPrice: number | null = null;

                                if (opt.tier === "packet" && qty && unitPrice != null) {
                                    perSmallerPrice = unitPrice / qty;
                                    perSmallerLabel = "/ piece";
                                } else if (opt.tier === "cartoon") {
                                    const packetOpt = packagingOptions.find((o) => o.tier === "packet");
                                    if (packetOpt?.unitPrice != null && packetOpt.unitsPerTier && qty) {
                                        // pieces per carton / pieces per packet = packets per carton
                                        const packetsPerCarton = qty / packetOpt.unitsPerTier;
                                        if (packetsPerCarton > 0 && unitPrice != null) {
                                            perSmallerPrice = unitPrice / packetsPerCarton;
                                            perSmallerLabel = "/ packet";
                                        }
                                    } else if (pieceUnitPrice == null && qty && unitPrice != null) {
                                        perSmallerPrice = unitPrice / qty;
                                        perSmallerLabel = "/ piece";
                                    }
                                }

                                return (
                                    <Box key={opt.tier} sx={{ py: 0.75 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                            <Box>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ fontWeight: 700, color: isDark ? "#fff" : "text.primary" }}
                                                >
                                                    {label}
                                                    {qty != null && (
                                                        <Typography
                                                            component="span"
                                                            variant="caption"
                                                            sx={{ ml: 0.5, color: "text.secondary", fontWeight: 400 }}
                                                        >
                                                            ({qty} {idx === 0 ? "pcs" : "pcs"})
                                                        </Typography>
                                                    )}
                                                </Typography>
                                                {perSmallerPrice != null && (
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ color: "text.secondary", display: "block" }}
                                                    >
                                                        {sellerPrice(perSmallerPrice)} {perSmallerLabel}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Box sx={{ textAlign: "right" }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ fontWeight: 800, color: SELLER_BRAND_DARK }}
                                                >
                                                    {unitPrice != null ? sellerPrice(unitPrice) : "—"}
                                                </Typography>
                                                {/* Customer / Seller discount badges */}
                                                {pricingMode === "seller" && variant?.seller_price != null && opt.tier === packagingOptions.find((o) => o.unitPrice === variant?.seller_price)?.tier && (
                                                    <Chip label="Seller" size="small" sx={{ bgcolor: SELLER_BRAND_DARK, color: "#fff", fontSize: "0.6rem", height: 16 }} />
                                                )}
                                            </Box>
                                        </Stack>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Box>
                )}

                {/* Discount ladder from PriceProvider (customer / seller overrides) */}
                {variant?.price_ladder != null && variant.price_ladder.length > 1 && (
                    <Box sx={{ pt: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", mb: 0.5, display: "block" }}>
                            Special Prices
                        </Typography>
                        <Stack spacing={0.25}>
                            {variant.price_ladder
                                .filter((tier) => tier.level !== "store")
                                .map((tier) => {
                                    const levelName =
                                        tier.level === "customer" ? "Customer" :
                                        tier.level === "seller" ? "Seller" :
                                        tier.level === "individual" ? "Individual" : tier.level;
                                    const hasTierDiscount = tier.discount_price != null && tier.discount_price < tier.price;
                                    return (
                                        <Stack
                                            key={tier.level}
                                            direction="row"
                                            justifyContent="space-between"
                                            alignItems="center"
                                        >
                                            <Chip
                                                label={levelName}
                                                size="small"
                                                sx={{
                                                    bgcolor: tier.level === "customer" ? "#7c3aed" : tier.level === "seller" ? SELLER_BRAND_DARK : "#0ea5e9",
                                                    color: "#fff",
                                                    fontSize: "0.6rem",
                                                    height: 18,
                                                    fontWeight: 700,
                                                }}
                                            />
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                                {hasTierDiscount && (
                                                    <Typography variant="caption" sx={{ color: "text.disabled", textDecoration: "line-through" }}>
                                                        {sellerPrice(tier.price)}
                                                    </Typography>
                                                )}
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>
                                                    {sellerPrice(tier.final)}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    );
                                })}
                        </Stack>
                    </Box>
                )}
            </Stack>
        </SellerCard>
    );
}
