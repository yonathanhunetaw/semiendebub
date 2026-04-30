import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box, Button, Paper, Stack, TextField, Typography,
    Autocomplete, Chip, IconButton, Divider, Grid as Grid,
    MenuItem, Checkbox, ListItemText
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
        item_category_id: "" as string | number,
        status: "active",
        color_ids: [] as (string | number)[],
        size_ids: [] as (string | number)[],
        packaging: [{ item_packaging_type_id: "", quantity: 1 }],
        images: [] as File[],
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("admin.items.store"));
    };

    // YouTube Dark style visibility fix
    const inputStyle = {
        '& .MuiInputLabel-root': { color: '#aaaaaa' },
        '& .MuiInputLabel-root.Mui-focused': { color: '#3ea6ff' },
        '& .MuiInputLabel-root.MuiFormLabel-filled': { color: '#ffffff' },
        '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: '#444' },
            '&:hover fieldset': { borderColor: '#fff' },
            '&.Mui-focused fieldset': { borderColor: '#3ea6ff' },
        },
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" mb={4}>
                <Typography variant="h4" fontWeight="bold">Create Item Blueprint</Typography>
                <Button component={Link} href={route('admin.items.index')} variant="outlined">Cancel</Button>
            </Stack>

            <Paper sx={{ p: 4, boxShadow: 3, bgcolor: 'background.paper' }}>
                <form onSubmit={submit}>
                    <Grid container spacing={4}>
                        {/* Core Details */}
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth label="Product Name"
                                    value={data.product_name}
                                    onChange={e => setData('product_name', e.target.value)}
                                    error={!!errors.product_name} helperText={errors.product_name}
                                    sx={inputStyle}
                                />

                                <Autocomplete
                                    freeSolo
                                    options={categories}
                                    getOptionLabel={(o) => o.category_name || o.name || o}
                                    onChange={(e, val: any) => setData('item_category_id', val?.id || val)}
                                    renderInput={(params) => (
                                        <TextField {...params} label="Category (Select or Type New)" sx={inputStyle} />
                                    )}
                                />

                                <TextField
                                    fullWidth multiline rows={3} label="Description"
                                    value={data.product_description}
                                    onChange={e => setData('product_description', e.target.value)}
                                    sx={inputStyle}
                                />

                                <Divider />

                                <Autocomplete
                                    multiple freeSolo options={colors}
                                    getOptionLabel={(o) => o.name || o}
                                    value={data.color_ids.map(id => colors.find(c => c.id === id) || id)}
                                    onChange={(e, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(params) => <TextField {...params} label="Colors" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o, i) => (
                                        <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" />
                                    ))}
                                />

                                <Autocomplete
                                    multiple freeSolo options={sizes}
                                    getOptionLabel={(o) => o.name || o}
                                    value={data.size_ids.map(id => sizes.find(s => s.id === id) || id)}
                                    onChange={(e, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(params) => <TextField {...params} label="Sizes" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o, i) => (
                                        <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" />
                                    ))}
                                />
                            </Stack>
                        </Grid>

                        {/* Packaging & Media */}
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Stack spacing={3}>
                                <Typography variant="subtitle2" color="primary" fontWeight="bold">PACKAGING HIERARCHY</Typography>
                                {data.packaging.map((row, i) => (
                                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            select fullWidth label="Type" size="small"
                                            value={row.item_packaging_type_id}
                                            onChange={e => {
                                                const pkg = [...data.packaging];
                                                pkg[i].item_packaging_type_id = e.target.value;
                                                setData('packaging', pkg);
                                            }}
                                            sx={inputStyle}
                                        >
                                            {packagingTypes.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                                        </TextField>
                                        <TextField
                                            label="Qty" size="small" type="number" sx={{...inputStyle, width: '100px'}}
                                            value={row.quantity}
                                            onChange={e => {
                                                const pkg = [...data.packaging];
                                                pkg[i].quantity = parseInt(e.target.value);
                                                setData('packaging', pkg);
                                            }}
                                        />
                                        <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} disabled={data.packaging.length === 1} color="error">
                                            <DeleteIcon />
                                        </IconButton>
                                    </Stack>
                                ))}
                                <Button startIcon={<AddCircleIcon />} sx={{alignSelf: 'start', color: '#3ea6ff'}} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])}>
                                    Add Level
                                </Button>

                                <Divider />

                                <Button variant="outlined" component="label" fullWidth sx={{ py: 2, borderStyle: 'dashed' }}>
                                    Upload Photos
                                    <input type="file" hidden multiple onChange={e => setData('images', Array.from(e.target.files || []))} />
                                </Button>
                                {data.images.length > 0 && <Typography variant="caption">{data.images.length} files picked</Typography>}
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing} sx={{ px: 8, borderRadius: '24px', fontWeight: 'bold', bgcolor: 'white', color: 'black', '&:hover': { bgcolor: '#ccc' } }}>
                            {processing ? "Saving..." : "Create Template"}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
