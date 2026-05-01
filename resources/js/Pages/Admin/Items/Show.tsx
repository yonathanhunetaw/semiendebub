import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box, Chip, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, TableContainer, Stack, IconButton
} from "@mui/material";
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';interface ItemVariant {
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
    general_images: string[] | null;
    category?: { name: string };
    variants: ItemVariant[];
}
export default function Show({ item }: { item: any }) {
    if (!item) return null;

    const masterFallback = item.general_images?.[0] || item.variants?.[0]?.images?.[0] || "/img/default.jpg";
    const [selectedImage, setSelectedImage] = useState(masterFallback);
    const [showAllThumbnails, setShowAllThumbnails] = useState(false);

    // Combine all images into one flat array for the gallery
    const allGalleryImages = [
        ...(item.general_images || []),
        ...item.variants.map((v: any) => v.images?.[0]).filter(Boolean)
    ];

    // Limit view to 5 unless toggled
    const displayedThumbnails = showAllThumbnails ? allGalleryImages : allGalleryImages.slice(0, 5);
    const hasMore = allGalleryImages.length > 5;

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: '1440px', margin: '0 auto' }}>
            <Head title={`Catalog: ${item.product_name}`} />

            {/* HEADER & GLOBAL ACTIONS */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: 1 }}>
                        Merchant-King Catalog
                    </Typography>
                    <Typography variant="h4" fontWeight={900}>
                        {item.product_name}
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1.5}>
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<EditIcon />}
                        component={Link}
                        href={route('admin.items.edit', item.id)}
                        sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                    >
                        Edit Product
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddBusinessIcon />}
                        sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none', px: 3 }}
                    >
                        Deploy to Store
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={4}>
                {/* GALLERY SECTION */}
                <Grid item xs={12} md={5}>
                    <Paper
                        variant="outlined"
                        sx={{ p: 2, borderRadius: 4, position: 'sticky', top: 24, bgcolor: 'background.paper' }}
                    >
                        <Box sx={{
                            width: '100%', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            mb: 2, bgcolor: '#f5f5f5', borderRadius: 2, overflow: 'hidden'
                        }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                onError={(e: any) => { e.currentTarget.src = "/img/default.jpg"; }}
                            />
                        </Box>

                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                                GALLERY ASSETS ({allGalleryImages.length})
                            </Typography>
                            {hasMore && (
                                <Button
                                    size="small"
                                    onClick={() => setShowAllThumbnails(!showAllThumbnails)}
                                    endIcon={showAllThumbnails ? <KeyboardArrowLeftIcon /> : <ExpandMoreIcon />}
                                    sx={{ fontSize: '0.65rem', fontWeight: 700 }}
                                >
                                    {showAllThumbnails ? "Show Less" : `+${allGalleryImages.length - 5} More`}
                                </Button>
                            )}
                        </Stack>

                        <Box sx={{
                            display: 'flex',
                            flexWrap: showAllThumbnails ? 'wrap' : 'nowrap',
                            gap: 1,
                            overflowX: showAllThumbnails ? 'unset' : 'auto',
                            pb: 1
                        }}>
                            {displayedThumbnails.map((img: string, i: number) => (
                                <Box
                                    key={i}
                                    component="img"
                                    src={img}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{
                                        width: 64, height: 64, borderRadius: 1.5, cursor: 'pointer',
                                        border: selectedImage === img ? '2px solid #1976d2' : '1px solid #ddd',
                                        objectFit: 'cover',
                                        transition: '0.2s',
                                        '&:hover': { borderColor: 'primary.main', transform: 'scale(1.05)' }
                                    }}
                                />
                            ))}
                        </Box>
                    </Paper>
                </Grid>

                {/* DETAILS & TABLE */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" fontWeight={800} gutterBottom>Global Description</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
                        {item.product_description || "No description provided for this catalog entry."}
                    </Typography>

                    <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Catalog Variations</Typography>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                        <Table size="small" onMouseLeave={() => setSelectedImage(masterFallback)}>
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Variation</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>C-S-P Path</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {item.variants.map((v: any) => (
                                    <TableRow
                                        key={v.id}
                                        hover
                                        onMouseEnter={() => v.images?.[0] && setSelectedImage(v.images[0])}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{v.sku}</TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {v.item_color?.name} / {v.item_size?.name || '0'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Pkg: {v.item_packaging_type?.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                                                {v.images?.[0]?.split('/product_images/')[1] || '---'}
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
