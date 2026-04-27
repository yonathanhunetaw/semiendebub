import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Grid,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

interface SellerVariant {
    id: number;
}

interface SellerItem {
    id: number;
    product_name: string;
    product_description?: string;
    status?: string;
    variants?: SellerVariant[];
}

export default function Index({ items = [] }: { items?: SellerItem[] }) {
    return (
        <>
            <Head title="Seller Catalog" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Catalog
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Store-ready products with seller-facing pricing and variant visibility.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {items.map((item) => (
                    <Grid key={item.id} size={{ xs: 12, md: 6, xl: 4 }}>
                        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", height: "100%" }}>
                            <Stack spacing={2} sx={{ height: "100%" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                        {item.product_name}
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={item.status ?? "unknown"}
                                        color={item.status === "active" ? "success" : "default"}
                                        variant={item.status === "active" ? "filled" : "outlined"}
                                    />
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                                    {item.product_description || "No product description yet."}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {item.variants?.length ?? 0} variants available
                                </Typography>
                                <Button component={Link} href={route("seller.items.show", item.id)} variant="outlined" sx={{ borderRadius: 3, textTransform: "none", alignSelf: "flex-start" }}>
                                    View Details
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
