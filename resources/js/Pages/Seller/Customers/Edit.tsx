import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import React from "react";

interface Customer {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    city?: string;
}

export default function Edit({ customer }: { customer: Customer }) {
    const { data, setData, put, processing, errors } = useForm({
        first_name: customer.first_name || "",
        last_name: customer.last_name || "",
        email: customer.email || "",
        phone_number: customer.phone_number || "",
        city: customer.city || "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        put(route("seller.customers.update", customer.id));
    };

    return (
        <>
            <Head title="Edit Customer" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Edit Customer
                </Typography>
            </Box>

            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", maxWidth: 760 }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2.5}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            <TextField fullWidth label="First name" value={data.first_name} onChange={(event) => setData("first_name", event.target.value)} helperText={errors.first_name} error={Boolean(errors.first_name)} />
                            <TextField fullWidth label="Last name" value={data.last_name} onChange={(event) => setData("last_name", event.target.value)} helperText={errors.last_name} error={Boolean(errors.last_name)} />
                        </Stack>
                        <TextField fullWidth label="Email" value={data.email} onChange={(event) => setData("email", event.target.value)} helperText={errors.email} error={Boolean(errors.email)} />
                        <TextField fullWidth label="Phone number" value={data.phone_number} onChange={(event) => setData("phone_number", event.target.value)} helperText={errors.phone_number} error={Boolean(errors.phone_number)} />
                        <TextField fullWidth label="City" value={data.city} onChange={(event) => setData("city", event.target.value)} helperText={errors.city} error={Boolean(errors.city)} />
                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                            <Button component={Link} href={route("seller.customers.show", customer.id)} sx={{ textTransform: "none" }}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="contained" disabled={processing} sx={{ borderRadius: 3, textTransform: "none" }}>
                                Save Changes
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </>
    );
}

Edit.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
