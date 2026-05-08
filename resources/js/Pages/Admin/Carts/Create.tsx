import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, Link, usePage } from "@inertiajs/react";
import {
    Box,
    Button,
    Paper,
    Stack,
    Typography,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
    FormHelperText,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";

// 1. Define strict interfaces
interface Customer {
    id: number;
    name: string;
}

interface Seller {
    id: number;
    first_name: string;
    last_name: string | null;
}

interface Store {
    id: number;
    name: string;
}

interface Props {
    customers: Customer[];
    sellers: Seller[];
    stores: Store[];
    // Include auth in the props interface to satisfy TypeScript
    auth: {
        user: {
            id: number;
            role: string;
            store_id: number | null;
        };
    };
}

export default function Create({ customers, sellers, stores, auth }: Props) {
    const { url } = usePage();

    // 2. Determine context based on the user's role instead of the URL path
    const isAdmin = auth.user.role === "admin";

    // 3. Initialize form with proper logic
    const { data, setData, post, processing, errors } = useForm({
        customer_id: "" as string | number,
        // If admin, they must pick a store. If seller, it defaults to their store.
        store_id: isAdmin ? "" : auth.user.store_id || "",
        // If admin, they pick a seller. If seller, they are the seller.
        seller_id: isAdmin ? "" : auth.user.id,
        status: "active",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Target the correct controller based on context
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
                        {/* STORE SELECTION: Visible only to Admin */}
                        {isAdmin && (
                            <FormControl fullWidth error={!!errors.store_id}>
                                <InputLabel>Select Store</InputLabel>
                                <Select
                                    value={data.store_id}
                                    label="Select Store"
                                    onChange={(e) =>
                                        setData("store_id", e.target.value)
                                    }
                                >
                                    <MenuItem value="" disabled>
                                        <em>Select Store</em>
                                    </MenuItem>
                                    {stores.map((store) => (
                                        <MenuItem
                                            key={store.id}
                                            value={store.id}
                                        >
                                            {store.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.store_id && (
                                    <FormHelperText>
                                        {errors.store_id}
                                    </FormHelperText>
                                )}
                            </FormControl>
                        )}

                        {/* CUSTOMER SELECTION: Visible to everyone */}
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

                        {/* SELLER ASSIGNMENT: Visible only to Admin */}
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

Create.layout = (page: React.ReactNode) => <AdminLayout children={page} />;
