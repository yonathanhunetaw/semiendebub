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
    Grid as Grid,
    Chip
} from "@mui/material";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import CollectionsIcon from '@mui/icons-material/Collections';

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

    // Global style for Dark Mode visibility
    const inputStyle = {
        '& .MuiInputLabel-root': { color: 'text.secondary' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'primary.main' },
        '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: 'divider' },
            '&:hover fieldset': { borderColor: 'text.primary' },
        }
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

            <Paper sx={{ p: 4, boxShadow: 3, border: '1px solid', borderColor: 'divider' }}>
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
                                    sx={inputStyle}
                                />
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    label="Description"
                                    value={data.product_description}
                                    onChange={e => setData('product_description', e.target.value)}
                                    sx={inputStyle}
                                />
                                <TextField
                                    fullWidth
                                    label="Packaging Details"
                                    placeholder="e.g. Wrapped in plastic, Fragile"
                                    value={data.packaging_details}
                                    onChange={e => setData('packaging_details', e.target.value)}
                                    sx={inputStyle}
                                />
                                <TextField
                                    select
                                    fullWidth
                                    label="Category"
                                    value={data.item_category_id}
                                    onChange={e => setData('item_category_id', e.target.value)}
                                    error={!!errors.item_category_id}
                                    helperText={errors.item_category_id}
                                    sx={inputStyle}
                                >
                                    {categories.map(c => (
                                        <MenuItem key={c.id} value={c.id}>{c.name || c.category_name}</MenuItem>
                                    ))}
                                </TextField>

                                <Divider sx={{ my: 1 }} />

                                <Typography variant="subtitle2" color="primary" fontWeight="bold">ATTRIBUTES</Typography>

                                <Stack direction="row" spacing={2}>
                                    <FormControl fullWidth sx={inputStyle}>
                                        <InputLabel>Colors</InputLabel>
                                        <Select
                                            multiple
                                            value={data.color_ids}
                                            onChange={e => setData('color_ids', e.target.value as number[])}
                                            input={<OutlinedInput label="Colors" />}
                                            renderValue={(selected) => (
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {selected.map((id) => (
                                                        <Chip key={id} size="small" label={colors.find(c => c.id === id)?.name} />
                                                    ))}
                                                </Box>
                                            )}
                                        >
                                            {colors.map(c => (
                                                <MenuItem key={c.id} value={c.id}>
                                                    <Checkbox checked={data.color_ids.includes(c.id)} />
                                                    <ListItemText primary={c.name} />
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <FormControl fullWidth sx={inputStyle}>
                                        <InputLabel>Sizes</InputLabel>
                                        <Select
                                            multiple
                                            value={data.size_ids}
                                            onChange={e => setData('size_ids', e.target.value as number[])}
                                            input={<OutlinedInput label="Sizes" />}
                                            renderValue={(selected) => (
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {selected.map((id) => (
                                                        <Chip key={id} size="small" label={sizes.find(s => s.id === id)?.name} />
                                                    ))}
                                                </Box>
                                            )}
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
                                <Typography variant="subtitle2" color="primary" fontWeight="bold">PACKAGING HIERARCHY</Typography>

                                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                                    {data.packaging.map((row, i) => (
                                        <Stack key={i} direction="row" spacing={1} alignItems="center" mb={2}>
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
                                                sx={{ ...inputStyle, flex: 2 }}
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
                                                sx={{ ...inputStyle, flex: 1 }}
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
                                        variant="text"
                                        color="primary"
                                        sx={{ fontWeight: 'bold' }}
                                    >
                                        Add Hierarchy Level
                                    </Button>
                                </Box>

                                <Divider sx={{ my: 1 }} />

                                <Typography variant="subtitle2" color="primary" fontWeight="bold">MEDIA</Typography>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    fullWidth
                                    startIcon={<CollectionsIcon />}
                                    sx={{ py: 1.5, borderStyle: 'dashed' }}
                                >
                                    Upload Marketing Photos
                                    <input
                                        type="file"
                                        hidden
                                        multiple
                                        onChange={e => setData('images', Array.from(e.target.files || []))}
                                    />
                                </Button>
                                {data.images.length > 0 && (
                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                        {data.images.map((file, idx) => (
                                            <Chip key={idx} label={file.name} size="small" onDelete={() => setData('images', data.images.filter((_, i) => i !== idx))} />
                                        ))}
                                    </Stack>
                                )}
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={processing}
                            sx={{
                                px: 10,
                                py: 1.5,
                                borderRadius: 10,
                                fontWeight: 'bold',
                                fontSize: '1rem',
                                boxShadow: '0 4px 14px 0 rgba(0,0,0,0.39)'
                            }}
                        >
                            {processing ? "Saving..." : "Create Product Template"}
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
