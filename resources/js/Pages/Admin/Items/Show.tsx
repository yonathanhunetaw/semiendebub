import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head } from "@inertiajs/react";
import {
    Box, Chip, Divider, Grid, Paper, Table, TableBody, TableCell,
    TableHead, TableRow, Typography, Button, Modal, MenuItem, Select, FormControl, InputLabel
} from "@mui/material";
import AddBusinessIcon from '@mui/icons-material/AddBusiness'; // Icon for deployment

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

export default function Show({ item, allImages = [] }: Props) {
    // Safety check: if item is missing, show a loading state instead of crashing
    if (!item) return <Typography>Loading Item Data...</Typography>;

    const [selectedImage, setSelectedImage] = useState(
        allImages?.[0] || "/img/default.jpg"
    );
    const [openDeploy, setOpenDeploy] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState('');

    return (
        <Box sx={{ p: 3 }}>
            <Head title={`Item - ${item?.product_name || 'Loading'}`} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    {item?.product_name}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddBusinessIcon />}
                    onClick={() => setOpenDeploy(true)}
                >
                    Deploy to Location
                </Button>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 2, display: "flex", gap: 2, height: "500px" }}>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "80px", overflowY: "auto" }}>
                            {allImages?.map((img, i) => (
                                <Box
                                    key={i}
                                    component="img"
                                    src={img}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{ width: "100%", height: "70px", objectFit: "cover", cursor: "pointer", border: selectedImage === img ? "2px solid #1976d2" : "2px solid transparent" }}
                                />
                            ))}
                        </Box>
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box component="img" src={selectedImage} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        {item?.product_description}
                    </Typography>
                    <Divider sx={{ my: 3 }} />

                    <Paper variant="outlined">
                        <Table>
                            <TableHead sx={{ bgcolor: "action.hover" }}>
                                <TableRow>
                                    <TableCell>SKU / Details</TableCell>
                                    <TableCell>Store Stock</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {/* Use optional chaining (?.) to prevent crashes if variants is undefined */}
                                {item?.variants?.map((variant) => (
                                    <TableRow key={variant.id}>
                                        <TableCell>{variant.sku || 'No SKU'}</TableCell>
                                        <TableCell>
                                            {variant.store_variants?.reduce((acc, sv) => acc + sv.stock, 0) || 0} units
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={variant.status} size="small" color={variant.status === 'active' ? 'success' : 'default'} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
