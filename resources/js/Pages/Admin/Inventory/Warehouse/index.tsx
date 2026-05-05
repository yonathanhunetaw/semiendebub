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

interface InventoryLocation {
    id: number;
    name: string;
    address: string | null;
    store_id: number | null;
    store_name: string | null;
    stock_lines_count: number;
    total_units: number;
}

interface StockLine {
    id: number;
    item_name: string;
    variant_label: string;
    sku: string | null;
    location_name: string;
    quantity: number;
    low_stock_threshold: number | null;
}

interface Props {
    locations: InventoryLocation[];
    stockLines: StockLine[];
    totalLocations: number;
    totalUnits: number;
    lowStockCount: number;
}

export default function WarehouseIndex({
    locations = [],
    stockLines = [],
    totalLocations = 0,
    totalUnits = 0,
    lowStockCount = 0,
}: Props) {
    const handleDeleteLocation = (loc: InventoryLocation) => {
        if (!confirm(`Delete location "${loc.name}"? Stock records will be removed.`)) return;
        router.delete(route("admin.inventory.locations.destroy", loc.id));
    };

    const isLow = (line: StockLine) =>
        line.low_stock_threshold !== null && line.quantity <= line.low_stock_threshold;

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
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <WarehouseIcon color="primary" />
                        <Typography variant="h5" fontWeight={700}>
                            Warehouse
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Inventory locations, stock levels, and item quantities across all storage points.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("admin.inventory.locations.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}
                >
                    Add Location
                </Button>
            </Stack>

            {/* ── Summary Cards ── */}
            <Grid container spacing={2} mb={3}>
                {[
                    {
                        label: "Total Locations",
                        value: totalLocations,
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
                        label: "Low Stock Alerts",
                        value: lowStockCount,
                        icon: <InventoryIcon />,
                        color: lowStockCount > 0 ? "warning.main" : "success.main",
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

            {/* ── Locations Table ── */}
            <Typography variant="h6" fontWeight={700} mb={1.5}>
                Inventory Locations
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
                            <TableCell sx={{ fontWeight: 800 }}>Location</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Linked Store</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Stock Lines</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Total Units</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {locations.length > 0 ? (
                            locations.map((loc) => (
                                <TableRow key={loc.id} hover>
                                    <TableCell>
                                        <Typography variant="body1" fontWeight={700}>
                                            {loc.name}
                                        </Typography>
                                        {loc.address && (
                                            <Stack direction="row" alignItems="center" spacing={0.5} mt={0.25}>
                                                <PlaceIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {loc.address}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {loc.store_name ? (
                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                <StorefrontIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                                                <Typography variant="body2">{loc.store_name}</Typography>
                                            </Stack>
                                        ) : (
                                            <Chip size="small" label="Standalone" variant="outlined" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={`${loc.stock_lines_count} lines`}
                                            color="info"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={700}>
                                            {loc.total_units.toLocaleString()} units
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Tooltip title="Edit location">
                                                <IconButton
                                                    size="small"
                                                    component={Link}
                                                    href={route("admin.inventory.locations.edit", loc.id)}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete location">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleDeleteLocation(loc)}
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
                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                    <WarehouseIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1, display: "block", mx: "auto" }} />
                                    <Typography color="text.secondary">
                                        No locations yet. Add a warehouse or storage point to track stock.
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
                            <TableCell sx={{ fontWeight: 800 }}>Item / Variant</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>SKU</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Location</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Stock</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Level</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stockLines.length > 0 ? (
                            stockLines.map((line) => {
                                const low = isLow(line);
                                const pct = line.low_stock_threshold
                                    ? Math.min(100, Math.round((line.quantity / (line.low_stock_threshold * 3)) * 100))
                                    : null;
                                return (
                                    <TableRow key={line.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={700}>
                                                {line.item_name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {line.variant_label}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {line.sku ? (
                                                <Typography
                                                    variant="caption"
                                                    sx={{ fontFamily: "monospace", color: "text.secondary" }}
                                                >
                                                    {line.sku}
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{line.location_name}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Chip
                                                    size="small"
                                                    label={`${line.quantity} units`}
                                                    color={low ? "warning" : line.quantity === 0 ? "error" : "success"}
                                                    variant={line.quantity === 0 ? "filled" : "outlined"}
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ minWidth: 120 }}>
                                            {pct !== null ? (
                                                <Box>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={pct}
                                                        color={low ? "warning" : "success"}
                                                        sx={{ borderRadius: 4, height: 6 }}
                                                    />
                                                    {low && (
                                                        <Typography variant="caption" color="warning.main" fontWeight={700}>
                                                            Low stock
                                                        </Typography>
                                                    )}
                                                </Box>
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">No threshold set</Typography>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">
                                        No stock records yet. Deploy items to stores to start tracking.
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

WarehouseIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
