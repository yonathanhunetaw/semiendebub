import React from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import { Box, Button, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, PageBand, Pager, Pill, TablePanel, adminTableSx, tinySx, type PillTone } from "@/Components/Admin/adminUi";
import AgeBadge from "@/Components/Shared/time/AgeBadge";
import TimeFilterChips from "@/Components/Shared/time/TimeFilterChips";
import type { TimeFilterView } from "@/types/time";
import DayTag from "@/Components/Shared/time/DayTag";
import type { DayTagView } from "@/types/time";
import { dayDateTime } from "@/utils/dates";

interface Cart {
    id: number;
    status: string | null;
    session_id: string | null;
    created_at: string;
    updated_at: string;
    /** The business day it was started in. */
    day?: DayTagView | null;
    variants_count?: number;
    /** Who opened the cart. */
    creator?: string | null;
    customer?: { id: number; name: string } | null;
    store?: { id: number; name: string } | null;
    seller?: { id: number; first_name: string; last_name: string | null } | null;
}

interface Paginator {
    data: Cart[];
    total?: number;
    from?: number | null;
    to?: number | null;
    links?: Array<{ url: string | null; label: string; active: boolean }>;
}

interface Props {
    carts: Paginator | Cart[];
    /** When each cart was started (Today = its store's business day). */
    time?: TimeFilterView;
}

const STATUS_TONE: Record<string, PillTone> = { open: "success", processing: "warning", completed: "info", canceled: "error" };

export default function CartsIndex({ carts, time }: Props) {
    const page = Array.isArray(carts) ? null : carts;
    const list = Array.isArray(carts) ? carts : carts.data ?? [];
    const open = list.filter((cart) => cart.status === "open").length;
    const empty = list.filter((cart) => (cart.variants_count ?? 0) === 0).length;

    const handleDelete = (cartId: number) => {
        if (confirm("Are you sure you want to delete this cart? This will remove all items associated with it.")) {
            router.delete(route("admin.carts.destroy", cartId), { preserveScroll: true });
        }
    };

    return (
        <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title="Carts" />

            <PageBand
                icon={<ShoppingCartOutlined />}
                title="Carts"
                subtitle="Every cart a seller or admin has opened, and who opened it"
                actions={
                    <Button component={Link} href={route("admin.carts.create")} size="small" variant="contained" disableElevation startIcon={<AddIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                        New cart
                    </Button>
                }
            />

            <FigureRow>
                <FigureTile label="Carts" value={(page?.total ?? list.length).toLocaleString()} tone="primary" />
                <FigureTile label="Open on this page" value={open} tone="success" />
                <FigureTile label="Empty on this page" value={empty} tone={empty > 0 ? "warning" : "default"} />
                <FigureTile label="On this page" value={list.length} />
            </FigureRow>

            {time ? <TimeFilterChips filter={time} /> : null}

            <TablePanel>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Cart</TableCell>
                                <TableCell>Store</TableCell>
                                <TableCell>Customer</TableCell>
                                <TableCell>Created by</TableCell>
                                <TableCell>Seller</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Started</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {list.length > 0 ? (
                                list.map((cart) => (
                                    <TableRow key={cart.id}>
                                        <TableCell>
                                            <Typography component={Link} href={route("admin.carts.show", cart.id)} sx={{ fontWeight: 800, fontSize: "0.8125rem", color: "primary.main", textDecoration: "none" }}>
                                                #{cart.id}
                                            </Typography>
                                            <Typography sx={{ ...tinySx, fontFamily: "monospace" }}>{cart.session_id?.substring(0, 8) || "no session"}</Typography>
                                        </TableCell>
                                        <TableCell>{cart.store?.name || "Main Branch"}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{cart.customer?.name || "Guest"}</TableCell>
                                        <TableCell>{cart.creator || <Box component="span" sx={{ color: "text.disabled" }}>Unknown</Box>}</TableCell>
                                        <TableCell sx={{ color: "text.secondary" }}>
                                            {cart.seller ? `${cart.seller.first_name} ${cart.seller.last_name || ""}`.trim() : "Unassigned"}
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                <Pill tone={STATUS_TONE[cart.status?.toLowerCase() ?? ""] ?? "default"} label={cart.status ?? "unknown"} />
                                                <Pill label={`${cart.variants_count ?? 0} items`} />
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            {dayDateTime(cart.created_at)}
                                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                                                <DayTag tag={cart.day} />
                                                {cart.status === "open" ? <AgeBadge since={cart.updated_at} warnHours={24} lateHours={72} prefix="idle " /> : null}
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title="Open: items and history">
                                                    <IconButton component={Link} href={route("admin.carts.show", cart.id)} size="small" color="info"><VisibilityIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                                {/* A cart that became an order is kept (CartController::destroy). */}
                                                {cart.status !== "completed" && (
                                                    <Tooltip title="Delete">
                                                        <IconButton onClick={() => handleDelete(cart.id)} size="small" color="error"><DeleteIcon fontSize="small" /></IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 5, color: "text.secondary" }}>No carts yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TablePanel>

            <Pager links={page?.links} from={page?.from} to={page?.to} total={page?.total} />
        </Box>
    );
}

CartsIndex.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
