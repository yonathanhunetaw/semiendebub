import type React from "react";
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';
import MarketingLayout from '@/Layouts/MarketingLayout';

export default function Campaigns() {
    return (
        <>
            <Head title="Campaigns" />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Campaigns</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Nothing here yet.</Typography>
        </>
    );
}

Campaigns.layout = (page: React.ReactNode) => <MarketingLayout>{page}</MarketingLayout>;
