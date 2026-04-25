import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, TextField, Typography, MenuItem, Grid, Alert } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UpdateIcon from '@mui/icons-material/Update';

interface User {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string;
}

export default function EditUser({ user }: { user: User }) {
    const { data, setData, put, processing, errors } = useForm({
        first_name: user.first_name,
        last_name: user.last_name || '',
        email: user.email,
        phone_number: user.phone_number || '',
        role: user.role,
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        put(route('admin.users.update', user.id));
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title={`Edit ${user.first_name}`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={4}>
                <Button component={Link} href={route('admin.users.index')} startIcon={<ArrowBackIcon />}>
                    Back
                </Button>
                <Typography variant="h4" fontWeight="bold">Edit User: {user.first_name}</Typography>
            </Stack>

            <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto', boxShadow: 3 }}>
                <Alert severity="info" sx={{ mb: 3 }}>Leave password blank to keep current password.</Alert>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="First Name" value={data.first_name}
                                onChange={e => setData('first_name', e.target.value)}
                                error={!!errors.first_name} helperText={errors.first_name}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Last Name" value={data.last_name}
                                onChange={e => setData('last_name', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Email" value={data.email}
                                onChange={e => setData('email', e.target.value)}
                                error={!!errors.email} helperText={errors.email}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth select label="Role" value={data.role}
                                onChange={e => setData('role', e.target.value)}
                            >
                                {['admin', 'seller', 'stock_keeper', 'user'].map(r => (
                                    <MenuItem key={r} value={r}>{r}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="New Password" type="password"
                                value={data.password} onChange={e => setData('password', e.target.value)}
                                error={!!errors.password} helperText={errors.password}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Confirm New Password" type="password"
                                value={data.password_confirmation} onChange={e => setData('password_confirmation', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Button
                                type="submit" variant="contained"
                                color="primary" startIcon={<UpdateIcon />}
                                disabled={processing}
                            >
                                Update User
                            </Button>
                        </Grid>
                    </Grid>
                </form>
            </Paper>
        </Box>
    );
}

EditUser.layout = (page: React.ReactNode) => <AdminLayout children={page} />;
