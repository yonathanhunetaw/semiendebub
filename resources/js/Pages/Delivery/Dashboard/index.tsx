import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box, Paper } from '@mui/material';
import { Grid } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { LocalShipping, PendingActions, CheckCircle } from '@mui/icons-material';

export default function Index() {
    const theme = useTheme();
    const stats = [
        { label: 'Active', value: '12', Icon: LocalShipping, palette: theme.palette.info.main },
        { label: 'Pending', value: '3', Icon: PendingActions, palette: theme.palette.warning.main },
        { label: 'Completed', value: '145', Icon: CheckCircle, palette: theme.palette.success.main },
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
                <Typography variant="subtitle2" fontWeight="bold">Recent Shipments</Typography>
                <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No recent updates.</Typography>
                </Box>
            </Paper>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
