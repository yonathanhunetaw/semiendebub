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

interface Cart {
    id: number;
    customer_id?: number | null;
    seller_id?: number | null;
}

interface AuthUser {
    id: number;
    first_name?: string;
}

const label = (person: Person) =>
    sellerName([person.first_name, person.last_name]) || `#${person.id}`;

export default function Edit({
    cart,
    customers = [],
}: {
    cart: Cart;
    customers?: Person[];
}) {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const currentUser = auth?.user;
    const { data, setData, put, processing, errors } = useForm({
        customer_id: cart.customer_id ? String(cart.customer_id) : "",
        seller_id: cart.seller_id ? String(cart.seller_id) : currentUser?.id ? String(currentUser.id) : "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        put(route("seller.carts.update", cart.id));
    };

    return (
        <>
            <Head title={`Edit Cart #${cart.id}`} />

            <SellerHeader title={`Edit Cart #${cart.id}`} backHref={route("seller.carts.show", cart.id)} />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <SellerCard>
                    <Stack spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                            Update the customer tied to this cart.
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
                            Save Cart
                        </Button>
                    </Stack>
                </SellerCard>
            </Box>
        </>
    );
}

Edit.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
