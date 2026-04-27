import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
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

const label = (person: Person) =>
    [person.first_name, person.last_name].filter(Boolean).join(" ") || `#${person.id}`;

export default function Edit({
    cart,
    customers = [],
    sellers = [],
}: {
    cart: Cart;
    customers?: Person[];
    sellers?: Person[];
}) {
    const { data, setData, put, processing, errors } = useForm({
        customer_id: cart.customer_id ? String(cart.customer_id) : "",
        seller_id: cart.seller_id ? String(cart.seller_id) : "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        put(route("seller.carts.update", cart.id));
    };

    return (
        <>
            <Head title={`Edit Cart #${cart.id}`} />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Edit Cart #{cart.id}
                </Typography>
            </Box>

            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", maxWidth: 760 }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2.5}>
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
                            select
                            fullWidth
                            label="Seller"
                            value={data.seller_id}
                            onChange={(event) => setData("seller_id", event.target.value)}
                        >
                            {sellers.map((seller) => (
                                <MenuItem key={seller.id} value={seller.id}>
                                    {label(seller)}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                            <Button component={Link} href={route("seller.carts.show", cart.id)} sx={{ textTransform: "none" }}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="contained" disabled={processing} sx={{ borderRadius: 3, textTransform: "none" }}>
                                Save Cart
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </>
    );
}

Edit.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
