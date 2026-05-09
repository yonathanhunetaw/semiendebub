// resources/js/Pages/Admin/Inventory/Warehouse/index.tsx
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import InventoryIcon from "@mui/icons-material/Inventory";
import PlaceIcon from "@mui/icons-material/Place";
import StorefrontIcon from "@mui/icons-material/Storefront";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import {
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    LinearProgress,
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

interface Warehouse {
    id: number;
    name: string;
    address: string | null;
    code: string | null; // Added code
    stocks_count: number; // Renamed from stock_lines_count
    store_name?: string | null;
    total_units: number;
}

interface StockLine {
    id: number;
    item_name: string;
    variant_label: string;
    sku: string | null;
    location_name: string; // This will show the Warehouse name
    quantity: number;
    min_stock_level: number | null; // Changed from low_stock_threshold
}

interface Props {
    warehouses: Warehouse[]; // Changed from locations
    stockLines: StockLine[];
    totalWarehouses: number; // Changed from totalLocations
    totalUnits: number;
    lowStockCount: number;
}

export default function WarehouseIndex({
    warehouses = [], // Rename
    stockLines = [],
    totalWarehouses = 0, // Rename
    totalUnits = 0,
    lowStockCount = 0,
}: Props) {
    const handleDeleteLocation = (wh: Warehouse) => {
        if (
            !confirm(
                `Delete warehouse "${wh.name}"? This will remove physical stock records.`,
            )
        )
            return;
        router.delete(route("admin.inventory.warehouse.destroy", wh.id));
    };

    // Update to use 'min_stock_level'
    const isLow = (line: StockLine) =>
        line.min_stock_level !== null && line.quantity <= line.min_stock_level;
    return (
        <Box>
            <Head title="Warehouse" />

            {/* ── Header ── */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                mb={3}
            >
                <Box>
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        mb={0.5}
                    >
                        <WarehouseIcon color="primary" />
                        <Typography variant="h5" fontWeight={700}>
                            Warehouse
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Inventory locations, stock levels, and item quantities
                        across all storage points.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("admin.inventory.warehouse.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 700,
                    }}
                >
                    Add Location
                </Button>
            </Stack>

            {/* ── Summary Cards ── */}
            <Grid container spacing={2} mb={3}>
                {[
                    {
                        // Changed label to 'Warehouses' to be more specific
                        label: "Total Warehouses",
                        value: totalWarehouses, // Match the new prop name
                        icon: <WarehouseIcon />,
                        color: "primary.main",
                    },
                    {
                        label: "Total Units in Stock",
                        value: totalUnits.toLocaleString(),
                        icon: <InventoryIcon />,
                        color: "success.main",
                    },
                    {
                        // This now represents items below their 'min_stock_level'
                        label: "Low Stock Alerts",
                        value: lowStockCount,
                        icon: <InventoryIcon />,
                        // Keeps the warning color if count is > 0
                        color:
                            lowStockCount > 0 ? "warning.main" : "success.main",
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
                                // Subtly highlight the card if it's a warning
                                bgcolor:
                                    card.label === "Low Stock Alerts" &&
                                    lowStockCount > 0
                                        ? "rgba(237, 108, 2, 0.04)"
                                        : "background.paper",
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
                                <Typography
                                    variant="h5"
                                    fontWeight={800}
                                    lineHeight={1}
                                >
                                    {card.value}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    {card.label}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* ── Warehouses Table ── */}
            <Typography variant="h6" fontWeight={700} mb={1.5}>
                Warehouses
            </Typography>
            <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                    borderRadius: "16px",
                    border: "1px solid",
                    borderColor: "divider",
                    mb: 4,
                }}
            >
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Warehouse
                            </TableCell>
                            {/* We can keep 'Linked Store' if you still want to show which store this warehouse serves */}
                            <TableCell sx={{ fontWeight: 800 }}>
                                Linked Store
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Stock Lines
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Total Units
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {warehouses.length > 0 ? (
                            warehouses.map((wh) => (
                                <TableRow key={wh.id} hover>
                                    <TableCell>
                                        <Typography
                                            variant="body1"
                                            fontWeight={700}
                                        >
                                            {wh.name}
                                        </Typography>
                                        {wh.address && (
                                            <Stack
                                                direction="row"
                                                alignItems="center"
                                                spacing={0.5}
                                                mt={0.25}
                                            >
                                                <PlaceIcon
                                                    sx={{
                                                        fontSize: 13,
                                                        color: "text.disabled",
                                                    }}
                                                />
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    {wh.address}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {/* Updated to whatever your store relationship name is now */}
                                        {wh.store_name ? (
                                            <Stack
                                                direction="row"
                                                alignItems="center"
                                                spacing={0.5}
                                            >
                                                <StorefrontIcon
                                                    sx={{
                                                        fontSize: 15,
                                                        color: "text.disabled",
                                                    }}
                                                />
                                                <Typography variant="body2">
                                                    {wh.store_name}
                                                </Typography>
                                            </Stack>
                                        ) : (
                                            <Chip
                                                size="small"
                                                label="Primary Hub"
                                                variant="outlined"
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={`${wh.stocks_count} lines`}
                                            color="info"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            fontWeight={700}
                                        >
                                            {(
                                                wh.total_units || 0
                                            ).toLocaleString()}{" "}
                                            units
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            justifyContent="flex-end"
                                        >
                                            <Tooltip title="Edit warehouse">
                                                <IconButton
                                                    size="small"
                                                    component={Link}
                                                    href={route(
                                                        "admin.inventory.warehouse.edit",
                                                        wh.id,
                                                    )}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete warehouse">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() =>
                                                        handleDeleteLocation(wh)
                                                    }
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
                                    colSpan={5}
                                    align="center"
                                    sx={{ py: 6 }}
                                >
                                    <WarehouseIcon
                                        sx={{
                                            fontSize: 48,
                                            color: "text.disabled",
                                            mb: 1,
                                            display: "block",
                                            mx: "auto",
                                        }}
                                    />
                                    <Typography color="text.secondary">
                                        No warehouses found.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ── Stock Level Lines ── */}
            <Typography variant="h6" fontWeight={700} mb={1.5}>
                Stock Levels
            </Typography>
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
                            <TableCell sx={{ fontWeight: 800 }}>
                                Item / Variant
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>SKU</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Location
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Stock
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>
                                Level
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stockLines.length > 0 ? (
                            stockLines.map((line) => {
                                const low = isLow(line);

                                // Logic update: Use min_stock_level instead of threshold
                                // We calculate percentage based on 3x the minimum safety stock
                                const pct = line.min_stock_level
                                    ? Math.min(
                                          100,
                                          Math.round(
                                              (line.quantity /
                                                  (line.min_stock_level * 3)) *
                                                  100,
                                          ),
                                      )
                                    : null;

                                return (
                                    <TableRow key={line.id} hover>
                                        <TableCell>
                                            <Typography
                                                variant="body2"
                                                fontWeight={700}
                                            >
                                                {line.item_name}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                            >
                                                {line.variant_label}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {line.sku ? (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        fontFamily: "monospace",
                                                        color: "text.secondary",
                                                    }}
                                                >
                                                    {line.sku}
                                                </Typography>
                                            ) : (
                                                <Typography
                                                    variant="caption"
                                                    color="text.disabled"
                                                >
                                                    —
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {/* This will show "Main Warehouse" or "Downtown Store" automatically */}
                                            <Typography variant="body2">
                                                {line.location_name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Stack
                                                direction="row"
                                                alignItems="center"
                                                spacing={1}
                                            >
                                                <Chip
                                                    size="small"
                                                    label={`${line.quantity} units`}
                                                    color={
                                                        low
                                                            ? "warning"
                                                            : line.quantity ===
                                                                0
                                                              ? "error"
                                                              : "success"
                                                    }
                                                    variant={
                                                        line.quantity === 0
                                                            ? "filled"
                                                            : "outlined"
                                                    }
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ minWidth: 120 }}>
                                            {pct !== null ? (
                                                <Box>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={pct}
                                                        color={
                                                            low
                                                                ? "warning"
                                                                : "success"
                                                        }
                                                        sx={{
                                                            borderRadius: 4,
                                                            height: 6,
                                                        }}
                                                    />
                                                    {low && (
                                                        <Typography
                                                            variant="caption"
                                                            color="warning.main"
                                                            fontWeight={700}
                                                        >
                                                            Low stock
                                                        </Typography>
                                                    )}
                                                </Box>
                                            ) : (
                                                <Typography
                                                    variant="caption"
                                                    color="text.disabled"
                                                >
                                                    No threshold set
                                                </Typography>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    align="center"
                                    sx={{ py: 5 }}
                                >
                                    <Typography color="text.secondary">
                                        No stock records yet. Deploy items to
                                        start tracking quantities.
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

WarehouseIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
