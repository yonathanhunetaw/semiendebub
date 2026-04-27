import React from 'react';
import SharedLayout from '@/Layouts/SharedLayout';
import { Head } from '@inertiajs/react';
import { Typography, Paper, Box, Divider, Grid } from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';

export default function Index() {
    return (
        <>
            <Head title="Dashboard" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>Shared Hub</Typography>
            </Box>

            {/* v6 Syntax: 'container' is correct, but NO 'item' prop */}
            <Grid container spacing={3}>

                {/* Use 'size' instead of 'xs' or 'md' */}
                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <HubIcon color="primary" />
                            <Typography variant="h6">Service Overview</Typography>
                        </Box>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            Currently monitoring local services on port 8095.
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 3 }}>
                        <Typography variant="h6">Quick Sync</Typography>
                        <Typography variant="body2">Configurations are up to date.</Typography>
                    </Paper>
                </Grid>

            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SharedLayout>{page}</SharedLayout>;
