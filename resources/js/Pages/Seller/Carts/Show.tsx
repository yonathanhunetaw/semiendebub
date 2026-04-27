import { SellerCard, SellerHeader, SELLER_BRAND_DARK, sellerHeaderButtonSx, sellerName, sellerPrice } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import { Box, Button, Chip, IconButton, Stack, Typography } from "@mui/material";
import React from "react";

interface CartRowItem {
    id: number;
    product_name?: string;
    category?: {
        category_name?: string;
    } | null;
    pivot?: {
        quantity?: number;
        price?: number;
    };
}

interface Cart {
    id: number;
    customer?: {
        first_name?: string;
        last_name?: string;
    } | null;
    seller?: {
        first_name?: string;
        last_name?: string;
    } | null;
    items?: CartRowItem[];
}

export default function Show({ cart }: { cart: Cart }) {
    const total = (cart.items ?? []).reduce(
        (sum, item) => sum + (item.pivot?.quantity ?? 0) * (item.pivot?.price ?? 0),
        0,
    );

    return (
        <>
            <Head title={`Cart #${cart.id}`} />

            <SellerHeader
                title={`Cart #${cart.id}`}
                backHref={route("seller.carts.index")}
                action={(
                    <IconButton
                        component={Link}
                        href={route("seller.carts.edit", cart.id)}
                        sx={sellerHeaderButtonSx}
                    >
                        <EditRoundedIcon />
                    </IconButton>
                )}
                subtitle={sellerName([
                    cart.customer?.first_name,
                    cart.customer?.last_name,
                ]) || "No customer assigned"}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    <SellerCard>
                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                Seller
                            </Typography>
                            <Typography sx={{ fontWeight: 700 }}>
                                {sellerName([cart.seller?.first_name, cart.seller?.last_name]) || "Not assigned"}
                            </Typography>
                            <Chip label={`${cart.items?.length ?? 0} line items`} size="small" sx={{ alignSelf: "flex-start" }} />
                        </Stack>
                    </SellerCard>

                    <SellerCard>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                            <Box>
                                <Typography sx={{ fontWeight: 700 }}>Add more items</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Continue shopping into this same cart.
                                </Typography>
                            </Box>
                            <Button
                                component={Link}
                                href={route("seller.items.index", { cart_id: cart.id })}
                                variant="contained"
                                startIcon={<ShoppingBagRoundedIcon />}
                                sx={{
                                    borderRadius: 3,
                                    textTransform: "none",
                                    bgcolor: SELLER_BRAND_DARK,
                                    "&:hover": { bgcolor: SELLER_BRAND_DARK },
                                }}
                            >
                                Browse
                            </Button>
                        </Stack>
                    </SellerCard>

                    {(cart.items ?? []).length === 0 ? (
                        <SellerCard>
                            <Typography sx={{ fontWeight: 700 }}>This cart is empty.</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Start by adding products from the catalog.
                            </Typography>
                        </SellerCard>
                    ) : (
                        (cart.items ?? []).map((item) => (
                            <SellerCard key={item.id}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700 }} noWrap>
                                            {item.product_name || `Item #${item.id}`}
                                        </Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Qty {item.pivot?.quantity ?? 0}
                                            </Typography>
                                            {item.category?.category_name ? (
                                                <Chip label={item.category.category_name} size="small" variant="outlined" />
                                            ) : null}
                                        </Stack>
                                    </Box>
                                    <Typography sx={{ fontWeight: 800 }}>
                                        {sellerPrice(item.pivot?.price ?? 0)}
                                    </Typography>
                                </Stack>
                            </SellerCard>
                        ))
                    )}

                    <SellerCard>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography sx={{ fontWeight: 700 }}>Cart total</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {sellerPrice(total)}
                            </Typography>
                        </Stack>
                    </SellerCard>
                </Stack>
            </Box>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
