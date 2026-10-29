import AdminLayout from "@/Layouts/AppLayout";
import { PageBand } from "@/Components/Admin/adminUi";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import { Head, useForm, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, TextField, Typography, MenuItem, Alert, Checkbox, FormControlLabel } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UpdateIcon from '@mui/icons-material/Update';
import UserAccessFields from "@/Components/Admin/UserAccessFields";
import AdminAreaTicks, { type AdminAreaOption } from "@/Components/Admin/AdminAreaTicks";
import Grid from '@mui/material/Grid';

interface User {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    /** The role key (stock_keeper), not its display form. */
    role: string;
    /** The other roles they hold beside the main one. */
    also_roles?: string[];
    is_hidden?: boolean;
    store_id: number | null;
    /** A courier who may carry freight (hub → store runs). */
    is_driver?: boolean;
    /** The global-zone parts ticked on for a store admin. */
    areas?: string[];
}

interface Props {
    user: User;
    roles?: string[];
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

export default function EditUser({ user, roles = [], also_role_options = [], can_dev = false, stores = [], can_assign_any_store = true, admin_areas = [] }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        first_name: user.first_name,
        last_name: user.last_name || '',
        email: user.email,
        phone_number: user.phone_number || '',
        role: user.role,
        is_hidden: Boolean(user.is_hidden),
        also_roles: user.also_roles ?? [],
        store_id: (user.store_id ?? '') as number | '',
        password: '',
        password_confirmation: '',
        is_driver: Boolean(user.is_driver),
        areas: user.areas ?? [],
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        put(route('admin.users.update', user.id));
    };

    return (
        <Box sx={{ maxWidth: 800, mx: "auto" }}>
            <Head title={`Edit ${user.first_name}`} />

            <Box sx={{ mb: 1.5 }}>
                <PageBand
                    icon={<PeopleAltOutlined />}
                    title={`Edit ${user.first_name}`}
                    subtitle="Change their details, roles and password"
                    actions={<Button component={Link} href={route('admin.users.index')} size="small" variant="contained" disableElevation startIcon={<ArrowBackIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>All users</Button>}
                />
            </Box>

            <Paper elevation={0} variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: 'auto' }}>
                <Alert severity="info" sx={{ mb: 3 }}>Leave password blank to keep current password.</Alert>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth label="First Name" value={data.first_name}
                                onChange={e => setData('first_name', e.target.value)}
                                error={!!errors.first_name} helperText={errors.first_name}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth label="Last Name" value={data.last_name}
                                onChange={e => setData('last_name', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth label="Email" value={data.email}
                                onChange={e => setData('email', e.target.value)}
                                error={!!errors.email} helperText={errors.email}
                            />
                        </Grid>
                        <UserAccessFields
                            half roles={roles} alsoOptions={also_role_options} stores={stores} canAssignAnyStore={can_assign_any_store}
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
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth label="New Password" type="password"
                                value={data.password} onChange={e => setData('password', e.target.value)}
                                error={!!errors.password} helperText={errors.password}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth label="Confirm New Password" type="password"
                                value={data.password_confirmation} onChange={e => setData('password_confirmation', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
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
