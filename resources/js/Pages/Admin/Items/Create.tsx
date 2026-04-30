import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm } from "@inertiajs/react";
import {
    Box, Button, Paper, Stack, TextField, Typography,
    Autocomplete, Chip, IconButton, Divider, Grid as Grid
} from "@mui/material";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface OptionType {
    id: number;
    name?: string;
    category_name?: string;
}

interface Props {
    categories: OptionType[];
    colors: OptionType[];
    sizes: OptionType[];
    packagingTypes: OptionType[];
}

export default function Create({ categories, colors, sizes, packagingTypes }: Props) {
    const { data, setData, post, processing } = useForm({
        product_name: "",
        item_category_id: "" as string | number,
        color_ids: [] as (string | number)[],
        size_ids: [] as (string | number)[],
        packaging: [{ item_packaging_type_id: "" as string | number, quantity: 1 }],
        images: [] as File[],
        status: "active"
    });

    const inputStyle = {
        '& .MuiInputLabel-root': { color: '#aaa' },
        '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: '#444' },
            '&:hover fieldset': { borderColor: '#fff' },
            '&.Mui-focused fieldset': { borderColor: '#3ea6ff' },
        },
    };

    // Helper to resolve labels for Chips
    const getChipLabel = (o: any) => {
        if (typeof o === 'object' && o !== null) return o.name || o.category_name || "";
        return o.toString();
    };

    return (
        <Box sx={{ p: 3, bgcolor: '#0f0f0f', minHeight: '100vh', color: 'white' }}>
            <Head title="Create Item" />
            <Typography variant="h5" fontWeight="bold" mb={3}>Register New Item</Typography>

            <Paper sx={{ p: 4, bgcolor: '#1e1e1e', backgroundImage: 'none', border: '1px solid #333' }}>
                <form onSubmit={(e) => { e.preventDefault(); post(route('admin.items.store')); }}>
                    <Grid container spacing={4}>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={inputStyle} />

                                {/* CATEGORY */}
                                <Autocomplete
                                    freeSolo
                                    options={categories}
                                    getOptionLabel={(o: string | OptionType) => (typeof o === 'string' ? o : o.category_name || "")}
                                    // FIX: Resolve number to object or string
                                    value={categories.find(c => c.id === data.item_category_id) || (data.item_category_id ? data.item_category_id.toString() : null)}
                                    onChange={(_, val: any) => setData('item_category_id', val?.id || val)}
                                    renderInput={(p) => <TextField {...p} label="Category" sx={inputStyle} />}
                                />

                                {/* COLORS */}
                                <Autocomplete
                                    multiple freeSolo
                                    options={colors}
                                    getOptionLabel={(o: string | OptionType) => (typeof o === 'string' ? o : o.name || "")}
                                    // FIX: Ensure no raw numbers are in this array
                                    value={data.color_ids.map(id => colors.find(c => c.id === id) || id.toString())}
                                    onChange={(_, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(p) => <TextField {...p} label="Colors" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o: any, i) => (
                                        <Chip label={getChipLabel(o)} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                    ))}
                                />

                                {/* SIZES */}
                                <Autocomplete
                                    multiple freeSolo
                                    options={sizes}
                                    getOptionLabel={(o: string | OptionType) => (typeof o === 'string' ? o : o.name || "")}
                                    // FIX: Ensure no raw numbers are in this array
                                    value={data.size_ids.map(id => sizes.find(s => s.id === id) || id.toString())}
                                    onChange={(_, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(p) => <TextField {...p} label="Sizes" sx={inputStyle} />}
                                    renderTags={(val, getTagProps) => val.map((o: any, i) => (
                                        <Chip label={getChipLabel(o)} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                    ))}
                                />
                            </Stack>
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="subtitle2" color="primary" mb={2} fontWeight="bold">PACKAGING HIERARCHY</Typography>
                            {data.packaging.map((row, i) => (
                                <Stack key={i} direction="row" spacing={1} mb={2}>
                                    <Autocomplete
                                        freeSolo sx={{ flex: 3, ...inputStyle }}
                                        options={packagingTypes}
                                        getOptionLabel={(o: string | OptionType) => (typeof o === 'string' ? o : o.name || "")}
                                        // FIX: Find object or cast ID to string
                                        value={packagingTypes.find(t => t.id === row.item_packaging_type_id) || (row.item_packaging_type_id ? row.item_packaging_type_id.toString() : null)}
                                        onChange={(_, val: any) => {
                                            const pkg = [...data.packaging];
                                            pkg[i].item_packaging_type_id = val?.id || val;
                                            setData('packaging', pkg);
                                        }}
                                        renderInput={(p) => <TextField {...p} label="Type" size="small" />}
                                    />
                                    <TextField label="Qty" size="small" type="number" sx={{ flex: 1, ...inputStyle }} value={row.quantity} onChange={e => {
                                        const pkg = [...data.packaging];
                                        pkg[i].quantity = parseInt(e.target.value) || 0;
                                        setData('packaging', pkg);
                                    }} />
                                    <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} color="error" disabled={data.packaging.length === 1}>
                                        <DeleteIcon />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button startIcon={<AddCircleIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])} sx={{ color: '#3ea6ff' }}>
                                Add Packaging Level
                            </Button>
                        </Grid>

                        <Grid size={12}>
                            <Divider sx={{ my: 3, borderColor: '#333' }} />
                            <Box
                                sx={{
                                    border: '2px dashed #444', borderRadius: 2, p: 4, textAlign: 'center', cursor: 'pointer',
                                    '&:hover': { borderColor: '#3ea6ff', bgcolor: '#222' }
                                }}
                                component="label"
                            >
                                <input type="file" hidden multiple accept="image/*" onChange={e => setData('images', [...data.images, ...Array.from(e.target.files || [])])} />
                                <CloudUploadIcon sx={{ fontSize: 40, color: '#aaa', mb: 1 }} />
                                <Typography color="#aaa">Click to add Product Images</Typography>
                                {data.images.length > 0 && <Typography color="#3ea6ff" mt={1}>{data.images.length} images staged</Typography>}
                            </Box>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing}
                            sx={{ px: 8, borderRadius: '24px', bgcolor: 'white', color: 'black', fontWeight: 'bold', '&:hover': { bgcolor: '#ccc' } }}>
                            {processing ? "Saving..." : "Create Product Template"}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
