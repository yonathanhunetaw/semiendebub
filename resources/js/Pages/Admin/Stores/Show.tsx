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

export default function InventoryShow({ store, inventory = [] }: Props) {
    // Standardize to array to prevent .length errors
    const items = Array.isArray(inventory) ? inventory : [];

    return (
        <Box p={3}>
            <Head title={`${store?.name || 'Store'} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Button
                    component={Link}
                    href={route("store.index")}
                    startIcon={<ArrowBackIcon />}
                    variant="outlined"
                    size="small"
                >
                    Back to Stores
                </Button>
                <Typography variant="h5" fontWeight={700}>
                    {store?.name} Inventory
                </Typography>
            </Stack>

            <TableContainer
                component={Paper}
                elevation={0}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Item Name</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>SKU</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Price</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Stock Level</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items && items.length > 0 ? (
                            items.map((item) => (
                                <TableRow key={item.id} hover>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                        {item.item_name}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                            {item.sku}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>${Number(item.price).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={`${item.stock} in stock`}
                                            size="small"
                                            color={item.stock > 0 ? "success" : "error"}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={item.status}
                                            size="small"
                                            variant="filled"
                                            sx={{ textTransform: 'capitalize' }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                    <Typography color="text.secondary">
                                        No inventory items found for this store.
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
