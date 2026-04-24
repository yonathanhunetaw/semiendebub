import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box, Paper, Chip, Stack } from '@mui/material';
import { Grid } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { LocalShipping, PendingActions, CheckCircle } from '@mui/icons-material';

export default function Index() {
    const theme = useTheme();
    const stats = [
        { label: 'Active', value: '12', Icon: LocalShipping, palette: theme.palette.success.main },
        { label: 'Pending', value: '3', Icon: PendingActions, palette: theme.palette.warning.main },
        { label: 'Completed', value: '145', Icon: CheckCircle, palette: theme.palette.info.main },
    ];
    const workflowCounts = [
        { label: 'Preparation Started', value: 6, color: 'warning' as const },
        { label: 'Ready For Pickup', value: 4, color: 'info' as const },
        { label: 'Accepted By Delivery', value: 5, color: 'primary' as const },
        { label: 'Out For Delivery', value: 7, color: 'success' as const },
    ];

    const recentShipments = [
        {
            orderNo: 'ORD-2418',
            stage: 'Accepted By Delivery',
            by: 'Stockkeeper Hana',
            destination: 'Bole, Addis Ababa',
            contact: '0911 223 344',
        },
        {
            orderNo: 'ORD-2421',
            stage: 'Preparation Started',
            by: 'Stockkeeper Noah',
            destination: 'CMC, Addis Ababa',
            contact: '0944 220 198',
        },
        {
            orderNo: 'ORD-2423',
            stage: 'Out For Delivery',
            by: 'Driver Bekele',
            destination: 'Piassa, Addis Ababa',
            contact: '0922 530 760',
        },
    ];

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight="bold">Delivery Dashboard</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Overview of your current logistics.
            </Typography>

            {/* In MUI v6, use container spacing and size props */}
            <Grid container spacing={2}>
                {stats.map((stat, i) => (
                    <Grid size={{ xs: 4 }} key={i}> {/* No 'item', use 'size' instead */}
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                textAlign: 'center',
                                bgcolor: alpha(stat.palette, 0.12),
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: alpha(stat.palette, 0.3),
                            }}
                        >
                            <Box
                                sx={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: alpha(stat.palette, 0.18),
                                    color: stat.palette,
                                    mb: 0.5,
                                }}
                            >
                                <stat.Icon fontSize="small" />
                            </Box>
                            <Typography variant="h6" fontWeight="bold" sx={{ color: 'text.primary' }}>
                                {stat.value}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                {stat.label}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ mt: 3, p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                    Workflow Snapshot
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {workflowCounts.map((step) => (
                        <Chip
                            key={step.label}
                            label={`${step.label}: ${step.value}`}
                            color={step.color}
                            variant="outlined"
                            size="small"
                        />
                    ))}
                </Stack>
            </Paper>

            <Paper sx={{ mt: 2, p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                    Recent Shipments
                </Typography>
                <Stack spacing={1.2}>
                    {recentShipments.map((shipment) => (
                        <Box
                            key={shipment.orderNo}
                            sx={{
                                p: 1.2,
                                borderRadius: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.default',
                            }}
                        >
                            <Typography variant="body2" fontWeight="bold">
                                {shipment.orderNo} - {shipment.stage}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {shipment.by} | {shipment.destination}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Contact: {shipment.contact}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            </Paper>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
