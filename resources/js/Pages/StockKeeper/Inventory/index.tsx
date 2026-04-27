import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head } from "@inertiajs/react";
import {
    Box,
    Chip,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import React from "react";

interface StockItem {
    id: number;
    product_name: string;
    status?: string;
    sold_count?: number;
}

export default function Index({ items = [] }: { items?: StockItem[] }) {
    return (
        <>
            <Head title="Inventory" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Inventory
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Live catalog view for stocked items and selling activity.
                </Typography>
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
        </>
    );
}

Index.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
