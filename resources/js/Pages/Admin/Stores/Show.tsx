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

export default function InventoryShow({ store, inventory = [] }: any) {
    const items = Array.isArray(inventory) ? inventory : [];
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
                        {items.length > 0 ? (
                            items.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {item.item_name}
                                    </TableCell>
                                    <TableCell>{item.sku}</TableCell>
                                    <TableCell>${item.price}</TableCell>
                                    <TableCell>{item.stock}</TableCell>
                                    <TableCell>{item.status}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    No variants found for this store.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

InventoryShow.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
