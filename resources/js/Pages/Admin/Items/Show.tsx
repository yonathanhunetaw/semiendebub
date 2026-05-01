import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import {
    Box,
    Chip,
    Divider,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";

/* ---------------------------------------------
 | TypeScript Interfaces
 |---------------------------------------------*/

interface StoreSellerPrice {
    price: number;
    active: boolean;
}

interface StoreVariant {
    id: number;
    stock: number;
    store_seller_prices?: StoreSellerPrice[];
}

interface ItemVariant {
    id: number;
    sku: string | null;
    status: string;
    images: string[] | null;
    item_color?: { name: string };
    item_size?: { name: string };
    item_packaging_type?: { name: string };
    store_variants?: StoreVariant[];
}

interface Item {
    id: number;
    product_name: string;
    product_description: string;
    variants: ItemVariant[];
}

interface Props {
    item: Item;
    allImages: string[];
}

/* ---------------------------------------------
 | Component Logic
 |---------------------------------------------*/

export default function Show({ item, allImages }: Props) {
    const [selectedImage, setSelectedImage] = useState(
        allImages[0] || "/img/default.jpg",
    );

    return (
        <Box sx={{ p: 3 }}>
            <Head title={`Item - ${item.product_name}`} />

            <Grid container spacing={3}>
                {/* LEFT: Image Gallery */}
                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 2, display: "flex", gap: 2, height: "500px" }}>
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                width: "80px",
                                overflowY: "auto",
                                "&::-webkit-scrollbar": { display: "none" },
                            }}
                        >
                            {allImages.map((img, i) => (
                                <Box
                                    key={i}
                                    component="img"
                                    src={img}
                                    onMouseEnter={() => setSelectedImage(img)}
                                    sx={{
                                        width: "100%",
                                        height: "70px",
                                        objectFit: "cover",
                                        borderRadius: 1,
                                        cursor: "pointer",
                                        border: selectedImage === img ? "2px solid #1976d2" : "2px solid transparent",
                                    }}
                                />
                            ))}
                        </Box>

                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', borderRadius: 2 }}>
                            <Box component="img" src={selectedImage} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </Box>
                    </Paper>
                </Grid>

                {/* RIGHT: Details & Variants */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>
                        {item.product_name}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        {item.product_description}
                    </Typography>

                    <Divider sx={{ my: 3 }} />

                    <Typography variant="h6" gutterBottom>
                        Location Inventory & Pricing
                    </Typography>

                    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                        <Table>
                            <TableHead sx={{ bgcolor: "action.hover" }}>
                                <TableRow>
                                    <TableCell>SKU / Details</TableCell>
                                    <TableCell>Store Stock</TableCell>
                                    <TableCell>Seller Price</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {item.variants.map((variant) => {
                                    // Sum stock across all stores for this variant
                                    const totalStock = variant.store_variants?.reduce(
                                        (acc, sv) => acc + sv.stock, 0
                                    ) || 0;

                                    // Get price from the first store variant's active seller price
                                    const activePrice = variant.store_variants?.[0]?.store_seller_prices?.[0]?.price || "N/A";

                                    return (
                                        <TableRow
                                            key={variant.id}
                                            onMouseEnter={() => variant.images?.[0] && setSelectedImage(variant.images[0])}
                                            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold">{variant.sku || 'No SKU'}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {variant.item_color?.name} | {variant.item_size?.name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{totalStock} units</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>
                                                {typeof activePrice === 'number' ? `$${activePrice}` : activePrice}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={variant.status}
                                                    size="small"
                                                    color={variant.status === "active" ? "success" : "default"}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
