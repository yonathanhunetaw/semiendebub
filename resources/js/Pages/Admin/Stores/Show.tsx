import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Stack,
    Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export default function StoreShow({ store, inventory }: any) {
    return (
        <Box p={3}>
            <Head title={`${store.name} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Button
                    component={Link}
                    href={route("store.index")}
                    startIcon={<ArrowBackIcon />}
                >
                    Back
                </Button>
                <Typography variant="h4">{store.name} Inventory</Typography>
            </Stack>

            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Item Name</TableCell>
                            <TableCell>SKU</TableCell>
                            <TableCell>Price</TableCell>
                            <TableCell>Stock Level</TableCell>
                            <TableCell>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {inventory.map((item: any) => (
                            <TableRow key={item.id}>
                                <TableCell sx={{ fontWeight: "bold" }}>
                                    {item.item_name}
                                </TableCell>
                                <TableCell>{item.sku}</TableCell>
                                <TableCell>${item.price}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={item.stock}
                                        color={
                                            item.stock > 10
                                                ? "success"
                                                : "error"
                                        }
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>{item.status}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

StoreShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
