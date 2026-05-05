// resources/js/Pages/Admin/Inventory/Transfers/index.tsx
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import MultipleStopIcon from "@mui/icons-material/MultipleStop";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";

type TransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

interface Transfer {
    id: number;
    reference: string;
    from_location: string;
    to_location: string;
    item_name: string;
    variant_label: string;
    sku: string | null;
    quantity: number;
    status: TransferStatus;
    initiated_by: string;
    created_at: string;
    completed_at: string | null;
}

interface Props {
    transfers: Transfer[];
    pendingCount: number;
    inTransitCount: number;
    completedCount: number;
}

const statusConfig: Record<
    TransferStatus,
    { label: string; color: "warning" | "info" | "success" | "error"; icon: React.ReactNode }
> = {
    pending:    { label: "Pending",    color: "warning", icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
    in_transit: { label: "In Transit", color: "info",    icon: <LocalShippingIcon sx={{ fontSize: 14 }} /> },
    completed:  { label: "Completed",  color: "success", icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    cancelled:  { label: "Cancelled",  color: "error",   icon: <CancelIcon sx={{ fontSize: 14 }} /> },
};

export default function TransfersIndex({
    transfers = [],
    pendingCount = 0,
    inTransitCount = 0,
    completedCount = 0,
}: Props) {
    const handleCancel = (transfer: Transfer) => {
        if (!confirm(`Cancel transfer ${transfer.reference}?`)) return;
        router.patch(route("admin.inventory.transfers.cancel", transfer.id));
    };

    const handleMarkComplete = (transfer: Transfer) => {
        router.patch(route("admin.inventory.transfers.complete", transfer.id));
    };

    return (
        <Box>
            <Head title="Transfers" />

            {/* ── Header ── */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                mb={3}
            >
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <MultipleStopIcon color="primary" />
                        <Typography variant="h5" fontWeight={700}>
                            Transfers
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Track stock movements between warehouse locations and stores.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("admin.inventory.transfers.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}
                >
                    New Transfer
                </Button>
            </Stack>

            {/* ── Summary Cards ── */}
            <Grid container spacing={2} mb={3}>
                {[
                    {
                        label: "Pending",
                        value: pendingCount,
                        color: "warning.main",
                        icon: <HourglassEmptyIcon />,
                    },
                    {
                        label: "In Transit",
                        value: inTransitCount,
                        color: "info.main",
                        icon: <LocalShippingIcon />,
                    },
                    {
                        label: "Completed",
                        value: completedCount,
                        color: "success.main",
                        icon: <CheckCircleIcon />,
                    },
                ].map((card) => (
                    <Grid item xs={12} sm={4} key={card.label}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2.5,
                                borderRadius: "16px",
                                border: "1px solid",
                                borderColor: "divider",
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 2,
                                    bgcolor: "action.hover",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: card.color,
                                    flexShrink: 0,
                                }}
                            >
                                {card.icon}
                            </Box>
                            <Box>
                                <Typography variant="h5" fontWeight={800} lineHeight={1}>
                                    {card.value}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {card.label}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* ── Transfers Table ── */}
            <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                    borderRadius: "16px",
                    border: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Reference</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Item / Variant</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Route</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Qty</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Initiated By</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Date</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transfers.length > 0 ? (
                            transfers.map((transfer) => {
                                const cfg = statusConfig[transfer.status];
                                return (
                                    <TableRow key={transfer.id} hover>
                                        <TableCell>
                                            <Typography
                                                variant="caption"
                                                sx={{ fontFamily: "monospace", fontWeight: 700 }}
                                            >
                                                {transfer.reference}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={700}>
                                                {transfer.item_name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {transfer.variant_label}
                                            </Typography>
                                            {transfer.sku && (
                                                <Typography
                                                    variant="caption"
                                                    display="block"
                                                    sx={{ fontFamily: "monospace", color: "text.disabled" }}
                                                >
                                                    {transfer.sku}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={0.75}>
                                                <Typography variant="caption" fontWeight={600}>
                                                    {transfer.from_location}
                                                </Typography>
                                                <ArrowForwardIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                                                <Typography variant="caption" fontWeight={600}>
                                                    {transfer.to_location}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={`${transfer.quantity} units`}
                                                variant="outlined"
                                                color="info"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                icon={cfg.icon}
                                                label={cfg.label}
                                                color={cfg.color}
                                                variant={transfer.status === "completed" ? "filled" : "outlined"}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{transfer.initiated_by}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(transfer.created_at).toLocaleDateString()}
                                            </Typography>
                                            {transfer.completed_at && (
                                                <Typography
                                                    variant="caption"
                                                    color="success.main"
                                                    display="block"
                                                >
                                                    ✓ {new Date(transfer.completed_at).toLocaleDateString()}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title="View details">
                                                    <IconButton
                                                        size="small"
                                                        component={Link}
                                                        href={route("admin.inventory.transfers.show", transfer.id)}
                                                    >
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {transfer.status === "in_transit" && (
                                                    <Tooltip title="Mark as completed">
                                                        <IconButton
                                                            size="small"
                                                            color="success"
                                                            onClick={() => handleMarkComplete(transfer)}
                                                        >
                                                            <CheckCircleIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {(transfer.status === "pending" || transfer.status === "in_transit") && (
                                                    <Tooltip title="Cancel transfer">
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleCancel(transfer)}
                                                        >
                                                            <CancelIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                                    <MultipleStopIcon
                                        sx={{ fontSize: 48, color: "text.disabled", mb: 1, display: "block", mx: "auto" }}
                                    />
                                    <Typography color="text.secondary" gutterBottom>
                                        No transfers yet.
                                    </Typography>
                                    <Button
                                        component={Link}
                                        href={route("admin.inventory.transfers.create")}
                                        variant="outlined"
                                        startIcon={<AddIcon />}
                                        size="small"
                                        sx={{ textTransform: "none", mt: 1 }}
                                    >
                                        Create first transfer
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

TransfersIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
