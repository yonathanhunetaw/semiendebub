// resources/js/Pages/Admin/Dashboard/index.tsx
import AdminLayout from "@/Layouts/AppLayout";
import {Head} from "@inertiajs/react";
import {Box, Paper, Typography} from "@mui/material";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";

export default function Stores() {
    return (
        <Box sx={ROOT}>
            <Typography variant="h4" gutterBottom>
                Stores Dashboard
            </Typography>
            <Paper sx={{p: 2}}>
                <Typography>
                    Welcome to your Stores panel.
                </Typography>
            </Paper>
        </Box>
    );
}

// This tells Inertia to wrap the Dashboard content inside the AdminLayout
Stores.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Admin Dashboard"/>
        {page}
    </AdminLayout>
);
