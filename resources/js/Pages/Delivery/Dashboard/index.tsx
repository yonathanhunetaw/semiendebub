import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box, Paper, Card, CardContent } from '@mui/material';
import { Grid } from '@mui/material';
import { LocalShipping, PendingActions, CheckCircle } from '@mui/icons-material';

export default function Index() {
    const stats = [
        { label: 'Active', value: '12', icon: <LocalShipping color="primary" />, color: '#e8f5e9' },
        { label: 'Pending', value: '3', icon: <PendingActions color="warning" />, color: '#fff3e0' },
        { label: 'Completed', value: '145', icon: <CheckCircle color="success" />, color: '#f1f8e9' },
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
                        <Paper elevation={0} sx={{ p: 2, textAlign: 'center', bgcolor: stat.color, borderRadius: 2 }}>
                            {stat.icon}
                            <Typography variant="h6" fontWeight="bold">{stat.value}</Typography>
                            <Typography variant="caption" sx={{ display: 'block' }}>{stat.label}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ mt: 3, p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold">Recent Shipments</Typography>
                <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No recent updates.</Typography>
                </Box>
            </Paper>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
