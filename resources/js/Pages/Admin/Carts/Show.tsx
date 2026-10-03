import AdminLayout from "@/Layouts/AppLayout";
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

interface CartLine {
    id: number;
    product_name: string;
    sku: string | null;
    packaging: string | null;
    price: number;
    quantity: number;
    extra_pieces: number;
    extra_piece_price: number | null;
}

interface Props {
    cart: {
        id: number;
        status: string;
        store: string | null;
        seller: string | null;
        customer: string | null;
        created_at: string | null;
        items?: CartLine[];
        total: number;
    };
}

const birr = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

/** One cart, read-only: what is in it, at what price, for whom. */
export default function CartShow({ cart }: Props): React.ReactElement {
    const items = cart.items ?? [];

    return (
        <>
            <Head title={`Cart #${cart.id}`} />
            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: "auto" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                            Cart #{cart.id}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {cart.store ?? "—"} · seller {cart.seller ?? "—"} · customer {cart.customer ?? "walk-in"}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={cart.status} color={cart.status === "completed" ? "success" : "default"} />
                        <Button component={Link} href={route("admin.carts.index")}>
                            All carts
                        </Button>
                    </Stack>
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Product</TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell align="right">Qty</TableCell>
                                <TableCell align="right">Unit price</TableCell>
                                <TableCell align="right">Extra pieces</TableCell>
                                <TableCell align="right">Line total</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((line) => (
                                <TableRow key={line.id}>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {line.product_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {line.packaging ?? "Unit"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: "monospace" }}>{line.sku ?? "—"}</TableCell>
                                    <TableCell align="right">{line.quantity}</TableCell>
                                    <TableCell align="right">{birr(line.price)}</TableCell>
                                    <TableCell align="right">
                                        {line.extra_pieces > 0 ? `${line.extra_pieces} × ${birr(line.extra_piece_price ?? 0)}` : "—"}
                                    </TableCell>
                                    <TableCell align="right">
                                        {birr(line.price * line.quantity + (line.extra_piece_price ?? 0) * line.extra_pieces)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                                        This cart is empty.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                    <Stack direction="row" justifyContent="flex-end" sx={{ p: 2 }}>
                        <Typography sx={{ fontWeight: 800 }}>Total {birr(cart.total)}</Typography>
                    </Stack>
                </Paper>
            </Box>
        </>
    );
}

CartShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
