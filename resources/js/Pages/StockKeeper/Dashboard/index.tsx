import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
    Box,
    Divider,
    Grid,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
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
    const activeItems = items.filter((item) => item.status === "active").length;
    const flaggedItems = items.filter((item) => (item.sold_count ?? 0) < 5).length;

    return (
        <>
            <Head title="StockKeeper Dashboard" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    StockKeeper Dashboard
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Monitor inventory movement, fulfillment pressure, and low-stock risk.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Inventory2RoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Total SKUs
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {items.length}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <LocalShippingRoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Active Items
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {activeItems}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <WarningAmberRoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Needs Attention
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {flaggedItems}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 7 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Inventory Snapshot
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <List disablePadding>
                            {items.slice(0, 8).map((item) => (
                                <ListItem key={item.id} disableGutters divider>
                                    <ListItemText
                                        primary={item.product_name}
                                        secondary={`Status: ${item.status ?? "unknown"}`}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Shift Notes
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            Use the Inventory tab to review all stocked items, Orders to track outgoing
                            activity, and Stock Alerts to catch at-risk products before they stall
                            fulfillment.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
