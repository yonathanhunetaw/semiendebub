import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head } from "@inertiajs/react";
import {
    Box,
    Chip,
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
}

export default function Index({ items = [] }: { items?: StockItem[] }) {
    return (
        <>
            <Head title="StockKeeper Orders" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Order Flow
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Outbound work queue for stock handling and fulfillment preparation.
                </Typography>
            </Box>

            <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Queue Slot</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.slice(0, 12).map((item, index) => (
                            <TableRow key={item.id} hover>
                                <TableCell>{item.product_name}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={item.status ?? "pending"}
                                        color={item.status === "active" ? "success" : "default"}
                                        variant={item.status === "active" ? "filled" : "outlined"}
                                    />
                                </TableCell>
                                <TableCell align="right">#{index + 1}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
