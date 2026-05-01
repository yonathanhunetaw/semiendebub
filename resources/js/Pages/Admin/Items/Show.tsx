import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box, Chip, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, TableContainer, Stack
} from "@mui/material";
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import EditIcon from '@mui/icons-material/Edit';

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
    general_images: string[] | null;
    category?: { name: string };
    variants: ItemVariant[];
}

export default function Show({ item }: { item: Item }) {
    if (!item) return null;

    const masterFallback = item.general_images?.[0] || item.variants?.[0]?.images?.[0] || "/img/default.jpg";
    const [selectedImage, setSelectedImage] = useState(masterFallback);

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
                        Master Catalog
                    </Typography>
                    <Typography variant="h4" fontWeight={900}>
                        {item.product_name}
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1.5}>
                    <Button
                        variant="outlined"
                        color="inherit"
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
                {/* LEFT: FIXED GALLERY SECTION */}
                <Grid item xs={12} md={5}>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 2,
                            borderRadius: 4,
                            position: 'sticky',
                            top: 24,
                            bgcolor: 'background.paper',
                            overflow: 'hidden' // Prevents thumbnail blowouts
                        }}
                    >
                        {/* Main Image Viewport */}
                        <Box sx={{
                            width: '100%',
                            height: 400,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 2,
                            bgcolor: '#f9f9f9',
                            borderRadius: 2
                        }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }}
                                onError={(e) => { e.currentTarget.src = "/img/default.jpg"; }}
                            />
                        </Box>

                        {/* HORIZONTAL THUMBNAIL VIEW (Scrollable) */}
                        <Typography variant="caption" sx={{ mb: 1, display: 'block', fontWeight: 'bold', color: 'text.secondary' }}>
                            GALLERY ASSETS
                        </Typography>
                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{
                                overflowX: 'auto',
                                pb: 1,
                                '&::-webkit-scrollbar': { height: '6px' },
                                '&::-webkit-scrollbar-thumb': { bgcolor: '#ccc', borderRadius: '10px' }
                            }}
                        >
                            {/* Master Images */}
                            {item.general_images?.map((img, i) => (
                                <Box
                                    key={`m-${i}`}
                                    component="img"
                                    src={img}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{
                                        minWidth: 60, height: 60, borderRadius: 1, cursor: 'pointer',
                                        border: selectedImage === img ? '2px solid #ed6c02' : '1px solid #ddd',
                                        objectFit: 'cover'
                                    }}
                                />
                            ))}
                            {/* Variant Images */}
                            {item.variants?.map((v, i) => v.images?.[0] && (
                                <Box
                                    key={`v-${i}`}
                                    component="img"
                                    src={v.images[0]}
                                    onClick={() => setSelectedImage(v.images[0])}
                                    sx={{
                                        minWidth: 60, height: 60, borderRadius: 1, cursor: 'pointer',
                                        border: selectedImage === v.images[0] ? '2px solid #1976d2' : '1px solid #eee',
                                        objectFit: 'cover'
                                    }}
                                />
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                {/* RIGHT: DETAILS & C-S-P TABLE */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" fontWeight={800} gutterBottom>Description</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
                        {item.product_description || "Standard product entry in Merchant-King catalog."}
                    </Typography>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight={800}>Catalog Variations</Typography>
                        <Chip label={`${item.variants.length} Combinations`} size="small" />
                    </Stack>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
                        <Table size="small" onMouseLeave={() => setSelectedImage(masterFallback)}>
                            <TableHead sx={{ bgcolor: 'grey.50' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Variation</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>C-S-P Path</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {item.variants.map((v) => (
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
                                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
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
