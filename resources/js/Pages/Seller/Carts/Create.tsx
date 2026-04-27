import { SellerCard, SellerHeader, SELLER_BRAND_DARK, sellerName } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm, usePage } from "@inertiajs/react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import React from "react";

interface Person {
    id: number;
    first_name?: string;
    last_name?: string;
}

interface AuthUser {
    id: number;
    first_name?: string;
}

const label = (person: Person) =>
    sellerName([person.first_name, person.last_name]) || `#${person.id}`;

export default function Create({
    customers = [],
}: {
    customers?: Person[];
}) {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const currentUser = auth?.user;
    const { data, setData, post, processing, errors } = useForm({
        customer_id: "",
        seller_id: currentUser?.id ? String(currentUser.id) : "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(route("seller.carts.store"));
    };

    return (
        <>
            <Head title="Create Cart" />

            <SellerHeader title="Add Cart" backHref={route("seller.carts.index")} />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <SellerCard>
                    <Stack spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                            Create a cart for the customer you are serving right now.
                        </Typography>
                        <TextField
                            select
                            fullWidth
                            label="Customer"
                            value={data.customer_id}
                            onChange={(event) => setData("customer_id", event.target.value)}
                            helperText={errors.customer_id}
                            error={Boolean(errors.customer_id)}
                        >
                            {customers.map((customer) => (
                                <MenuItem key={customer.id} value={customer.id}>
                                    {label(customer)}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            fullWidth
                            label="Seller"
                            value={currentUser?.first_name || "Current seller"}
                            InputProps={{ readOnly: true }}
                        />

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
                            Create Cart
                        </Button>
                    </Stack>
                </SellerCard>
            </Box>
        </>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
