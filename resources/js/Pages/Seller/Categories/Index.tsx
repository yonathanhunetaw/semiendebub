import { SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Stack, Typography } from "@mui/material";
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
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Head title="Categories" />
            <SellerHeader title="Categories" />

            {/* Body: sidebar + content */}
            <Box sx={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100dvh - 56px)" }}>

                {/* ── Left sidebar ── */}
                <Box
                    sx={{
                        width: 96,
                        flexShrink: 0,
                        overflowY: "auto",
                        borderRight: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        "&::-webkit-scrollbar": { display: "none" },
                    }}
                >
                    {mainCategories.map((category) => {
                        const isActive = selectedCategory?.id === category.id;
                        return (
                            <Box
                                key={category.id}
                                component={Link}
                                href={`${route("seller.categories.index")}?category_id=${category.id}`}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    textDecoration: "none",
                                    px: 1.5,
                                    py: 1.75,
                                    position: "relative",
                                    bgcolor: isActive ? "background.default" : "background.paper",
                                    borderLeft: isActive ? "3px solid" : "3px solid transparent",
                                    borderColor: isActive ? "primary.main" : "transparent",
                                    transition: "background 0.15s",
                                    "&:active": { bgcolor: "action.selected" },
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontWeight: isActive ? 800 : 500,
                                        color: isActive ? "primary.main" : "text.secondary",
                                        fontSize: "0.72rem",
                                        lineHeight: 1.35,
                                        wordBreak: "keep-all",
                                    }}
                                >
                                    {category.category_name}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                {/* ── Right content panel ── */}
                <Box
                    sx={{
                        flex: 1,
                        overflowY: "auto",
                        bgcolor: "background.default",
                        px: 1.5,
                        pt: 1.5,
                        pb: 3,
                        "&::-webkit-scrollbar": { display: "none" },
                    }}
                >
                    {/* Section heading */}
                    {selectedCategory && (
                        <Typography
                            variant="caption"
                            sx={{
                                display: "block",
                                fontWeight: 800,
                                color: "text.disabled",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                mb: 1.5,
                                px: 0.5,
                            }}
                        >
                            {selectedCategory.category_name}
                        </Typography>
                    )}

                    {/* Subcategory grid */}
                    {subcategories.length > 0 ? (
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 1,
                            }}
                        >
                            {subcategories.map((subcategory) => (
                                <Box
                                    key={subcategory.id}
                                    component={Link}
                                    href={route("seller.categories.show", subcategory.id)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        textDecoration: "none",
                                        bgcolor: "background.paper",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 2,
                                        px: 1.25,
                                        py: 1.25,
                                        gap: 0.5,
                                        transition: "background 0.15s",
                                        "&:active": { bgcolor: "action.selected" },
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            fontWeight: 700,
                                            color: "text.primary",
                                            fontSize: "0.78rem",
                                            lineHeight: 1.3,
                                            flex: 1,
                                        }}
                                    >
                                        {subcategory.category_name}
                                    </Typography>
                                    <ChevronRightRoundedIcon
                                        sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }}
                                    />
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <Stack alignItems="center" justifyContent="center" sx={{ pt: 8 }}>
                            <Typography variant="body2" color="text.disabled">
                                {selectedCategory
                                    ? "No subcategories"
                                    : "Select a category"}
                            </Typography>
                        </Stack>
                    )}
                </Box>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
