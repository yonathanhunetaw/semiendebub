import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box, Paper, Chip, Stack, Divider } from '@mui/material';
import { LocalShipping } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';

export default function Index() {
    const theme = useTheme();
    const deliveries = [
        {
            orderNo: 'ORD-2418',
            status: 'Accepted By Delivery',
            preparedBy: 'Stockkeeper Hana',
            recipientPhone: '0911 223 344',
            location: 'Bole, Addis Ababa',
            driverName: 'Abel K',
            driverPhone: '0922 112 334',
            plateNumber: 'AA-45231',
        },
        {
            orderNo: 'ORD-2423',
            status: 'Out For Delivery',
            preparedBy: 'Stockkeeper Noah',
            recipientPhone: '0944 220 198',
            location: 'CMC, Addis Ababa',
            driverName: 'Samuel T',
            driverPhone: '0910 788 001',
            plateNumber: 'OR-77421',
        },
        {
            orderNo: 'ORD-2426',
            status: 'Ready For Pickup',
            preparedBy: 'Sales Eden',
            recipientPhone: '0933 550 662',
            location: 'Megenagna, Addis Ababa',
            driverName: 'Unassigned',
            driverPhone: '-',
            plateNumber: '-',
        },
    ];

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight="bold">My Delivery</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Track active routes and shipment progress.
            </Typography>

            <Paper
                elevation={0}
                sx={{
                    p: 2.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.info.main, 0.35),
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                }}
            >
                <LocalShipping sx={{ color: theme.palette.info.main }} />
                <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: 'text.primary' }}>
                        Active Deliveries
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        This is the main delivery tracking view.
                    </Typography>
                </Box>
            </Paper>

            <Stack spacing={1.5} sx={{ mt: 2 }}>
                {deliveries.map((delivery) => (
                    <Paper
                        key={delivery.orderNo}
                        elevation={0}
                        sx={{
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                        }}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                            <Typography variant="subtitle2" fontWeight="bold">
                                {delivery.orderNo}
                            </Typography>
                            <Chip label={delivery.status} size="small" color="primary" variant="outlined" />
                        </Box>
                        <Divider sx={{ mb: 1.2 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Prepared By: {delivery.preparedBy}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Recipient Phone: {delivery.recipientPhone}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Driver: {delivery.driverName} ({delivery.driverPhone})
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Plate Number: {delivery.plateNumber}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Location: {delivery.location}
                        </Typography>
                    </Paper>
                ))}
            </Stack>
        </Box>
    );
}

// Ensure the path to your Layout is correct based on your aliases
Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
