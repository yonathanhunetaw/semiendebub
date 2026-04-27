import { SELLER_BRAND_DARK, SELLER_CITY_OPTIONS, SellerCard, SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Stack, TextField } from "@mui/material";
import React from "react";

export default function Create() {
    const { data, setData, post, processing, errors } = useForm({
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
        city: "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(route("seller.customers.store"));
    };

    return (
        <>
            <Head title="Add Customer" />

            <SellerHeader title="Add Customer" backHref={route("seller.customers.index")} />

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
                            Save Customer
                        </Button>
                    </Stack>
                </SellerCard>
            </Box>
        </>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
