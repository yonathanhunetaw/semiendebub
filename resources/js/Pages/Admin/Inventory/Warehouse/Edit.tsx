import React from 'react';
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box,
    Button,
    Card,
    CardContent,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';

interface Store {
    id: number;
    name: string;
}

interface Warehouse {
    id: number;
    name: string;
    code: string | null;
    address: string | null;
    store_id: number | null;
    manager: string | null;
    status: string;
}

interface Props {
    warehouse: Warehouse;
    stores: Store[];
}

export default function EditWarehouse({ warehouse, stores = [] }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        name: warehouse.name || '',
        code: warehouse.code || '',
        address: warehouse.address || '',
        store_id: warehouse.store_id?.toString() || '',
        manager: warehouse.manager || '',
        status: warehouse.status || 'active',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put(route('admin.inventory.warehouse.update', warehouse.id));
    };

    return (
        <Box>
            <Head title={`Edit Warehouse: ${warehouse.name}`} />

            {/* Header */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                mb={3}
            >
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <Typography variant="h5" fontWeight={700}>
                            Edit Warehouse
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Update details for {warehouse.name}.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("admin.inventory.warehouse.index")}
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}
                >
                    Back to Warehouses
                </Button>
            </Stack>

            <Card elevation={0} sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider" }}>
                <CardContent sx={{ p: 4 }}>
                    <form onSubmit={submit}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Warehouse Name"
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    error={!!errors.name}
                                    helperText={errors.name}
                                    required
                                />
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Warehouse Code"
                                    value={data.code}
                                    onChange={(e) => setData('code', e.target.value)}
                                    error={!!errors.code}
                                    helperText={errors.code || "e.g., WH-MAIN-01"}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Address"
                                    value={data.address}
                                    onChange={(e) => setData('address', e.target.value)}
                                    error={!!errors.address}
                                    helperText={errors.address}
                                    multiline
                                    rows={3}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth error={!!errors.store_id}>
                                    <InputLabel>Linked Store (Optional)</InputLabel>
                                    <Select
                                        value={data.store_id}
                                        label="Linked Store (Optional)"
                                        onChange={(e) => setData('store_id', e.target.value as string)}
                                    >
                                        <MenuItem value="">
                                            <em>None (Independent Hub)</em>
                                        </MenuItem>
                                        {stores.map((store) => (
                                            <MenuItem key={store.id} value={store.id.toString()}>
                                                {store.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    {errors.store_id && <Typography color="error" variant="caption">{errors.store_id}</Typography>}
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Manager Name"
                                    value={data.manager}
                                    onChange={(e) => setData('manager', e.target.value)}
                                    error={!!errors.manager}
                                    helperText={errors.manager}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth error={!!errors.status}>
                                    <InputLabel>Status</InputLabel>
                                    <Select
                                        value={data.status}
                                        label="Status"
                                        onChange={(e) => setData('status', e.target.value as string)}
                                        required
                                    >
                                        <MenuItem value="active">Active</MenuItem>
                                        <MenuItem value="inactive">Inactive</MenuItem>
                                    </Select>
                                    {errors.status && <Typography color="error" variant="caption">{errors.status}</Typography>}
                                </FormControl>
                            </Grid>
                        </Grid>

                        <Box mt={4} display="flex" justifyContent="flex-end">
                            <Button
                                type="submit"
                                variant="contained"
                                color="primary"
                                startIcon={<SaveIcon />}
                                disabled={processing}
                                sx={{ borderRadius: "8px", px: 4, py: 1.5, fontWeight: 700 }}
                            >
                                Save Changes
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
}

EditWarehouse.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
