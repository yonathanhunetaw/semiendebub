import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box, Button, Paper, Stack, TextField, Typography,
    Autocomplete, Chip, IconButton, Divider, Grid as Grid
} from "@mui/material";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';

interface BaseOption {
    id: number;
    name?: string;
    category_name?: string;
}

interface Props {
    categories: BaseOption[];
    colors: BaseOption[];
    sizes: BaseOption[];
    packagingTypes: BaseOption[];
}

export default function Create({ categories, colors, sizes, packagingTypes }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        product_description: "",
        item_category_id: "" as string | number,
        status: "active",
        color_ids: [] as (string | number)[],
        size_ids: [] as (string | number)[],
        packaging: [{ item_packaging_type_id: "" as string | number, quantity: 1 }],
        images: [] as File[],
    });

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

    // Helper to resolve the label safely
    const getOptionLabel = (option: string | number | BaseOption, source: BaseOption[]) => {
        if (typeof option === 'object') return option.name || option.category_name || "";
        if (typeof option === 'number') {
            const found = source.find(i => i.id === option);
            return found ? (found.name || found.category_name || option.toString()) : option.toString();
        }
        return option;
    };

    return (
        <Box sx={{ p: 3, bgcolor: '#0f0f0f', minHeight: '100vh' }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" mb={4}>
                <Typography variant="h4" fontWeight="bold" color="white">New Item Blueprint</Typography>
                <Button component={Link} href={route('admin.items.index')} variant="outlined" sx={{ color: '#aaa', borderColor: '#444' }}>Cancel</Button>
            </Stack>

            <Paper sx={{ p: 4, bgcolor: '#1e1e1e', border: '1px solid #333', backgroundImage: 'none' }}>
                <form onSubmit={(e) => { e.preventDefault(); post(route('admin.items.store')); }}>
                    <Grid container spacing={4}>
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={inputStyle} />

                                <Autocomplete
                                    freeSolo
                                    options={categories}
                                    getOptionLabel={(o) => getOptionLabel(o, categories)}
                                    // FIX: Ensure value is string or object, never number
                                    value={categories.find(c => c.id === data.item_category_id) || (typeof data.item_category_id === 'number' ? data.item_category_id.toString() : data.item_category_id) || null}
                                    onChange={(_, val: any) => setData('item_category_id', val?.id || val)}
                                    renderInput={(p) => <TextField {...p} label="Category" sx={inputStyle} />}
                                />

                                <TextField fullWidth multiline rows={3} label="Description" value={data.product_description} onChange={e => setData('product_description', e.target.value)} sx={inputStyle} />

                                <Divider sx={{ borderColor: '#333' }} />

                                <Autocomplete
                                    multiple freeSolo options={colors}
                                    getOptionLabel={(o) => getOptionLabel(o, colors)}
                                    // FIX: Map numbers to objects or strings
                                    value={data.color_ids.map(id => colors.find(c => c.id === id) || (typeof id === 'number' ? id.toString() : id))}
                                    onChange={(_, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(p) => <TextField {...p} label="Colors" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o: any, i: number) => (
                                        <Chip label={typeof o === 'object' ? o.name : o} {...getTagProps({ index: i })} size="small" />
                                    ))}
                                />

                                <Autocomplete
                                    multiple freeSolo options={sizes}
                                    getOptionLabel={(o) => getOptionLabel(o, sizes)}
                                    // FIX: Map numbers to objects or strings
                                    value={data.size_ids.map(id => sizes.find(s => s.id === id) || (typeof id === 'number' ? id.toString() : id))}
                                    onChange={(_, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(p) => <TextField {...p} label="Sizes" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o: any, i: number) => (
                                        <Chip label={typeof o === 'object' ? o.name : o} {...getTagProps({ index: i })} size="small" />
                                    ))}
                                />
                            </Stack>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }}>
                            <Stack spacing={3}>
                                <Typography variant="subtitle2" color="primary">PACKAGING LEVELS</Typography>
                                {data.packaging.map((row, i) => (
                                    <Stack key={i} direction="row" spacing={1}>
                                        <Autocomplete
                                            freeSolo fullWidth options={packagingTypes}
                                            getOptionLabel={(o) => getOptionLabel(o, packagingTypes)}
                                            // FIX: Ensure value is string or object
                                            value={packagingTypes.find(t => t.id === row.item_packaging_type_id) || (typeof row.item_packaging_type_id === 'number' ? row.item_packaging_type_id.toString() : row.item_packaging_type_id) || null}
                                            onChange={(_, val: any) => {
                                                const pkg = [...data.packaging];
                                                pkg[i].item_packaging_type_id = val?.id || val;
                                                setData('packaging', pkg);
                                            }}
                                            renderInput={(p) => <TextField {...p} label="Type" size="small" sx={inputStyle} />}
                                        />
                                        <TextField label="Qty" type="number" size="small" sx={{...inputStyle, width: 80}} value={row.quantity} onChange={e => {
                                            const pkg = [...data.packaging];
                                            pkg[i].quantity = parseInt(e.target.value) || 0;
                                            setData('packaging', pkg);
                                        }} />
                                        <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} color="error" disabled={data.packaging.length === 1}><DeleteIcon /></IconButton>
                                    </Stack>
                                ))}
                                <Button startIcon={<AddCircleIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])} sx={{ color: '#3ea6ff' }}>
                                    Add Level
                                </Button>
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={4} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing} sx={{ px: 8, borderRadius: 20, bgcolor: 'white', color: 'black', fontWeight: 'bold' }}>
                            Save Template
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
