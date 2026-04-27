import AdminLayout from "@/Layouts/AppLayout";
import {Head} from "@inertiajs/react";
import {Box, Paper, Typography} from "@mui/material";

export default function Customers() {
    return (
        <Box sx={{p: 3}}>
            <Typography variant="h4" gutterBottom>
                Customers Dashboard
            </Typography>
            <Paper sx={{p: 2}}>
                <Typography>
                    Welcome to your Customers panel.
                </Typography>
            </Paper>
        </Box>
    );
}

// This tells Inertia to wrap the Dashboard content inside the AdminLayout
Customers.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Admin Dashboard"/>
        {page}
    </AdminLayout>
);
