import React from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import Inventory2 from "@mui/icons-material/Inventory2";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, HistoryPanel, PageBand, PanelHead, Pill, adminTableSx, densePanelSx, tinySx, type HistoryEvent, type PillTone } from "@/Components/Admin/adminUi";
import { dayDateTime } from "@/utils/dates";

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
        created_by?: string | null;
        created_at: string | null;
        updated_at?: string | null;
        items?: CartLine[];
        total: number;
    };
    history?: HistoryEvent[];
}

const birr = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const STATUS_TONE: Record<string, PillTone> = { open: "success", processing: "warning", completed: "info", canceled: "error" };

/** One cart, read-only: what is in it, for whom, who opened it and what happened since. */
export default function CartShow({ cart, history = [] }: Props): React.ReactElement {
    const items = cart.items ?? [];
    const pieces = items.reduce((sum, line) => sum + line.quantity, 0);

    return (
        <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title={`Cart #${cart.id}`} />

            <PageBand
                icon={<ShoppingCartOutlined />}
                title={`Cart #${cart.id}`}
                subtitle={`${cart.store ?? "No store"} · customer ${cart.customer ?? "walk-in"}`}
                actions={
                    <Button component={Link} href={route("admin.carts.index")} size="small" variant="contained" disableElevation startIcon={<ArrowBack />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                        All carts
                    </Button>
                }
            />

            <FigureRow>
                <FigureTile label="Total" value={birr(cart.total)} tone="primary" />
                <FigureTile label="Lines" value={items.length} hint={`${pieces} units`} />
                <FigureTile label="Created by" value={cart.created_by ?? "Unknown"} hint={cart.created_at ? dayDateTime(cart.created_at) : undefined} />
                <FigureTile label="Seller" value={cart.seller ?? "Unassigned"} hint={cart.updated_at ? `Updated ${dayDateTime(cart.updated_at)}` : undefined} />
            </FigureRow>

            <Box sx={{ display: "grid", gap: 1, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 2fr) minmax(0, 1fr)" } }}>
                <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                    <Box sx={{ p: 1.25, pb: 0.5 }}>
                        <PanelHead
                            icon={<Inventory2 sx={{ fontSize: 16, color: "primary.main" }} />}
                            title="What is in it"
                            right={<Pill tone={STATUS_TONE[cart.status?.toLowerCase()] ?? "default"} label={cart.status} />}
                        />
                    </Box>
                    <TableContainer>
                        <Table size="small" sx={adminTableSx}>
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
                                            <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>{line.product_name}</Typography>
                                            <Typography sx={tinySx}>{line.packaging ?? "Unit"}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: "monospace" }}>{line.sku ?? "—"}</TableCell>
                                        <TableCell align="right">{line.quantity}</TableCell>
                                        <TableCell align="right">{birr(line.price)}</TableCell>
                                        <TableCell align="right">{line.extra_pieces > 0 ? `${line.extra_pieces} × ${birr(line.extra_piece_price ?? 0)}` : "—"}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {birr(line.price * line.quantity + (line.extra_piece_price ?? 0) * line.extra_pieces)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>This cart is empty.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Stack direction="row" justifyContent="flex-end" sx={{ p: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.9375rem" }}>Total {birr(cart.total)}</Typography>
                    </Stack>
                </Paper>

                <HistoryPanel events={history} title="Cart history" />
            </Box>
        </Box>
    );
}

CartShow.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
