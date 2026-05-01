import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import {
    Box, Chip, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, TableContainer
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
    general_images: string[] | null; // <--- Master images added
    category?: { name: string };
    variants: ItemVariant[];
}

interface Props {
    item: Item;
    allImages: string[];
}

export default function Show({ item, allImages = [] }: Props) {
    if (!item) return null;

    // Default to Master image, fallback to Variant, fallback to default.jpg
    const defaultMasterImage = item.general_images?.[0] || item.variants?.[0]?.images?.[0] || "/img/default.jpg";
    const [selectedImage, setSelectedImage] = useState(defaultMasterImage);
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

                        {/* Main Preview */}
                        <Box sx={{ width: '100%', height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: '0.2s ease-in-out' }}
                                onError={(e) => { e.currentTarget.src = "/img/default.jpg"; }}
                            />
                        </Box>

                        {/* Thumbnail Strip */}
                        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>

                            {/* FIRST: Render Master/General Images */}
                            {item.general_images?.map((img, i) => (
                                <Box
                                    key={`master-${i}`}
                                    component="img"
                                    src={img}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{
                                        width: 70, height: 70, borderRadius: 1, cursor: 'pointer',
                                        border: selectedImage === img ? '2px solid #ed6c02' : '2px solid #ccc',
                                        objectFit: 'cover',
                                        opacity: selectedImage === img ? 1 : 0.7
                                    }}
                                />
                            ))}

                            {/* SECOND: Render Variant C-S-P Images */}
                            {item.variants?.map((v, i) => (
                                v.images?.[0] && (
                                    <Box
                                        key={`variant-${i}`}
                                        component="img"
                                        src={v.images[0]}
                                        onClick={() => setSelectedImage(v.images[0])}
                                        sx={{
                                            width: 70, height: 70, borderRadius: 1, cursor: 'pointer',
                                            border: selectedImage === v.images[0] ? '2px solid #1976d2' : '2px solid transparent',
                                            objectFit: 'cover'
                                        }}
                                    />
                                )
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
                        {/* MouseLeave on the table snaps the gallery back to the Master image */}
                        <Table size="medium" onMouseLeave={() => setSelectedImage(defaultMasterImage)}>
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
                                        // Hover updates the gallery to show C-S-P specific image
                                        onMouseEnter={() => {
                                            if (variant.images?.[0]) setSelectedImage(variant.images[0]);
                                        }}
                                        sx={{ cursor: 'pointer' }}
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
                                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                {/* Correctly reading from the variant array, not the master array */}
                                                {variant.images?.[0]?.replace('/images/product_images/', '') || 'No Image Configured'}
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

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
