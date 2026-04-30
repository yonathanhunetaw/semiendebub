import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm } from "@inertiajs/react";
import {
    Box, Button, Paper, Stack, TextField, Typography,
    Autocomplete, Chip, IconButton, Divider, Grid as Grid,
    InputAdornment
} from "@mui/material";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface OptionType { id: number; name?: string; category_name?: string; }

export default function Create({ categories, colors, sizes, packagingTypes }: any) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        product_description: "", // Added
        packaging_details: "",    // Added
        item_category_id: "" as string | number,
        status: "active",
        color_ids: [] as (string | number)[],
        size_ids: [] as (string | number)[],
        packaging: [{ item_packaging_type_id: "" as string | number, quantity: 1 }],
        images: [] as File[],
    });

    const inputStyle = {
        '& .MuiInputLabel-root': { color: '#aaa' },
        '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: '#444' },
            '&:hover fieldset': { borderColor: '#fff' },
        },
    };

    // Generic function to handle "Add New" button clicks
    const handleQuickAdd = (field: string, currentValues: any) => {
        const name = prompt(`Enter new ${field} name:`);
        if (!name) return;

        if (Array.isArray(currentValues)) {
            setData(field as any, [...currentValues, name]);
        } else {
            setData(field as any, name);
        }
    };

    return (
        <Box sx={{ p: 3, bgcolor: '#0f0f0f', minHeight: '100vh', color: 'white' }}>
            <Head title="Create Item" />

            <Typography variant="h5" fontWeight="bold" mb={3}>Register Item Template</Typography>

            <Paper sx={{ p: 4, bgcolor: '#1e1e1e', backgroundImage: 'none', border: '1px solid #333' }}>
                <form onSubmit={(e) => { e.preventDefault(); post(route('admin.items.store')); }}>
                    <Grid container spacing={4}>

                        {/* LEFT: INFORMATION */}
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={inputStyle} />

                                <TextField fullWidth multiline rows={2} label="Product Description" value={data.product_description} onChange={e => setData('product_description', e.target.value)} sx={inputStyle} />

                                {/* CATEGORY + ADD BUTTON */}
                                <Stack direction="row" spacing={1}>
                                    <Autocomplete
                                        fullWidth
                                        options={categories}
                                        getOptionLabel={(o: any) => o.category_name || o.name || o.toString()}
                                        value={categories.find((c: any) => c.id === data.item_category_id) || data.item_category_id || null}
                                        onChange={(_, val: any) => setData('item_category_id', val?.id || val)}
                                        renderInput={(p) => <TextField {...p} label="Category" sx={inputStyle} />}
                                    />
                                    <IconButton onClick={() => handleQuickAdd('item_category_id', data.item_category_id)} sx={{ color: '#3ea6ff' }}><AddCircleIcon /></IconButton>
                                </Stack>

                                {/* COLORS + ADD BUTTON */}
                                <Stack direction="row" spacing={1}>
                                    <Autocomplete
                                        multiple fullWidth
                                        options={colors}
                                        getOptionLabel={(o: any) => o.name || o.toString()}
                                        value={data.color_ids.map(id => colors.find((c: any) => c.id === id) || id.toString())}
                                        onChange={(_, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                        renderInput={(p) => <TextField {...p} label="Colors" sx={inputStyle} />}
                                        renderTags={(val, getTagProps) => val.map((o: any, i) => (
                                            <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                        ))}
                                    />
                                    <IconButton onClick={() => handleQuickAdd('color_ids', data.color_ids)} sx={{ color: '#3ea6ff' }}><AddCircleIcon /></IconButton>
                                </Stack>

                                {/* SIZES + ADD BUTTON */}
                                <Stack direction="row" spacing={1}>
                                    <Autocomplete
                                        multiple fullWidth
                                        options={sizes}
                                        getOptionLabel={(o: any) => o.name || o.toString()}
                                        value={data.size_ids.map(id => sizes.find((s: any) => s.id === id) || id.toString())}
                                        onChange={(_, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                        renderInput={(p) => <TextField {...p} label="Sizes" sx={inputStyle} />}
                                        renderTags={(val, getTagProps) => val.map((o: any, i) => (
                                            <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                        ))}
                                    />
                                    <IconButton onClick={() => handleQuickAdd('size_ids', data.size_ids)} sx={{ color: '#3ea6ff' }}><AddCircleIcon /></IconButton>
                                </Stack>
                            </Stack>
                        </Grid>

                        {/* RIGHT: PACKAGING & MEDIA */}
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth multiline rows={2} label="General Packaging Details (e.g., Boxed/Fragile)" value={data.packaging_details} onChange={e => setData('packaging_details', e.target.value)} sx={inputStyle} />

                                <Typography variant="subtitle2" color="primary" fontWeight="bold">PACKAGING HIERARCHY</Typography>
                                {data.packaging.map((row, i) => (
                                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                                        <Autocomplete
                                            sx={{ flex: 3, ...inputStyle }}
                                            options={packagingTypes}
                                            getOptionLabel={(o: any) => o.name || o.toString()}
                                            value={packagingTypes.find((t: any) => t.id === row.item_packaging_type_id) || row.item_packaging_type_id || null}
                                            onChange={(_, val: any) => {
                                                const pkg = [...data.packaging];
                                                pkg[i].item_packaging_type_id = val?.id || val;
                                                setData('packaging', pkg);
                                            }}
                                            renderInput={(p) => <TextField {...p} label="Type" size="small" />}
                                        />
                                        <TextField label="Qty" size="small" type="number" sx={{ width: 70, ...inputStyle }} value={row.quantity} onChange={e => {
                                            const pkg = [...data.packaging];
                                            pkg[i].quantity = parseInt(e.target.value) || 0;
                                            setData('packaging', pkg);
                                        }} />
                                        <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} color="error" disabled={data.packaging.length === 1}><DeleteIcon /></IconButton>
                                    </Stack>
                                ))}
                                <Button startIcon={<AddCircleIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])}>Add Level</Button>

                                <Divider sx={{ borderColor: '#333' }} />

                                <Box
                                    sx={{ border: '2px dashed #444', borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer', '&:hover': { borderColor: '#3ea6ff' }}}
                                    component="label"
                                >
                                    <input type="file" hidden multiple onChange={e => setData('images', [...data.images, ...Array.from(e.target.files || [])])} />
                                    <CloudUploadIcon sx={{ fontSize: 30, color: '#aaa', mb: 1 }} />
                                    <Typography variant="body2" color="#aaa">Click to Upload Images</Typography>
                                    {data.images.length > 0 && <Typography color="primary">{data.images.length} files</Typography>}
                                </Box>
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={4} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing} sx={{ px: 8, borderRadius: 20, bgcolor: 'white', color: 'black', fontWeight: 'bold' }}>
                            Create Template
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
