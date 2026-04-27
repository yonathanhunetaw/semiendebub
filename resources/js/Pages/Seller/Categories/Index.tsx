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
    // Shared card style for consistency
    const cardStyle = {
        bgcolor: "#1e293b",
        color: "#ffffff",
        border: "1px solid rgba(255,255,255,0.05)",
        textDecoration: "none",
        "& .MuiTypography-root": { color: "#ffffff" },
    };

    return (
        <Box sx={{ bgcolor: "#0f172a", minHeight: "100vh" }}>
            <Head title="Categories" />
            <SellerHeader title="Categories" />

            <Box sx={{ px: 2, pt: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mb: 1, color: "#ffffff" }}>
                    Main Categories
                </Typography>
                <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 1 }}>
                    {mainCategories.map((category) => (
                        <Chip
                            key={category.id}
                            component={Link}
                            href={`${route("seller.categories.index")}?category_id=${category.id}`}
                            clickable
                            label={category.category_name}
                            sx={{
                                borderRadius: 2,
                                // Active = Orange with Black Text, Inactive = Navy with White Text
                                bgcolor: selectedCategory?.id === category.id ? "primary.main" : "#1e293b",
                                color: selectedCategory?.id === category.id ? "#000000" : "#ffffff",
                                border: selectedCategory?.id === category.id ? "none" : "1px solid rgba(255,255,255,0.1)",
                                "& .MuiChip-label": { px: 1.5, fontWeight: 800 },
                                "&:hover": { bgcolor: selectedCategory?.id === category.id ? "primary.dark" : "#2d3a4f" }
                            }}
                        />
                    ))}
                </Stack>

                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mt: 2, mb: 1, color: "#ffffff" }}>
                    {selectedCategory?.category_name || "Subcategories"}
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
            </Box>
        </Box>
    );
}
Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
