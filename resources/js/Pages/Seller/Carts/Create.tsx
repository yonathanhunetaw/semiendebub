import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import React from "react";

interface Person {
    id: number;
    first_name?: string;
    last_name?: string;
}

const label = (person: Person) =>
    [person.first_name, person.last_name].filter(Boolean).join(" ") || `#${person.id}`;

export default function Create({
    customers = [],
    sellers = [],
}: {
    customers?: Person[];
    sellers?: Person[];
}) {
    const { data, setData, post, processing, errors } = useForm({
        customer_id: "",
        seller_id: "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(route("seller.carts.store"));
    };

    return (
        <>
            <Head title="Create Cart" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Create Cart
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
                            helperText={errors.seller_id}
                            error={Boolean(errors.seller_id)}
                        >
                            {sellers.map((seller) => (
                                <MenuItem key={seller.id} value={seller.id}>
                                    {label(seller)}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                            <Button component={Link} href={route("seller.orders.index")} sx={{ textTransform: "none" }}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="contained" disabled={processing} sx={{ borderRadius: 3, textTransform: "none" }}>
                                Create
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
