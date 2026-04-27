import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { Head } from "@inertiajs/react";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import {
    Alert,
    Box,
    Grid,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

export default function Index() {
    return (
        <>
            <Head title="Stock Alerts" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Stock Alerts
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Highlight low-stock and fulfillment-risk signals for the warehouse desk.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                            <NotificationsActiveRoundedIcon color="primary" />
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Active Alerts
                            </Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Alert severity="warning">Low-stock monitoring is ready. Connect real threshold data next.</Alert>
                            <Alert severity="info">Use this page for replenishment flags, delayed receiving, and urgent outbound picks.</Alert>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
