import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Typography, Divider, Chip } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import Grid from '@mui/material/Grid';

interface User {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string;
    created_at: string;
    creator?: { first_name: string; last_name: string | null; };
}

export default function ShowUser({ user }: { user: User }) {
    return (
        <Box sx={{ p: 3 }}>
            <Head title={`View User - ${user.first_name}`} />

            <Stack direction="row" justifyContent="space-between" mb={4}>
                <Button component={Link} href={route('admin.users.index')} startIcon={<ArrowBackIcon />}>
                    Back to List
                </Button>
                <Button component={Link} href={route('admin.users.edit', user.id)} variant="outlined" startIcon={<EditIcon />}>
                    Edit User
                </Button>
            </Stack>

            <Paper sx={{ p: 4, maxWidth: 600, mx: 'auto', boxShadow: 3 }}>
                <Typography variant="h5" gutterBottom fontWeight="bold">User Details</Typography>
                <Divider sx={{ mb: 3 }} />

                <Grid container spacing={2}>
                    <Grid item xs={4}><Typography color="text.secondary">Full Name:</Typography></Grid>
                    <Grid item xs={8}><Typography fontWeight="medium">{user.first_name} {user.last_name}</Typography></Grid>

                    <Grid item xs={4}><Typography color="text.secondary">Email:</Typography></Grid>
                    <Grid item xs={8}><Typography>{user.email}</Typography></Grid>

                    <Grid item xs={4}><Typography color="text.secondary">Phone:</Typography></Grid>
                    <Grid item xs={8}><Typography>{user.phone_number || 'N/A'}</Typography></Grid>

                    <Grid item xs={4}><Typography color="text.secondary">Role:</Typography></Grid>
                    <Grid item xs={8}><Chip label={user.role} size="small" color="primary" /></Grid>

                    <Grid item xs={4}><Typography color="text.secondary">Created By:</Typography></Grid>
                    <Grid item xs={8}><Typography>{user.creator?.first_name || 'System'}</Typography></Grid>
                </Grid>
            </Paper>
        </Box>
    );
}

ShowUser.layout = (page: React.ReactNode) => <AdminLayout children={page} />;
