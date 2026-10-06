import { type CatalogItem } from "@/Components/Seller/catalogPricing";
import ProductCard from "@/Components/Seller/ProductCard";
import { SellerCard, SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Stack, Typography } from "@mui/material";
import React from "react";

interface Category {
    id: number;
    category_name: string;
}

interface Props {
    category: Category;
    subcategories?: Category[];
    /** What this store carries in the category (SellerCatalog::present cards). */
    items?: CatalogItem[];
    has_tin_cart?: boolean;
    top_cart_is_individual?: boolean;
}

export default function Show({ category, subcategories = [], items = [], has_tin_cart = false, top_cart_is_individual = false }: Props) {
    const cardStyle = {
        bgcolor: "background.paper",
        color: "text.primary",
        border: "1px solid",
        borderColor: "divider",
        textDecoration: "none",
        "& .MuiTypography-root": { color: "text.primary" },
    };

    return (
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title={category.category_name} />
            <SellerHeader title={category.category_name} backHref={route("seller.categories.index")} />

            <Box sx={{ px: 2, pt: 2 }}>
                {subcategories.length > 0 && (
                    <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mb: 1, color: "text.primary" }}>
                            Subcategories
                        </Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
                            {subcategories.map((subcategory) => (
                                <SellerCard key={subcategory.id} component={Link} href={route("seller.categories.show", subcategory.id)} sx={cardStyle}>
                                    <Stack spacing={1.5}>
                                        <Typography sx={{ fontWeight: 700 }}>{subcategory.category_name}</Typography>
                                        <ChevronRightRoundedIcon sx={{ color: "primary.main", alignSelf: "flex-end" }} />
                                    </Stack>
                                </SellerCard>
                            ))}
                        </Box>
                    </>
                )}

                {items.length > 0 && (
                    <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mt: subcategories.length ? 2 : 0, mb: 1, color: "text.primary" }}>
                            Items
                        </Typography>
                        <section aria-label="Products" className="grid grid-cols-2 gap-2.5 pb-28 sm:grid-cols-3 md:grid-cols-4">
                            {items.map((item) => (
                                <ProductCard key={item.id} item={item} hasTinCart={has_tin_cart} topCartIsIndividual={top_cart_is_individual} />
                            ))}
                        </section>
                    </>
                )}
            </Box>
        </Box>
    );
}
Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
