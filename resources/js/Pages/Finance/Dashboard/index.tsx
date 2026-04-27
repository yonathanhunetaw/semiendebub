import React from 'react';
import FinanceLayout from '@/Layouts/FinanceLayout';
import { Head } from '@inertiajs/react';
import { Typography, Paper, Box, Divider, Grid } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

export default function Index() {
    return (
        <>
            <Head title="Overview" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>Financial Overview</Typography>
                <Typography variant="body1" color="text.secondary">Tracking gold, ROI, and crypto assets.</Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                        <Typography variant="overline" color="text.secondary">Current Portfolio Value</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>$0.00</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, color: 'success.main' }}>
                            <TrendingUpIcon fontSize="small" sx={{ mr: 0.5 }} />
                            <Typography variant="caption">0% vs last month</Typography>
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Asset Distribution</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            Your gold weight conversions and crypto ROI tracking will appear here.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
