import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import {
    Box, Chip, Divider, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, Modal, MenuItem, Select, FormControl, InputLabel
} from "@mui/material";
import AddBusinessIcon from '@mui/icons-material/AddBusiness';

/* ---------------------------------------------
 | TypeScript Interfaces
 |---------------------------------------------*/

interface ItemVariant {
    id: number;
    sku: string | null;
    status: string;
    images: string[] | null;
    item_color?: { name: string };
    item_size?: { name: string };
    item_packaging_type?: { name: string };
}

interface Item {
    id: number;
    product_name: string;
    product_description: string;
    category?: { name: string };
    variants: ItemVariant[];
}

interface Props {
    item: Item;
    allImages: string[];
}

export default function Show({ item, allImages = [] }: Props) {
    if (!item) return null;

    // Default to the first image in the master array
    const [selectedImage, setSelectedImage] = useState(item.variants?.[0]?.images?.[0] || "/img/default.jpg");
    const [openDeploy, setOpenDeploy] = useState(false);

    return (
        <Box sx={{ p: 4, maxWidth: '1400px', margin: '0 auto' }}>
            <Head title={`Catalog: ${item.product_name}`} />

            {/* HEADER SECTION */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <Box>
                    <Typography variant="overline" color="primary" sx={{ fontWeight: 'bold' }}>
                        Master Catalog Entry
                    </Typography>
                    <Typography variant="h3" fontWeight="800">
                        {item.product_name}
                    </Typography>
                    {item.category && (
                        <Chip label={item.category.name} size="small" sx={{ mt: 1 }} />
                    )}
                </Box>

                <Button
                    variant="contained"
                    size="large"
                    startIcon={<AddBusinessIcon />}
                    onClick={() => setOpenDeploy(true)}
                    sx={{ borderRadius: '8px', px: 4 }}
                >
                    Deploy to Location
                </Button>
            </Box>

            <Grid container spacing={4}>
                {/* GALLERY */}
                <Grid item xs={12} md={5}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ width: '100%', height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: '0.3s' }}
                                // Fallback for missing images on the server
                                onError={(e) => { e.currentTarget.src = "/img/default.jpg"; }}
                            />
                        </Box>
                        {/* Thumbnail Strip */}
                        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                            {item.variants?.map((v, i) => (
                                <Box
                                    key={i}
                                    component="img"
                                    src={v.images?.[0]}
                                    onClick={() => setSelectedImage(v.images?.[0])}
                                    sx={{
                                        width: 70, height: 70, borderRadius: 1, cursor: 'pointer',
                                        border: selectedImage === v.images?.[0] ? '2px solid #1976d2' : '2px solid transparent',
                                        objectFit: 'cover'
                                    }}
                                />
                            ))}
                        </Box>
                    </Paper>
                </Grid>

                {/* SPECIFICATIONS */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" gutterBottom fontWeight="bold">Description</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.7 }}>
                        {item.product_description || "No description provided for this master item."}
                    </Typography>

                    <Typography variant="h6" gutterBottom fontWeight="bold">Available Variations</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        These are the global specifications for this product. Stock levels and store-specific pricing are managed within individual store inventory pages.
                    </Typography>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="medium">
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Variation Details</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Storage Path</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {item.variants?.map((variant) => (
                                    <TableRow
                                        key={variant.id}
                                        hover
                                        // Update gallery on hover to show C-S-P specific image
                                        onMouseEnter={() => setSelectedImage(variant.images?.[0])}
                                    >
                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                            {variant.sku || 'PENDING'}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {variant.item_color?.name || 'No Color'} / {variant.item_size?.name || 'No Size'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Pkg: {variant.item_packaging_type?.name || 'Standard'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {/* Useful for debugging the Color-Size-Packaging folder structure */}
                                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                {variant.images?.[0]?.replace('/images/product_images/', '')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Box>
    );
}

// Add this wrapper to help debug if the screen goes white
import { TableContainer } from "@mui/material";

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
