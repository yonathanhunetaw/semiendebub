// resources/js/Pages/Admin/Dashboard/index.tsx
import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head} from "@inertiajs/react";
import {Box, Paper, Typography} from "@mui/material";

export default function Dashboard() {
    return (
        <Box sx={{p: 3}}>
            <Typography variant="h4" gutterBottom>
                Admin Dashboard
            </Typography>
            <Paper sx={{p: 2}}>
                <Typography>
                    Welcome to your admin control panel.
                </Typography>
            </Paper>
        </Box>
    );
}

// This tells Inertia to wrap the Dashboard content inside the AdminLayout
Dashboard.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Admin Dashboard"/>
        {page}
    </AdminLayout>
);
