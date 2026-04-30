import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import { usePage } from "@inertiajs/react";
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
    FormHelperText,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";

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
    const { url, props } = usePage();
    const auth = props.auth as any;

    // 1. Determine context once
    const isAdmin = url.startsWith("/admin") || auth.user.role === "admin";

    const { data, setData, post, processing, errors } = useForm({
        customer_id: "",
        // Pre-fill seller_id if the user is a seller, otherwise leave empty for Admin selection
        seller_id: isAdmin ? "" : auth.user.id,
        status: "active",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // 2. Dynamic route targeting
        const targetRoute = isAdmin
            ? "admin.carts.store"
            : "seller.carts.store";
        post(route(targetRoute));
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Create New Cart" />

            <Stack direction="row" alignItems="center" spacing={2} mb={4}>
                <Button
                    component={Link}
                    // 3. Dynamic Back Button
                    href={route(
                        isAdmin ? "admin.carts.index" : "seller.carts.index",
                    )}
                    startIcon={<ArrowBackIcon />}
                    variant="text"
                    color="inherit"
                >
                    Back to Carts
                </Button>
                <Typography variant="h4" fontWeight="bold">
                    Create New Cart
                </Typography>
            </Stack>

            <Paper sx={{ p: 4, maxWidth: 600, mx: "auto", boxShadow: 3 }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        {/* Customer Selection */}
                        <FormControl fullWidth error={!!errors.customer_id}>
                            <InputLabel>Select Customer</InputLabel>
                            <Select
                                value={data.customer_id}
                                label="Select Customer"
                                onChange={(e) =>
                                    setData("customer_id", e.target.value)
                                }
                            >
                                <MenuItem value="">
                                    <em>None (Guest Cart)</em>
                                </MenuItem>
                                {customers.map((customer) => (
                                    <MenuItem
                                        key={customer.id}
                                        value={customer.id}
                                    >
                                        {customer.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.customer_id && (
                                <FormHelperText>
                                    {errors.customer_id}
                                </FormHelperText>
                            )}
                        </FormControl>

                        {/* 4. Only show Seller selection if User is Admin */}
                        {isAdmin && (
                            <FormControl fullWidth error={!!errors.seller_id}>
                                <InputLabel>Assigned Seller</InputLabel>
                                <Select
                                    value={data.seller_id}
                                    label="Assigned Seller"
                                    onChange={(e) =>
                                        setData("seller_id", e.target.value)
                                    }
                                >
                                    <MenuItem value="">
                                        <em>Unassigned</em>
                                    </MenuItem>
                                    {sellers.map((seller) => (
                                        <MenuItem
                                            key={seller.id}
                                            value={seller.id}
                                        >
                                            {seller.first_name}{" "}
                                            {seller.last_name || ""}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.seller_id && (
                                    <FormHelperText>
                                        {errors.seller_id}
                                    </FormHelperText>
                                )}
                            </FormControl>
                        )}

                        <Box sx={{ mt: 2 }}>
                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                fullWidth
                                disabled={processing}
                                startIcon={<SaveIcon />}
                            >
                                {processing ? "Creating..." : "Initialize Cart"}
                            </Button>
                        </Box>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
