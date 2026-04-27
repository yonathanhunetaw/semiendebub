import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Divider,
    Grid,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

interface SellerVariantData {
    id: number;
    color?: string;
    size?: string;
    packaging?: string;
    price?: number | null;
    discount_price?: number | null;
    final_price?: number | null;
    seller_price?: number | null;
    seller_discount_price?: number | null;
    stock?: number | null;
    status?: string;
    images?: string[];
}

interface SellerItem {
    id: number;
    product_name: string;
    product_description?: string;
}

const formatMoney = (value?: number | null) =>
    value == null ? "N/A" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function Show({
    item,
    allImages = [],
    variantData = [],
    displayPrice,
}: {
    item: SellerItem;
    allImages?: string[];
    variantData?: SellerVariantData[];
    displayPrice?: number | null;
}) {
    return (
        <>
            <Head title={item.product_name} />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {item.product_name}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {item.product_description || "Seller-facing item detail and variant pricing."}
                    </Typography>
                </Box>
                <Button component={Link} href={route("seller.carts.create")} variant="contained" sx={{ borderRadius: 3, textTransform: "none" }}>
                    Create Cart
                </Button>
            </Stack>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, lg: 7 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Media
                        </Typography>
                        <Grid container spacing={2}>
                            {allImages.map((image, index) => (
                                <Grid key={`${image}-${index}`} size={{ xs: 12, sm: 6 }}>
                                    <Box
                                        component="img"
                                        src={image}
                                        alt={item.product_name}
                                        sx={{
                                            width: "100%",
                                            height: 220,
                                            objectFit: "cover",
                                            borderRadius: 3,
                                            border: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="overline" color="text.secondary">
                            Starting From
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                            {formatMoney(displayPrice)}
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            Compare base, discounted, and seller-adjusted pricing per variant below.
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12 }}>
                    <Grid container spacing={3}>
                        {variantData.map((variant) => (
                            <Grid key={variant.id} size={{ xs: 12, md: 6, xl: 4 }}>
                                <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", height: "100%" }}>
                                    <Stack spacing={1.5}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                {variant.color || "Variant"} {variant.size ? `· ${variant.size}` : ""}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                label={variant.status || "inactive"}
                                                color={variant.status === "active" ? "success" : "default"}
                                                variant={variant.status === "active" ? "filled" : "outlined"}
                                            />
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary">
                                            Packaging: {variant.packaging || "N/A"}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Stock: {variant.stock ?? 0}
                                        </Typography>
                                        <Divider />
                                        <Typography variant="body2">Base: {formatMoney(variant.price)}</Typography>
                                        <Typography variant="body2">Discount: {formatMoney(variant.discount_price)}</Typography>
                                        <Typography variant="body2">Seller Price: {formatMoney(variant.seller_price)}</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                            Final: {formatMoney(variant.final_price)}
                                        </Typography>
                                    </Stack>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
