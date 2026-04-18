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
                    color: '#ffffff',
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
                    backgroundColor: '#272727', // YouTube Card color
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                <Typography
                    sx={{
                        color: '#f1f1f1',
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
