import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box, Paper } from '@mui/material';
import { LocalShipping } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';

export default function Index() {
    const theme = useTheme();

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
        </Box>
    );
}

// Ensure the path to your Layout is correct based on your aliases
Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
