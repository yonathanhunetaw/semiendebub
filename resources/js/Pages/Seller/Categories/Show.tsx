import { SellerCard, SellerHeader, sellerImage, sellerPrice } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Chip, Stack, Typography } from "@mui/material";
import React from "react";

interface Category {
    id: number;
    category_name: string;
}

interface StoreVariant {
    price?: number | null;
    discount_price?: number | null;
}

interface ItemVariant {
    price?: number | null;
    store_variants?: StoreVariant[];
}

interface Item {
    id: number;
    product_name: string;
    product_images?: string[] | string | null;
    sold_count?: number | null;
    category?: {
        category_name?: string;
    } | null;
    variants?: ItemVariant[];
}

function itemImage(item: Item) {
    if (Array.isArray(item.product_images)) {
        return sellerImage(item.product_images[0] ?? null);
    }

    return sellerImage(item.product_images ?? null);
}

function itemPrice(item: Item) {
    const prices = (item.variants ?? [])
        .flatMap((variant) => {
            const storePrices = (variant.store_variants ?? [])
                .map((storeVariant) => storeVariant.discount_price ?? storeVariant.price)
                .filter((price): price is number => price != null);

            return storePrices.length ? storePrices : [variant.price];
        })
        .filter((price): price is number => price != null);

    return prices.length ? Math.min(...prices) : null;
}

export default function Show({
    category,
    subcategories = [],
    items = [],
}: {
    category: Category;
    subcategories?: Category[];
    items?: Item[];
}) {
    return (
        <>
            <Head title={category.category_name} />

            <SellerHeader
                title={category.category_name}
                backHref={route("seller.categories.index")}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                {subcategories.length > 0 ? (
                    <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mb: 1 }}>
                            Subcategories
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 1.5,
                            }}
                        >
                            {subcategories.map((subcategory) => (
                                <SellerCard
                                    key={subcategory.id}
                                    component={Link}
                                    href={route("seller.categories.show", subcategory.id)}
                                    sx={{ textDecoration: "none", color: "inherit" }}
                                >
                                    <Stack spacing={1.5}>
                                        <Typography sx={{ fontWeight: 700 }}>{subcategory.category_name}</Typography>
                                        <ChevronRightRoundedIcon sx={{ color: "text.secondary", alignSelf: "flex-end" }} />
                                    </Stack>
                                </SellerCard>
                            ))}
                        </Box>
                    </>
                ) : null}

                {items.length > 0 ? (
                    <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mt: subcategories.length ? 2 : 0, mb: 1 }}>
                            Items
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 1.5,
                            }}
                        >
                            {items.map((item) => (
                                <SellerCard
                                    key={item.id}
                                    component={Link}
                                    href={route("seller.items.show", item.id)}
                                    sx={{ p: 0, overflow: "hidden", textDecoration: "none", color: "inherit" }}
                                >
                                    <Box
                                        sx={{
                                            height: 132,
                                            backgroundColor: "#fff7ed",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            overflow: "hidden",
                                        }}
                                    >
                                        {itemImage(item) ? (
                                            <Box
                                                component="img"
                                                src={itemImage(item)!}
                                                alt={item.product_name}
                                                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                                            />
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                No image
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box sx={{ p: 1.5 }}>
                                        <Typography sx={{ fontWeight: 700 }} noWrap>
                                            {item.product_name}
                                        </Typography>
                                        <Typography sx={{ mt: 0.75, fontWeight: 800, color: "error.main" }}>
                                            {sellerPrice(itemPrice(item))}
                                        </Typography>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {item.sold_count ?? 0} sold
                                            </Typography>
                                            {item.category?.category_name ? (
                                                <Chip label={item.category.category_name} size="small" variant="outlined" />
                                            ) : null}
                                        </Stack>
                                    </Box>
                                </SellerCard>
                            ))}
                        </Box>
                    </>
                ) : null}
            </Box>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
