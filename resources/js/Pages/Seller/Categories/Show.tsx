import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Grid,
    List,
    ListItem,
    ListItemText,
    Paper,
    Typography,
} from "@mui/material";
import React from "react";

interface Category {
    id: number;
    category_name: string;
}

interface Item {
    id: number;
    product_name: string;
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

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {category.category_name}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Active sellable branches and items inside this category.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Subcategories
                        </Typography>
                        <List disablePadding>
                            {subcategories.map((subcategory) => (
                                <ListItem
                                    key={subcategory.id}
                                    disableGutters
                                    component={Link}
                                    href={route("seller.categories.show", subcategory.id)}
                                    sx={{ textDecoration: "none", color: "inherit" }}
                                >
                                    <ListItemText primary={subcategory.category_name} />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Active Items
                        </Typography>
                        <List disablePadding>
                            {items.map((item) => (
                                <ListItem key={item.id} disableGutters>
                                    <ListItemText primary={item.product_name} />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
