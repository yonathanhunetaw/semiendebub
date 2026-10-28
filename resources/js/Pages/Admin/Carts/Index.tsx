import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    IconButton,
    Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import AgeBadge from "@/Components/Shared/time/AgeBadge";
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
    customer?: {
        id: number;
        name: string;
    };
    store?: {
        id: number;
        name: string;
    };
    seller?: {
        id: number;
        first_name: string;
        last_name: string | null;
    };
}

interface Props {
    carts: {
        data: Cart[];
    };
}

export default function CartsIndex({ carts }: Props) {
    const cartList = Array.isArray(carts) ? carts : carts.data || [];

    const handleDelete = (cartId: number) => {
        if (
            confirm(
                "Are you sure you want to delete this cart? This will remove all items associated with it.",
            )
        ) {
            router.delete(route("admin.carts.destroy", cartId), {
                preserveScroll: true,
            });
        }
    };

    const getStatusColor = (
        status: string | null,
    ):
        | "default"
        | "primary"
        | "secondary"
        | "error"
        | "info"
        | "success"
        | "warning" => {
        switch (status?.toLowerCase()) {
            case "open":
                return "success";
            case "processing":
                return "warning";
            case "completed":
                return "info";
            case "canceled":
                return "error";
            default:
                return "default";
        }
    };

    return (
        <Box sx={ROOT}>
            <Head title="Carts Management" />

            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                mb={4}
            >
                <Typography variant="h4" fontWeight="bold">
                    Carts
                </Typography>
                <Button
                    component={Link}
                    href={route("admin.carts.create")} // Ensure this matches your route name
                    variant="contained"
                    startIcon={<AddIcon />}
                >
                    New Cart
                </Button>
            </Stack>

            {/* Carts Table */}
            <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: "background.default" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Cart Info
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Store
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Customer
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Seller/Staff
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Status
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Started
                            </TableCell>
                            <TableCell
                                align="right"
                                sx={{ fontWeight: "bold" }}
                            >
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {cartList.length > 0 ? (
                            cartList.map((cart) => (
                                <TableRow key={cart.id} hover>
                                    <TableCell>
                                        <Typography
                                            variant="body1"
                                            fontWeight="medium"
                                        >
                                            ID: {cart.id}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{ fontFamily: "monospace" }}
                                        >
                                            SES:{" "}
                                            {cart.session_id?.substring(0, 8) ||
                                                "N/A"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {cart.store?.name || "Main Branch"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            fontWeight="medium"
                                        >
                                            {cart.customer?.name || "Guest"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                        >
                                            {cart.seller
                                                ? `${cart.seller.first_name} ${cart.seller.last_name || ""}`
                                                : "Unassigned"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            // Change .items to .variants to match the Controller's 'with' call
                                            label={`${cart.variants?.length ?? 0} items`}
                                            size="small"
                                            sx={{
                                                bgcolor: "rgb(var(--on-surface) / 0.1)",
                                                color: "text.primary",
                                                fontWeight: 800,
                                                fontSize: "0.7rem",
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {dayDateTime(cart.created_at)}
                                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                                            <DayTag tag={cart.day} />
                                            {cart.status === "open" ? <AgeBadge since={cart.updated_at} warnHours={24} lateHours={72} prefix="idle " /> : null}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            justifyContent="flex-end"
                                        >
                                            <Tooltip title="View Items">
                                                <IconButton
                                                    component={Link}
                                                    href={route(
                                                        "admin.carts.show",
                                                        cart.id,
                                                    )}
                                                    size="small"
                                                    color="info"
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton
                                                    onClick={() =>
                                                        handleDelete(cart.id)
                                                    }
                                                    size="small"
                                                    color="error"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    align="center"
                                    sx={{ py: 5 }}
                                >
                                    <Typography
                                        variant="body1"
                                        color="text.secondary"
                                    >
                                        No active carts found.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

CartsIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
