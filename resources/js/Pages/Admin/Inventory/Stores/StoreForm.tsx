import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import { Box, Button, Card, CardContent, FormControl, Grid, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

export interface StoreFields {
    id?: number;
    name: string;
    location: string | null;
    manager: string | null;
    status: 'active' | 'inactive';
}

/**
 * The add / edit form for a store (Admin → Stores). A new store gets its own shelf and
 * back room (Store::booted), so nothing else is asked here.
 */
export default function StoreForm({ store }: { store?: StoreFields }) {
    const editing = store?.id !== undefined;
    const { data, setData, post, patch, processing, errors } = useForm({
        name: store?.name ?? '',
        location: store?.location ?? '',
        manager: store?.manager ?? '',
        status: store?.status ?? 'active',
    });
    const title = editing ? `Edit ${store?.name}` : 'Add store';

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editing) patch(route('store.update', store!.id));
        else post(route('store.store'));
    };

    return (
        <Box>
            <Head title={title} />
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>{title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {editing ? 'Rename the store, move it or close it.' : 'A new store starts with an empty shelf and back room.'}
                    </Typography>
                </Box>
                <Button component={Link} href={route('store.index')} variant="outlined" startIcon={<ArrowBackIcon />} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}>
                    Back to stores
                </Button>
            </Stack>

            <Card elevation={0} sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
                    <form onSubmit={submit}>
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField fullWidth required label="Store name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={!!errors.name} helperText={errors.name} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField fullWidth label="Location" value={data.location} onChange={(e) => setData('location', e.target.value)} error={!!errors.location} helperText={errors.location} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField fullWidth label="Manager name" value={data.manager} onChange={(e) => setData('manager', e.target.value)} error={!!errors.manager} helperText={errors.manager} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <FormControl fullWidth error={!!errors.status}>
                                    <InputLabel id="store-status">Status</InputLabel>
                                    <Select labelId="store-status" label="Status" value={data.status} onChange={(e) => setData('status', e.target.value as StoreFields['status'])}>
                                        <MenuItem value="active">Active</MenuItem>
                                        <MenuItem value="inactive">Inactive</MenuItem>
                                    </Select>
                                    {errors.status && <Typography color="error" variant="caption">{errors.status}</Typography>}
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Box mt={4} display="flex" justifyContent="flex-end">
                            <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={processing} sx={{ borderRadius: '8px', px: 4, fontWeight: 700 }}>
                                {editing ? 'Save changes' : 'Add store'}
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
}
