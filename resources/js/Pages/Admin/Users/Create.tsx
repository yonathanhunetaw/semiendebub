import AdminLayout from "@/Layouts/AppLayout";
import { PageBand } from "@/Components/Admin/adminUi";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import { Head, useForm, Link } from "@inertiajs/react";
import UserAccessFields from "@/Components/Admin/UserAccessFields";
import AdminAreaTicks, { type AdminAreaOption } from "@/Components/Admin/AdminAreaTicks";
import Grid from '@mui/material/Grid';
import {
    Box, Button, Paper, Stack, TextField, Typography, MenuItem, Checkbox, FormControlLabel
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

interface Props {
    /** Every role that exists (spatie roles table). */
    roles?: string[];
    /** The roles that can be ticked beside the main one. */
    also_role_options?: string[];
    /** The dev layer: may tick Dev on a global admin and hide a user. */
    can_dev?: boolean;
    stores?: Array<{ id: number; name: string }>;
    /** A global admin may leave a user without a store; a store admin may not. */
    can_assign_any_store?: boolean;
    /** The active store, preselected for a new user. */
    default_store_id?: number | null;
    /** The global-zone parts a store admin may be given (global admins only). */
    admin_areas?: AdminAreaOption[];
}

export default function CreateUser({ roles = [], also_role_options = [], can_dev = false, stores = [], can_assign_any_store = true, default_store_id = null, admin_areas = [] }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        role: 'user',
        is_hidden: false,
        also_roles: [] as string[],
        store_id: (default_store_id ?? '') as number | '',
        password: '',
        password_confirmation: '',
        is_driver: false,
        areas: [] as string[],
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.users.store'));
    };

    return (
        <Box sx={{ maxWidth: 800, mx: "auto" }}>
            <Head title="Create User" />

            <Box sx={{ mb: 1.5 }}>
                <PageBand
                    icon={<PeopleAltOutlined />}
                    title="New user"
                    subtitle="Add someone and choose what they can open"
                    actions={<Button component={Link} href={route('admin.users.index')} size="small" variant="contained" disableElevation startIcon={<ArrowBackIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>All users</Button>}
                />
            </Box>

            <Paper elevation={0} variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: 'auto' }}>
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
                        <UserAccessFields
                            roles={roles} alsoOptions={also_role_options} stores={stores} canAssignAnyStore={can_assign_any_store}
                            role={data.role} storeId={data.store_id} alsoRoles={data.also_roles}
                            onRole={(role) => setData('role', role)} onStore={(id) => setData('store_id', id)} onAlsoRoles={(next) => setData('also_roles', next)}
                            canDev={can_dev} isHidden={data.is_hidden} onHidden={(hidden) => setData('is_hidden', hidden)}
                            errors={errors}
                        />
                        {data.role === 'delivery' && (
                            <Grid size={{ xs: 12 }}>
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_driver} onChange={e => setData('is_driver', e.target.checked)} />}
                                    label="Driver: may carry freight (hub → store shipments)"
                                />
                            </Grid>
                        )}
                        {data.role === 'admin' && data.store_id !== '' && admin_areas.length > 0 && (
                            <Grid size={{ xs: 12 }}>
                                <AdminAreaTicks options={admin_areas} value={data.areas} onChange={(next) => setData('areas', next)} error={errors.areas} />
                            </Grid>
                        )}
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
