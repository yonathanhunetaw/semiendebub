import {
    SellerCard,
    SellerHeader,
    SELLER_BRAND_DARK,
    sellerName,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm, usePage, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    MenuItem,
    Stack,
    TextField,
    Typography,
    FormControl,
    InputLabel,
    Select,
    FormHelperText,
    Paper
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import React from "react";

interface Customer {
    id: number;
    name: string;
}

export default function Create({ customers }: { customers: Customer[] }) {
    const { url, props } = usePage();
    const auth = props.auth as any;

    const { data, setData, post, processing, errors } = useForm({
        customer_id: "",
        seller_id: auth.user.id, // Auto-assigned from current user
        status: "active",
    });

    const isAdmin = url.startsWith("/admin");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const targetRoute = isAdmin ? "admin.carts.store" : "seller.carts.store";
        post(route(targetRoute));
    };

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title="Create New Cart" />

            <SellerHeader
                title="Initialize Cart"
                subtitle="Assign a customer to a new session"
            />

            <Box sx={{ maxWidth: 600, mx: "auto", mt: 4 }}>
                <Button
                    component={Link}
                    href={route(isAdmin ? "admin.carts.index" : "seller.carts.index")}
                    startIcon={<ArrowBackIcon />}
                    sx={{ mb: 2, color: "text.secondary" }}
                >
                    Back to Carts
                </Button>

                <SellerCard>
                    <form onSubmit={handleSubmit}>
                        <Stack spacing={4} sx={{ p: 1 }}>
                            <Typography variant="h6" fontWeight={800}>
                                Cart Details
                            </Typography>

                            {/* Customer Selection */}
                            <TextField
                                select
                                fullWidth
                                label="Select Customer"
                                value={data.customer_id}
                                error={!!errors.customer_id}
                                helperText={errors.customer_id}
                                onChange={(e) => setData("customer_id", e.target.value)}
                                variant="outlined"
                            >
                                <MenuItem value="">
                                    <em>None (Guest Cart)</em>
                                </MenuItem>
                                {customers.map((customer) => (
                                    <MenuItem key={customer.id} value={customer.id}>
                                        {customer.name}
                                    </MenuItem>
                                ))}
                            </TextField>

                            {/* Status Selection */}
                            <TextField
                                select
                                fullWidth
                                label="Initial Status"
                                value={data.status}
                                onChange={(e) => setData("status", e.target.value)}
                                variant="outlined"
                            >
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="pending">Pending</MenuItem>
                            </TextField>

                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                fullWidth
                                disabled={processing}
                                startIcon={<SaveIcon />}
                                sx={{
                                    py: 1.5,
                                    fontWeight: 900,
                                    bgcolor: SELLER_BRAND_DARK, // Using your brand constant
                                    "&:hover": { bgcolor: "primary.dark" }
                                }}
                            >
                                {processing ? "Creating..." : "Initialize Cart"}
                            </Button>
                        </Stack>
                    </form>
                </SellerCard>
            </Box>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
