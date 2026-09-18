// resources/js/Pages/Admin/Inventory/Warehouse/index.tsx
import React, { useState, useMemo } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import InventoryIcon from "@mui/icons-material/Inventory";
import PlaceIcon from "@mui/icons-material/Place";
import StorefrontIcon from "@mui/icons-material/Storefront";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import {
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    InputAdornment,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";

interface Warehouse {
    id: number;
    name: string;
    address: string | null;
    code: string | null;
    stocks_count: number;
    store_name?: string | null;
    total_units: number;
}

interface StockLine {
    id: number;
    item_name: string;
    variant_label: string;
    sku: string | null;
    location_name: string;
    quantity: number;
    min_stock_level: number | null;
}

interface Props {
    warehouses: Warehouse[];
    stockLines: StockLine[];
    totalWarehouses: number;
    totalUnits: number;
    lowStockCount: number;
}

export default function WarehouseIndex({
    warehouses = [],
    stockLines = [],
    totalWarehouses = 0,
    totalUnits = 0,
    lowStockCount = 0,
}: Props) {
    // ── Filtering & Pagination State ──
    const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set(["all"]));
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [page, setPage] = useState<number>(0);
    const [rowsPerPage, setRowsPerPage] = useState<number>(10);

    const handleDeleteLocation = (wh: Warehouse) => {
        if (
            !confirm(
                `Delete warehouse "${wh.name}"? This will remove physical stock records.`,
            )
        )
            return;
        router.delete(route("admin.inventory.warehouse.destroy", wh.id));
    };

    const isLow = (line: StockLine) =>
        line.min_stock_level !== null && line.quantity <= line.min_stock_level;

    // Build location list for selector pills
    const locationPills = useMemo(() => {
        const list: { key: string; label: string; count: number; tone: string }[] = [
            { key: "all", label: "All Locations", count: totalUnits, tone: "grey.900" },
        ];
        const tones = ["success.main", "info.main", "primary.main", "warning.main", "secondary.main"];
        warehouses.forEach((wh, idx) => {
            list.push({
                key: wh.name,
                label: wh.name,
                count: wh.total_units || 0,
                tone: tones[idx % tones.length],
            });
        });
        return list;
    }, [warehouses, totalUnits]);

    const isAllSelected = selectedLocations.has("all");

    const toggleLocation = (key: string) => {
        setPage(0);
        if (key === "all") {
            setSelectedLocations(new Set(["all"]));
            return;
        }
        setSelectedLocations(prev => {
            const next = new Set(prev);
            next.delete("all");
            if (next.has(key)) {
                next.delete(key);
                if (next.size === 0) next.add("all");
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Filter stock lines by location selection and search query
    const filteredStockLines = useMemo(() => {
        return stockLines.filter(line => {
            // Location filter
            const matchesLoc = isAllSelected || selectedLocations.has(line.location_name);
            if (!matchesLoc) return false;

            // Search query filter
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                line.item_name.toLowerCase().includes(q) ||
                (line.sku && line.sku.toLowerCase().includes(q)) ||
                line.variant_label.toLowerCase().includes(q) ||
                line.location_name.toLowerCase().includes(q)
            );
        });
    }, [stockLines, selectedLocations, isAllSelected, searchQuery]);

    // Paginated slice
    const paginatedStockLines = useMemo(() => {
        return filteredStockLines.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    }, [filteredStockLines, page, rowsPerPage]);

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
                        label: "Total Warehouses",
                        value: totalWarehouses,
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
                        color:
                            lowStockCount > 0 ? "warning.main" : "success.main",
                    },
                ].map((card) => (
                    <Grid size={{ xs: 12, sm: 4 }} key={card.label}>
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

            {/* ── Stock Level Lines Section ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6" fontWeight={700}>
                    Stock Levels
                </Typography>
                <Chip
                    size="small"
                    label={`${filteredStockLines.length} Records Found`}
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                />
            </Stack>

            {/* Location Selector Pills (just like ItemVariants) */}
            <Box sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary"
                        sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                        Select Location (Tap to Filter / Combine)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {isAllSelected ? "All Locations" : `${selectedLocations.size} Location${selectedLocations.size === 1 ? "" : "s"} Selected`}
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: 0.5,
                    "&::-webkit-scrollbar": { display: "none" } }}>
                    {locationPills.map(l => {
                        const active = l.key === "all" ? isAllSelected : selectedLocations.has(l.key);
                        return (
                            <Paper key={l.key} variant="outlined"
                                onClick={() => toggleLocation(l.key)}
                                sx={{
                                    flex: "0 0 auto", px: 1.25, py: 0.75, borderRadius: 2,
                                    cursor: "pointer", minWidth: 100,
                                    bgcolor: active ? "grey.900" : "background.paper",
                                    color: active ? "#fff" : "text.primary",
                                    borderColor: active ? "grey.900" : "divider",
                                    transition: "all 0.15s",
                                }}>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Box sx={{ width: 6, height: 6, borderRadius: "50%",
                                        bgcolor: active ? "#fff" : l.tone }} />
                                    <Typography variant="caption"
                                        sx={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
                                            color: active ? "rgba(255,255,255,0.75)" : "text.secondary" }}>
                                        {l.label}
                                    </Typography>
                                </Stack>
                                <Typography sx={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.85rem", mt: 0.25 }}>
                                    {l.count.toLocaleString()}
                                    <Typography component="span"
                                        sx={{ fontSize: "0.6rem", fontWeight: 400, ml: 0.5,
                                            color: active ? "rgba(255,255,255,0.6)" : "text.secondary" }}>
                                        units
                                    </Typography>
                                </Typography>
                            </Paper>
                        );
                    })}
                </Stack>
            </Box>

            {/* Search Input Bar */}
            <Box sx={{ mb: 2 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search stock lines by item name, SKU, variant, or location..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(0);
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: "text.secondary", fontSize: 20 }} />
                            </InputAdornment>
                        ),
                        endAdornment: searchQuery ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => { setSearchQuery(""); setPage(0); }}>
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                    }}
                    sx={{
                        "& .MuiOutlinedInput-root": {
                            borderRadius: "12px",
                            bgcolor: "background.paper",
                        },
                    }}
                />
            </Box>

            {/* Stock Lines Table */}
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
                        {paginatedStockLines.length > 0 ? (
                            paginatedStockLines.map((line) => {
                                const low = isLow(line);

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
                                        {stockLines.length === 0
                                            ? "No stock records yet. Deploy items to start tracking quantities."
                                            : "No matching stock lines found for the selected filters."}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Pagination Controls */}
            {filteredStockLines.length > 0 && (
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={filteredStockLines.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                    sx={{ mt: 1 }}
                />
            )}
        </Box>
    );
}

WarehouseIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
