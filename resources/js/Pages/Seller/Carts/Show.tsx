import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import React from "react";

interface CartRowItem {
    id: number;
    product_name?: string;
    pivot?: {
        quantity?: number;
        price?: number;
    };
}

interface Cart {
    id: number;
    status?: string;
    customer?: {
        first_name?: string;
        last_name?: string;
        email?: string;
    } | null;
    seller?: {
        first_name?: string;
        last_name?: string;
    } | null;
    items?: CartRowItem[];
}

const personName = (person?: { first_name?: string; last_name?: string } | null) =>
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Unassigned";

export default function Show({ cart }: { cart: Cart }) {
    return (
        <>
            <Head title={`Cart #${cart.id}`} />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        Cart #{cart.id}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Customer: {personName(cart.customer)} · Seller: {personName(cart.seller)}
                    </Typography>
                </Box>
                <Button component={Link} href={route("seller.carts.edit", cart.id)} variant="outlined" sx={{ borderRadius: 3, textTransform: "none" }}>
                    Edit Cart
                </Button>
            </Stack>

            <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell align="right">Quantity</TableCell>
                            <TableCell align="right">Price</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {cart.items?.map((item) => (
                            <TableRow key={item.id} hover>
                                <TableCell>{item.product_name || `Item #${item.id}`}</TableCell>
                                <TableCell align="right">{item.pivot?.quantity ?? 0}</TableCell>
                                <TableCell align="right">{item.pivot?.price ?? 0}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
