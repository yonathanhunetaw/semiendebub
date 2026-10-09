import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import Grid from '@mui/material/Grid';
import {
    Box, Button, Paper, Stack, TextField, Typography, MenuItem
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

interface Props {
    /** Every role that exists (spatie roles table). */
    roles?: string[];
    stores?: Array<{ id: number; name: string }>;
    /** A global admin may leave a user without a store; a store admin may not. */
    can_assign_any_store?: boolean;
    /** The active store, preselected for a new user. */
    default_store_id?: number | null;
}

export default function CreateUser({ roles = [], stores = [], can_assign_any_store = true, default_store_id = null }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        role: 'user',
        store_id: (default_store_id ?? '') as number | '',
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
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="First Name"
                                value={data.first_name}
                                onChange={e => setData('first_name', e.target.value)}
                                error={!!errors.first_name}
                                helperText={errors.first_name}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="Last Name"
                                value={data.last_name}
                                onChange={e => setData('last_name', e.target.value)}
                                error={!!errors.last_name}
                                helperText={errors.last_name}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="Email" type="email"
                                value={data.email}
                                onChange={e => setData('email', e.target.value)}
                                error={!!errors.email}
                                helperText={errors.email}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth select label="Role"
                                value={data.role}
                                onChange={e => setData('role', e.target.value)}
                                error={!!errors.role}
                                helperText={errors.role}
                            >
                                {roles.map(role => (
                                    <MenuItem key={role} value={role}>{role.replace('_', ' ')}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth select label="Store"
                                value={data.store_id}
                                onChange={e => setData('store_id', e.target.value === '' ? '' : Number(e.target.value))}
                                error={!!errors.store_id}
                                helperText={errors.store_id ?? 'Sellers and stock keepers work at one store; leave empty for roles that cover all of them.'}
                            >
                                {can_assign_any_store && <MenuItem value="">No store</MenuItem>}
                                {stores.map(store => (
                                    <MenuItem key={store.id} value={store.id}>{store.name}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="Phone Number"
                                value={data.phone_number}
                                onChange={e => setData('phone_number', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="Password" type="password"
                                value={data.password}
                                onChange={e => setData('password', e.target.value)}
                                error={!!errors.password}
                                helperText={errors.password}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth label="Confirm Password" type="password"
                                value={data.password_confirmation}
                                onChange={e => setData('password_confirmation', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
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
