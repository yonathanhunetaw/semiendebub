import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box, Chip, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, TableContainer, Stack
} from "@mui/material";
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import EditIcon from '@mui/icons-material/Edit';

/* ---------------------------------------------
 | TypeScript Interfaces
 |---------------------------------------------*/
interface ItemVariant {
    id: number;
    sku: string | null;
    images: string[] | null;
    item_color?: { name: string };
    item_size?: { name: string };
    item_packaging_type?: { name: string };
}

interface Item {
    id: number;
    product_name: string;
    product_description: string;
    general_images: string[] | null; // Master images
    category?: { name: string };
    variants: ItemVariant[];
}

interface Props {
    item: Item;
}

export default function Show({ item }: Props) {
    if (!item) return null;

    // Default image logic: Master > First Variant > Default
    const masterFallback = item.general_images?.[0] || item.variants?.[0]?.images?.[0] || "/img/default.jpg";
    const [selectedImage, setSelectedImage] = useState(masterFallback);

    return (
        <Box sx={{ p: 4, maxWidth: '1400px', margin: '0 auto' }}>
            <Head title={`Catalog: ${item.product_name}`} />

            {/* HEADER SECTION */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={4}>
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

                <Stack direction="row" spacing={2}>
                    <Button
                        variant="outlined"
                        startIcon={<EditIcon />}
                        component={Link}
                        href={route('admin.items.edit', item.id)}
                        sx={{ borderRadius: '8px', px: 3, fontWeight: 'bold' }}
                    >
                        Edit Master
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddBusinessIcon />}
                        sx={{ borderRadius: '8px', px: 3, fontWeight: 'bold' }}
                    >
                        Deploy to Location
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={4}>
                {/* GALLERY SECTION */}
                <Grid item xs={12} md={5}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'background.paper' }}>
                        <Box sx={{ width: '100%', height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: '0.3s' }}
                                onError={(e) => { e.currentTarget.src = "/img/default.jpg"; }}
                            />
                        </Box>

                        {/* Thumbnail Strip: Master Images (Orange) + Variant Images (Blue) */}
                        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                            {item.general_images?.map((img, i) => (
                                <Box
                                    key={`master-${i}`}
                                    component="img"
                                    src={img}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{
                                        width: 70, height: 70, borderRadius: 1, cursor: 'pointer',
                                        border: selectedImage === img ? '2px solid #ed6c02' : '2px solid #eee',
                                        objectFit: 'cover'
                                    }}
                                />
                            ))}
                            {item.variants?.map((v, i) => v.images?.[0] && (
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
                            ))}
                        </Box>
                    </Paper>
                </Grid>

                {/* DETAILS & VARIATIONS */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" gutterBottom fontWeight="bold">Description</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                        {item.product_description || "No description provided."}
                    </Typography>

                    <Typography variant="h6" gutterBottom fontWeight="bold">Global Variations</Typography>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table onMouseLeave={() => setSelectedImage(masterFallback)}>
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Attributes</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>C-S-P Protocol Path</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {item.variants?.map((variant) => (
                                    <TableRow
                                        key={variant.id}
                                        hover
                                        onMouseEnter={() => variant.images?.[0] && setSelectedImage(variant.images[0])}
                                    >
                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                            {variant.sku}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {variant.item_color?.name} / {variant.item_size?.name || 'No Size'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {variant.item_packaging_type?.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                                                {variant.images?.[0]?.split('/product_images/')[1] || 'No Path'}
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
