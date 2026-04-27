import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import React from "react";

interface CartItem {
    id: number;
}

interface SellerCart {
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
    items?: CartItem[];
}

const personName = (person?: { first_name?: string; last_name?: string } | null) =>
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Unassigned";

export default function Index({ carts = [] }: { carts?: SellerCart[] }) {
    return (
        <>
            <Head title="Seller Orders" />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        Orders
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Track customer carts, assignments, and fulfillment handoff.
                    </Typography>
                </Box>
                <Button component={Link} href={route("seller.carts.create")} variant="contained" sx={{ borderRadius: 3, textTransform: "none" }}>
                    Create Cart
                </Button>
            </Stack>

            <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Cart</TableCell>
                            <TableCell>Customer</TableCell>
                            <TableCell>Seller</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Items</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {carts.map((cart) => (
                            <TableRow key={cart.id} hover>
                                <TableCell>#{cart.id}</TableCell>
                                <TableCell>{personName(cart.customer)}</TableCell>
                                <TableCell>{personName(cart.seller)}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={cart.status || "open"}
                                        color={cart.status === "completed" ? "success" : "default"}
                                        variant={cart.status === "completed" ? "filled" : "outlined"}
                                    />
                                </TableCell>
                                <TableCell align="right">{cart.items?.length ?? 0}</TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <Button component={Link} href={route("seller.carts.show", cart.id)} size="small" sx={{ textTransform: "none" }}>
                                            View
                                        </Button>
                                        <Button component={Link} href={route("seller.carts.edit", cart.id)} size="small" sx={{ textTransform: "none" }}>
                                            Edit
                                        </Button>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
