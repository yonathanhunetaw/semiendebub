import { SellerCard, SellerHeader, SELLER_BRAND_DARK } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Chip, Stack, Typography } from "@mui/material";
import React from "react";

interface Category {
    id: number;
    category_name: string;
}

export default function Index({
    mainCategories = [],
    selectedCategory,
    subcategories = [],
}: {
    mainCategories?: Category[];
    selectedCategory?: Category | null;
    subcategories?: Category[];
}) {
    return (
        <>
            <Head title="Categories" />

            <SellerHeader title="Categories" />

            <Box sx={{ px: 2, pt: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mb: 1 }}>
                    Main Categories
                </Typography>
                <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
                    {mainCategories.map((category) => (
                        <Chip
                            key={category.id}
                            component={Link}
                            href={`${route("seller.categories.index")}?category_id=${category.id}`}
                            clickable
                            label={category.category_name}
                            color={selectedCategory?.id === category.id ? "primary" : "default"}
                            sx={{
                                borderRadius: 999,
                                bgcolor: selectedCategory?.id === category.id ? SELLER_BRAND_DARK : undefined,
                                color: selectedCategory?.id === category.id ? "#fff" : undefined,
                                "& .MuiChip-label": { px: 1.25, fontWeight: 700 },
                            }}
                        />
                    ))}
                </Stack>

                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mt: 2, mb: 1 }}>
                    {selectedCategory?.category_name || "Subcategories"}
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
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
