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
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    return (
        <Box sx={{p: 3}}>
            <Head title={`Item - ${item.product_name}`}/>

            <Grid container spacing={3}>
                {/* Left: Images */}
                <Grid size={{xs: 12, md: 4}}>
                    <Paper sx={{p: 2}}>
                        <Box
                            component="img"
                            src={allImages[0] || '/img/default.jpg'}
                            sx={{width: '100%', borderRadius: 2}}
                        />
                        <Grid container spacing={1} mt={1}>
                            {allImages.slice(1).map((img, i) => (
                                <Grid size={{xs: 6}} key={i}>
                                    {/*<Grid item xs={3} key={i}>*/}
                                    <img src={img} style={{width: '100%', borderRadius: '4px'}}/>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                {/* Right: Details & Variants */}
                <Grid size={{xs: 12, md: 8}}>
                    <Typography variant="h4" gutterBottom>{item.product_name}</Typography>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        {item.product_description}
                    </Typography>

                    <Divider sx={{my: 3}}/>

                    <Typography variant="h6" gutterBottom>Variants & Inventory</Typography>
                    <Table>
                        <TableHead>
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
                                <TableRow key={index} sx={{opacity: variant.disabled ? 0.5 : 1}}>
                                    <TableCell>
                                        <img src={variant.img} width="50" style={{borderRadius: '4px'}}/>
                                    </TableCell>
                                    <TableCell>
                                        {variant.color} / {variant.size} / {variant.packaging}
                                    </TableCell>
                                    <TableCell>${variant.price}</TableCell>
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
                </Grid>
            </Grid>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
