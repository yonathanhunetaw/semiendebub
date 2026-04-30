import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    IconButton,
    Tooltip
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';

interface Cart {
    id: number;
    status: string | null;
    session_id: string | null;
    created_at: string;
    updated_at: string;
    customer?: {
        id: number;
        name: string;
    };
    store?: {
        id: number;
        store_name: string;
    };
    seller?: {
        id: number;
        first_name: string;
        last_name: string | null;
    };
}

interface Props {
    carts: {
        data: Cart[];
    };
}

export default function CartsIndex({ carts }: Props) {
    const cartList = carts.data || [];

    const handleDelete = (cartId: number) => {
        if (confirm('Are you sure you want to delete this cart? This will remove all items associated with it.')) {
            router.delete(route('admin.carts.destroy', cartId), {
                preserveScroll: true,
            });
        }
    };

    const getStatusColor = (status: string | null): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
        switch (status?.toLowerCase()) {
            case 'active':
                return 'success';
            case 'pending':
                return 'warning';
            case 'abandoned':
                return 'error';
            default:
                return 'default';
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Carts Management" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" fontWeight="bold">Carts</Typography>
                <Button
                    component={Link}
                    href={route('admin.carts.store')} // Or your creation route
                    variant="contained"
                    method="post"
                    startIcon={<AddIcon />}
                >
                    New Cart
                </Button>
            </Stack>

            {/* Carts Table */}
            <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'background.default' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Cart Info</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Store</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Seller/Staff</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {cartList.length > 0 ? cartList.map((cart) => (
                            <TableRow key={cart.id} hover>
                                <TableCell>
                                    <Typography variant="body1" fontWeight="medium">
                                        ID: {cart.id}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                        SES: {cart.session_id?.substring(0, 8) || 'N/A'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">
                                        {cart.store?.store_name || 'Main Branch'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                        {cart.customer?.name || 'Guest'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {cart.seller
                                            ? `${cart.seller.first_name} ${cart.seller.last_name || ''}`
                                            : 'Unassigned'
                                        }
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={cart.status || 'Active'}
                                        size="small"
                                        color={getStatusColor(cart.status)}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <Tooltip title="View Items">
                                            <IconButton
                                                component={Link}
                                                href={route('admin.carts.show', cart.id)}
                                                size="small"
                                                color="info"
                                            >
                                                <VisibilityIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton
                                                onClick={() => handleDelete(cart.id)}
                                                size="small"
                                                color="error"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <Typography variant="body1" color="text.secondary">
                                        No active carts found.
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

CartsIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
