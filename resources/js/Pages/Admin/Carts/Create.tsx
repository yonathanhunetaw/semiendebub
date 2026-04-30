import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Paper,
    Stack,
    Typography,
    TextField,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
    FormHelperText
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

interface Customer {
    id: number;
    name: string;
}

interface Seller {
    id: number;
    first_name: string;
    last_name: string | null;
}

interface Props {
    customers: Customer[];
    sellers: Seller[];
}

export default function Create({ customers, sellers }: Props) {
    // Inertia form helper
    const { data, setData, post, processing, errors } = useForm({
        customer_id: '',
        seller_id: '',
        status: 'active',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.carts.store'));
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Create New Cart" />

            <Stack direction="row" alignItems="center" spacing={2} mb={4}>
                <Button
                    component={Link}
                    href={route('admin.carts.index')}
                    startIcon={<ArrowBackIcon />}
                    variant="text"
                    color="inherit"
                >
                    Back to Carts
                </Button>
                <Typography variant="h4" fontWeight="bold">Create New Cart</Typography>
            </Stack>

            <Paper sx={{ p: 4, maxWidth: 600, mx: 'auto', boxShadow: 3 }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>

                        {/* Customer Selection */}
                        <FormControl fullWidth error={!!errors.customer_id}>
                            <InputLabel id="customer-label">Select Customer</InputLabel>
                            <Select
                                labelId="customer-label"
                                value={data.customer_id}
                                label="Select Customer"
                                onChange={e => setData('customer_id', e.target.value)}
                            >
                                <MenuItem value=""><em>None (Guest Cart)</em></MenuItem>
                                {customers.map(customer => (
                                    <MenuItem key={customer.id} value={customer.id}>
                                        {customer.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.customer_id && <FormHelperText>{errors.customer_id}</FormHelperText>}
                        </FormControl>

                        {/* Seller/Staff Selection */}
                        <FormControl fullWidth error={!!errors.seller_id}>
                            <InputLabel id="seller-label">Assigned Seller</InputLabel>
                            <Select
                                labelId="seller-label"
                                value={data.seller_id}
                                label="Assigned Seller"
                                onChange={e => setData('seller_id', e.target.value)}
                            >
                                <MenuItem value=""><em>Unassigned</em></MenuItem>
                                {sellers.map(seller => (
                                    <MenuItem key={seller.id} value={seller.id}>
                                        {seller.first_name} {seller.last_name || ''}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.seller_id && <FormHelperText>{errors.seller_id}</FormHelperText>}
                        </FormControl>

                        {/* Status Selection */}
                        <FormControl fullWidth>
                            <InputLabel id="status-label">Initial Status</InputLabel>
                            <Select
                                labelId="status-label"
                                value={data.status}
                                label="Initial Status"
                                onChange={e => setData('status', e.target.value)}
                            >
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="pending">Pending</MenuItem>
                            </Select>
                        </FormControl>

                        <Box sx={{ mt: 2 }}>
                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                fullWidth
                                disabled={processing}
                                startIcon={<SaveIcon />}
                            >
                                {processing ? 'Creating...' : 'Initialize Cart'}
                            </Button>
                        </Box>

                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
