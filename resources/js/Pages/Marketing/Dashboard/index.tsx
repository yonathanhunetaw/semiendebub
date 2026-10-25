import type React from "react";
import { Head } from '@inertiajs/react';
import { Typography } from '@mui/material';
import MarketingLayout from '@/Layouts/MarketingLayout';

export default function Dashboard() {
    return (
        <>
            <Head title="Dashboard" />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Dashboard</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Nothing here yet.</Typography>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => <MarketingLayout>{page}</MarketingLayout>;
