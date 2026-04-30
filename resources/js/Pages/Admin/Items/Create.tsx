import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box,
    Button,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
    Checkbox,
    ListItemText,
    OutlinedInput,
    Select,
    FormControl,
    InputLabel,
    IconButton,
    Divider,
    Grid as Grid // Using Grid2 which is the standard for MUI v6
} from "@mui/material";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';

interface Props {
    categories: any[];
    colors: any[];
    sizes: any[];
    packagingTypes: any[];
}

export default function Create({ categories, colors, sizes, packagingTypes }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        product_description: "",
        packaging_details: "",
        item_category_id: "",
        status: "draft",
        color_ids: [] as number[],
        size_ids: [] as number[],
        packaging: [{ item_packaging_type_id: "", quantity: 1 }],
        images: [] as File[],
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("admin.items.store"));
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" fontWeight="bold">Create New Item</Typography>
                <Button component={Link} href={route('admin.items.index')} variant="outlined">
                    Cancel
                </Button>
            </Stack>

            <Paper sx={{ p: 4, boxShadow: 3 }}>
                <form onSubmit={submit}>
                    <Grid container spacing={4}>
                        {/* Left Column: Basic Details */}
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth
                                    label="Product Name"
                                    value={data.product_name}
                                    onChange={e => setData('product_name', e.target.value)}
                                    error={!!errors.product_name}
                                    helperText={errors.product_name}
                                />
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    label="Description"
                                    value={data.product_description}
                                    onChange={e => setData('product_description', e.target.value)}
                                />
                                <TextField
                                    fullWidth
                                    label="Packaging Details"
                                    placeholder="e.g. Wrapped in plastic, Fragile"
                                    value={data.packaging_details}
                                    onChange={e => setData('packaging_details', e.target.value)}
                                />
                                <TextField
                                    select
                                    fullWidth
                                    label="Category"
                                    value={data.item_category_id}
                                    onChange={e => setData('item_category_id', e.target.value)}
                                    error={!!errors.item_category_id}
                                    helperText={errors.item_category_id}
                                >
                                    {categories.map(c => (
                                        <MenuItem key={c.id} value={c.id}>{c.name || c.category_name}</MenuItem>
                                    ))}
                                </TextField>

                                <Divider sx={{ my: 1 }} />
                                <Typography variant="subtitle2" color="text.secondary">ATTRIBUTES</Typography>

                                <Stack direction="row" spacing={2}>
                                    <FormControl fullWidth>
                                        <InputLabel>Colors</InputLabel>
                                        <Select
                                            multiple
                                            value={data.color_ids}
                                            onChange={e => setData('color_ids', e.target.value as number[])}
                                            input={<OutlinedInput label="Colors" />}
                                            renderValue={(selected) => selected.length + ' selected'}
                                        >
                                            {colors.map(c => (
                                                <MenuItem key={c.id} value={c.id}>
                                                    <Checkbox checked={data.color_ids.includes(c.id)} />
                                                    <ListItemText primary={c.name} />
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <FormControl fullWidth>
                                        <InputLabel>Sizes</InputLabel>
                                        <Select
                                            multiple
                                            value={data.size_ids}
                                            onChange={e => setData('size_ids', e.target.value as number[])}
                                            input={<OutlinedInput label="Sizes" />}
                                            renderValue={(selected) => selected.length + ' selected'}
                                        >
                                            {sizes.map(s => (
                                                <MenuItem key={s.id} value={s.id}>
                                                    <Checkbox checked={data.size_ids.includes(s.id)} />
                                                    <ListItemText primary={s.name} />
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Stack>
                            </Stack>
                        </Grid>

                        {/* Right Column: Packaging Hierarchy & Files */}
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Stack spacing={3}>
                                <Typography variant="subtitle2" color="text.secondary">PACKAGING MULTIPLIERS</Typography>
                                {data.packaging.map((row, i) => (
                                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            select
                                            label="Type"
                                            size="small"
                                            value={row.item_packaging_type_id}
                                            onChange={e => {
                                                const pkg = [...data.packaging];
                                                pkg[i].item_packaging_type_id = e.target.value;
                                                setData('packaging', pkg);
                                            }}
                                            sx={{ flex: 2 }}
                                        >
                                            {packagingTypes.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                                        </TextField>
                                        <TextField
                                            label="Qty"
                                            size="small"
                                            type="number"
                                            value={row.quantity}
                                            onChange={e => {
                                                const pkg = [...data.packaging];
                                                pkg[i].quantity = parseInt(e.target.value);
                                                setData('packaging', pkg);
                                            }}
                                            sx={{ flex: 1 }}
                                        />
                                        <IconButton
                                            onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))}
                                            disabled={data.packaging.length === 1}
                                            color="error"
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    </Stack>
                                ))}
                                <Button
                                    startIcon={<AddCircleIcon />}
                                    onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])}
                                    sx={{ alignSelf: 'start' }}
                                >
                                    Add Hierarchy Level
                                </Button>

                                <Divider sx={{ my: 1 }} />

                                <Typography variant="subtitle2" color="text.secondary">PRODUCT IMAGES</Typography>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    fullWidth
                                >
                                    Upload Photos
                                    <input
                                        type="file"
                                        hidden
                                        multiple
                                        onChange={e => setData('images', Array.from(e.target.files || []))}
                                    />
                                </Button>
                                {data.images.length > 0 && (
                                    <Typography variant="caption">{data.images.length} files selected</Typography>
                                )}
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={4} display="flex" justifyContent="flex-end">
                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={processing}
                            sx={{ px: 6, fontWeight: 'bold' }}
                        >
                            {processing ? "Saving..." : "Create Item"}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
