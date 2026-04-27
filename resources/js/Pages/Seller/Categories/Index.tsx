import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Grid,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Typography,
} from "@mui/material";
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

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Categories
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Explore the catalog tree from parent categories into sellable branches.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, px: 1, py: 1 }}>
                            Main Categories
                        </Typography>
                        <List>
                            {mainCategories.map((category) => (
                                <ListItemButton
                                    key={category.id}
                                    component={Link}
                                    href={`${route("seller.categories.index")}?category_id=${category.id}`}
                                    selected={selectedCategory?.id === category.id}
                                    sx={{ borderRadius: 3 }}
                                >
                                    <ListItemText primary={category.category_name} />
                                </ListItemButton>
                            ))}
                        </List>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            {selectedCategory?.category_name || "Subcategories"}
                        </Typography>
                        <Grid container spacing={2}>
                            {subcategories.map((subcategory) => (
                                <Grid key={subcategory.id} size={{ xs: 12, sm: 6 }}>
                                    <Paper
                                        component={Link}
                                        href={route("seller.categories.show", subcategory.id)}
                                        elevation={0}
                                        sx={{
                                            p: 2,
                                            borderRadius: 3,
                                            border: "1px solid",
                                            borderColor: "divider",
                                            textDecoration: "none",
                                            color: "inherit",
                                        }}
                                    >
                                        <Typography sx={{ fontWeight: 700 }}>
                                            {subcategory.category_name}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
