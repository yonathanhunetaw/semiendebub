import {useState} from "react"; // 1. Added missing import
import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head} from "@inertiajs/react";
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
    Typography
} from "@mui/material";

interface Variant {
    color: string | null;
    size: string | null;
    packaging: string | null;
    img: string;
    price: number;
    stock: number;
    disabled: boolean;
}

interface Props {
    item: any;
    variantData: Variant[];
    allImages: string[];
}

export default function Show({item, variantData, allImages}: Props) {
    // 2. Initialize state with the first image or default
    const [selectedImage, setSelectedImage] = useState(allImages[0] || '/img/default.jpg');

    // @ts-ignore
    // @ts-ignore
    return (
        <Box sx={{p: 3}}>
            <Head title={`Item - ${item.product_name}`}/>

            <Grid container spacing={3}>
                {/* LEFT: Enhanced Image Gallery */}
                <Grid size={{xs: 12, md: 5}}>
                    <Paper sx={{p: 2, display: 'flex', gap: 2, height: '500px'}}>

                        {/* Vertical Thumbnail Chooser */}
                        <Box sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                            width: '80px',
                            overflowY: 'auto',
                            '&::-webkit-scrollbar': {display: 'none'},
                            msOverflowStyle: 'none',
                        }}>
                            {allImages.map((img, i) => (
                                <Box
                                    key={i}
                                    component="img"
                                    src={img}
                                    onMouseEnter={() => setSelectedImage(img)}
                                    onClick={() => setSelectedImage(img)}
                                    sx={{
                                        width: '100%',
                                        height: '70px',
                                        objectFit: 'cover',
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        border: selectedImage === img ? '2px solid #1976d2' : '2px solid transparent',
                                        transition: '0.2s',
                                        '&:hover': {opacity: 0.8}
                                    }}
                                />
                            ))}
                        </Box>

                        {/* Main Image Viewer */}
                        <Box sx={{
                            flex: 1,
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 2,
                            bgcolor: '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    transition: '0.3s ease-in-out'
                                }}
                            />
                        </Box>
                    </Paper>
                </Grid>

                {/* RIGHT: Details & Variants */}
                <Grid size={{xs: 12, md: 7}}>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>
                        {item.product_name}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        {item.product_description}
                    </Typography>

                    <Divider sx={{my: 3}}/>

                    <Typography variant="h6" gutterBottom>Variants & Inventory</Typography>
                    <Paper variant="outlined" sx={{overflow: 'hidden'}}>
                        <Table>
                            <TableHead sx={{bgcolor: 'action.hover'}}>
                                <TableRow>
                                    <TableCell>Preview</TableCell>
                                    <TableCell>Details</TableCell>
                                    <TableCell>Price</TableCell>
                                    <TableCell>Stock</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {variantData.map((variant, index) => (
                                    <TableRow
                                        key={index}
                                        sx={{
                                            opacity: variant.disabled ? 0.5 : 1,
                                            '&:hover': {bgcolor: 'action.hover', cursor: 'pointer'}
                                        }}
                                        onMouseEnter={() => variant.img && setSelectedImage(variant.img)}
                                    >
                                        <TableCell>
                                            <img src={variant.img} width="50"
                                                 style={{borderRadius: '4px', objectFit: 'cover'}}/>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="medium">
                                                {variant.color} / {variant.size} / {variant.packaging}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{fontWeight: 'bold'}}>${variant.price}</TableCell>
                                        <TableCell>{variant.stock}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={variant.disabled ? 'Inactive' : 'Active'}
                                                color={variant.disabled ? 'error' : 'success'}
                                                size="small"
                                            />
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
