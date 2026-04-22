import React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Typography, Box } from '@mui/material';

export default function Index() {
    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" fontWeight="bold">Active Deliveries</Typography>
            <Typography sx={{ mt: 2 }}>
                This is the main delivery tracking view.
            </Typography>
        </Box>
    );
}

// Ensure the path to your Layout is correct based on your aliases
Index.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
