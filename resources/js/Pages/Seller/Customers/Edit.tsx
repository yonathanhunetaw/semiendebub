import { SELLER_BRAND_DARK, SELLER_CITY_OPTIONS, SellerCard, SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Stack, TextField } from "@mui/material";
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

            <SellerHeader title="Edit Customer" backHref={route("seller.customers.show", customer.id)} />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <SellerCard>
                    <Stack spacing={2}>
                        <TextField
                            fullWidth
                            label="First name"
                            value={data.first_name}
                            onChange={(event) => setData("first_name", event.target.value)}
                            helperText={errors.first_name}
                            error={Boolean(errors.first_name)}
                        />
                        <TextField
                            fullWidth
                            label="Last name"
                            value={data.last_name}
                            onChange={(event) => setData("last_name", event.target.value)}
                            helperText={errors.last_name}
                            error={Boolean(errors.last_name)}
                        />
                        <TextField
                            fullWidth
                            label="Phone number"
                            value={data.phone_number}
                            onChange={(event) => setData("phone_number", event.target.value)}
                            helperText={errors.phone_number}
                            error={Boolean(errors.phone_number)}
                        />
                        <TextField
                            fullWidth
                            type="email"
                            label="Email"
                            value={data.email}
                            onChange={(event) => setData("email", event.target.value)}
                            helperText={errors.email}
                            error={Boolean(errors.email)}
                        />
                        <TextField
                            select
                            fullWidth
                            label="City"
                            value={data.city}
                            onChange={(event) => setData("city", event.target.value)}
                            helperText={errors.city}
                            error={Boolean(errors.city)}
                        >
                            {SELLER_CITY_OPTIONS.map((city) => (
                                <MenuItem key={city} value={city}>
                                    {city}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            sx={{
                                borderRadius: 3,
                                textTransform: "none",
                                bgcolor: SELLER_BRAND_DARK,
                                "&:hover": { bgcolor: SELLER_BRAND_DARK },
                            }}
                        >
                            Save Changes
                        </Button>
                    </Stack>
                </SellerCard>
            </Box>
        </>
    );
}

Edit.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
