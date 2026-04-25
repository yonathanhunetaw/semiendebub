// resources/js/Pages/Admin/Dashboard/index.tsx
import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head} from "@inertiajs/react";
import {Box, Paper, Typography} from "@mui/material";

export default function Dashboard() {
    return (
        <>
            <Typography
                variant="h5"
                sx={{
                    color: 'text.primary',
                    fontWeight: 700,
                    mb: 3,
                    letterSpacing: '-0.2px',
                    fontFamily: '"Roboto","Arial",sans-serif'
                }}
            >
                Admin Dashboard
            </Typography>

            <Paper
                elevation={0}
                sx={{
                    p: 3,
                    bgcolor: 'background.paper',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Typography
                    sx={{
                        color: 'text.secondary',
                        fontSize: '0.95rem',
                        fontWeight: 400
                    }}
                >
                    Welcome to your admin control panel.
                </Typography>
            </Paper>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Admin Dashboard"/>
        {page}
    </AdminLayout>
);
