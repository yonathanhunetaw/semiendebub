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

export default function Show({ item, allImages }: Props) {
    const [selectedImage, setSelectedImage] = useState(allImages[0] || "/img/default.jpg");
    const [openDeploy, setOpenDeploy] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState('');

    const handleDeploy = () => {
        // Here you would use useForm or router.post to link the ITEM to the STORE
        // This should only create the relationship, not set stock/price.
        console.log(`Deploying ${item.product_name} to location: ${selectedLocation}`);
        setOpenDeploy(false);
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title={`Item - ${item.product_name}`} />

            {/* ACTION BAR */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    {item.product_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddBusinessIcon />}
                        onClick={() => setOpenDeploy(true)}
                        color="primary"
                    >
                        Deploy to Location
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={3}>
                {/* LEFT: Image Gallery (existing logic) */}
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
                {/* RIGHT: Details & Variants */}
                <Grid item xs={12} md={7}>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        {item.product_description}
                    </Typography>

                    <Divider sx={{ my: 3 }} />

                    {/* Inventory Table (existing logic) */}
                    <Paper variant="outlined">
                        {/* ... your existing table code */}
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
