import { SellerCard, SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Chip, Stack, Typography, useTheme } from "@mui/material";
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
    const theme = useTheme();

    // Shared card style for consistency
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
            <Head title="Categories" />
            <SellerHeader title="Categories" />

            <Box sx={{ px: 2, pt: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mb: 1, color: "text.primary" }}>
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
                                bgcolor: selectedCategory?.id === category.id ? "primary.main" : "background.paper",
                                color: selectedCategory?.id === category.id
                                    ? (theme.palette.mode === 'dark' ? "#000" : "#fff")
                                    : "text.primary",
                                border: selectedCategory?.id === category.id ? "none" : "1px solid",
                                borderColor: "divider",
                                "& .MuiChip-label": { px: 1.5, fontWeight: 800 },
                                "&:hover": { bgcolor: selectedCategory?.id === category.id ? "primary.dark" : "action.hover" }
                            }}
                        />
                    ))}
                </Stack>

                <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5, mt: 2, mb: 1, color: "text.primary" }}>
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
