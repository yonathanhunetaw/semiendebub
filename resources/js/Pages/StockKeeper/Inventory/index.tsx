import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head, useForm } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";
import AddIcon from "@mui/icons-material/Add";

interface StockItem {
    id: number;
    product_name: string;
    status?: string;
    sold_count?: number;
}

interface Warehouse {
    id: number;
    name: string;
}

interface Variant {
    id: number;
    name: string;
}

interface Props {
    items?: StockItem[];
    warehouses?: Warehouse[];
    variants?: Variant[];
}

export default function Index({ items = [], warehouses = [], variants = [] }: Props) {
    const [open, setOpen] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm({
        warehouse_id: "",
        item_variant_id: "",
        quantity: 1,
    });

    const handleOpen = () => setOpen(true);
    const handleClose = () => {
        setOpen(false);
        reset();
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("stock_keeper.inventory.receive"), {
            onSuccess: () => {
                handleClose();
            },
        });
    };

    return (
        <>
            <Head title="Inventory" />

            <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        Inventory
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Live catalog view for stocked items and selling activity.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpen}>
                    Receive Stock
                </Button>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                    <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>SKU Item</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Sold Count</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((item) => (
                                    <TableRow key={item.id} hover>
                                        <TableCell>{item.product_name}</TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={item.status ?? "unknown"}
                                                color={item.status === "active" ? "success" : "default"}
                                                variant={item.status === "active" ? "filled" : "outlined"}
                                            />
                                        </TableCell>
                                        <TableCell align="right">{item.sold_count ?? 0}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                </Grid>
            </Grid>

            {/* Receive Stock Dialog */}
            <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
                <form onSubmit={submit}>
                    <DialogTitle>Receive Stock</DialogTitle>
                    <DialogContent dividers>
                        <FormControl fullWidth margin="normal" error={!!errors.warehouse_id}>
                            <InputLabel id="warehouse-select-label">Warehouse</InputLabel>
                            <Select
                                labelId="warehouse-select-label"
                                value={data.warehouse_id}
                                label="Warehouse"
                                onChange={(e) => setData("warehouse_id", e.target.value)}
                            >
                                {warehouses.map((w) => (
                                    <MenuItem key={w.id} value={w.id}>
                                        {w.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.warehouse_id && (
                                <Typography variant="caption" color="error">
                                    {errors.warehouse_id}
                                </Typography>
                            )}
                        </FormControl>

                        <FormControl fullWidth margin="normal" error={!!errors.item_variant_id}>
                            <InputLabel id="variant-select-label">Item Variant</InputLabel>
                            <Select
                                labelId="variant-select-label"
                                value={data.item_variant_id}
                                label="Item Variant"
                                onChange={(e) => setData("item_variant_id", e.target.value)}
                            >
                                {variants.map((v) => (
                                    <MenuItem key={v.id} value={v.id}>
                                        {v.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.item_variant_id && (
                                <Typography variant="caption" color="error">
                                    {errors.item_variant_id}
                                </Typography>
                            )}
                        </FormControl>

                        <TextField
                            fullWidth
                            margin="normal"
                            label="Quantity"
                            type="number"
                            inputProps={{ min: 1 }}
                            value={data.quantity}
                            onChange={(e) => setData("quantity", Number(e.target.value))}
                            error={!!errors.quantity}
                            helperText={errors.quantity}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleClose} color="inherit">
                            Cancel
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing}>
                            Receive
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
