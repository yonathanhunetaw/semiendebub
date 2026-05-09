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

interface InventoryItem {
    id: number;
    sku: string;
    item_name: string;
    price: number;
    stock: number;
    status: string;
}

interface Props {
    store: {
        id: number;
        name: string;
    };
    inventory: InventoryItem[];
}

// 1. We set default values right in the parameters
export default function InventoryShow({
    store = { name: "Store" },
    inventory = [],
}: any) {
    // 2. We create a safe local variable.
    // If inventory is null/undefined, it becomes an empty array.
    const safeItems = Array.isArray(inventory) ? inventory : [];

    return (
        <Box p={3}>
            <Head title={`${store?.name || "Store"} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Button
                    component={Link}
                    href={route("store.index")}
                    startIcon={<ArrowBackIcon />}
                    variant="outlined"
                >
                    Back
                </Button>
                <Typography variant="h4">
                    {store?.name || "Loading..."}
                </Typography>
            </Stack>

            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Item Name
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                SKU
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Price
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Stock
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Status
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {/* 3. We check safeItems.length instead of inventory.length */}
                        {safeItems.length > 0 ? (
                            safeItems.map((item: any) => (
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
                                <TableCell
                                    colSpan={5}
                                    align="center"
                                    sx={{ py: 5 }}
                                >
                                    <Typography color="text.secondary">
                                        No items found for this store.
                                    </Typography>
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
