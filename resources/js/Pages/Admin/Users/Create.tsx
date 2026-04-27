import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import Grid from '@mui/material/Grid';
import {
    Box, Button, Paper, Stack, TextField, Typography, MenuItem
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

const ROLES = ['admin', 'seller', 'stock_keeper', 'user'];

export default function CreateUser() {
    const { data, setData, post, processing, errors } = useForm({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        role: 'user',
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.users.store'));
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Create User" />

            <Stack direction="row" spacing={2} alignItems="center" mb={4}>
                <Button component={Link} href={route('admin.users.index')} startIcon={<ArrowBackIcon />}>
                    Back
                </Button>
                <Typography variant="h4" fontWeight="bold">Create New User</Typography>
            </Stack>

            <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto', boxShadow: 3 }}>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="First Name"
                                value={data.first_name}
                                onChange={e => setData('first_name', e.target.value)}
                                error={!!errors.first_name}
                                helperText={errors.first_name}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Last Name"
                                value={data.last_name}
                                onChange={e => setData('last_name', e.target.value)}
                                error={!!errors.last_name}
                                helperText={errors.last_name}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Email" type="email"
                                value={data.email}
                                onChange={e => setData('email', e.target.value)}
                                error={!!errors.email}
                                helperText={errors.email}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth select label="Role"
                                value={data.role}
                                onChange={e => setData('role', e.target.value)}
                            >
                                {ROLES.map(role => (
                                    <MenuItem key={role} value={role}>{role.replace('_', ' ')}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth label="Phone Number"
                                value={data.phone_number}
                                onChange={e => setData('phone_number', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Password" type="password"
                                value={data.password}
                                onChange={e => setData('password', e.target.value)}
                                error={!!errors.password}
                                helperText={errors.password}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth label="Confirm Password" type="password"
                                value={data.password_confirmation}
                                onChange={e => setData('password_confirmation', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Button
                                type="submit" variant="contained"
                                size="large" startIcon={<SaveIcon />}
                                disabled={processing}
                            >
                                Create User
                            </Button>
                        </Grid>
                    </Grid>
                </form>
            </Paper>
        </Box>
    );
}

CreateUser.layout = (page: React.ReactNode) => <AdminLayout children={page} />;
