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

interface BaseOption { id: number; name?: string; category_name?: string; }

export default function Create({ categories, colors, sizes, packagingTypes }: any) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        item_category_id: "" as any,
        color_ids: [] as any[],
        size_ids: [] as any[],
        packaging: [{ item_packaging_type_id: "" as any, quantity: 1 }],
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setData('images', [...data.images, ...Array.from(e.target.files)]);
        }
    };

    return (
        <Box sx={{ p: 3, bgcolor: '#0f0f0f', color: 'white' }}>
            <Head title="Create Item" />

            <Typography variant="h5" fontWeight="bold" mb={3}>Create New Item Blueprint</Typography>

            <Paper sx={{ p: 4, bgcolor: '#1e1e1e', backgroundImage: 'none', border: '1px solid #333' }}>
                <form onSubmit={(e) => { e.preventDefault(); post(route('admin.items.store')); }}>
                    <Grid container spacing={5}>

                        {/* LEFT COLUMN: IDENTIFIERS */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={inputStyle} />

                                {/* CATEGORY WITH "ADD" LOGIC */}
                                <Autocomplete
                                    freeSolo
                                    options={categories}
                                    getOptionLabel={(o) => o.category_name || o.name || o}
                                    onChange={(_, val: any) => setData('item_category_id', val?.id || val)}
                                    renderInput={(params) => (
                                        <TextField {...params} label="Category" sx={inputStyle}
                                            placeholder="Select or type to add new..."
                                        />
                                    )}
                                />

                                <Autocomplete
                                    multiple freeSolo
                                    options={colors}
                                    getOptionLabel={(o) => o.name || o}
                                    value={data.color_ids.map((id:any) => colors.find((c:any) => c.id === id) || id)}
                                    onChange={(_, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(params) => <TextField {...params} label="Colors" sx={inputStyle} />}
                                    renderTags={(value, getTagProps) => value.map((option: any, index: number) => (
                                        <Chip label={option.name || option} {...getTagProps({ index })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                    ))}
                                />

                                <Autocomplete
                                    multiple freeSolo
                                    options={sizes}
                                    getOptionLabel={(o) => o.name || o}
                                    value={data.size_ids.map((id:any) => sizes.find((s:any) => s.id === id) || id)}
                                    onChange={(_, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                    renderInput={(params) => <TextField {...params} label="Sizes" sx={inputStyle} />}
                                    renderTags={(value, getTagProps) => value.map((option: any, index: number) => (
                                        <Chip label={option.name || option} {...getTagProps({ index })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                    ))}
                                />
                            </Stack>
                        </Grid>

                        {/* RIGHT COLUMN: PACKAGING */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="subtitle2" color="primary" mb={2} fontWeight="bold">PACKAGING HIERARCHY</Typography>
                            {data.packaging.map((row, i) => (
                                <Stack key={i} direction="row" spacing={1} mb={2} alignItems="center">
                                    <Autocomplete
                                        freeSolo sx={{ flex: 3, ...inputStyle }}
                                        options={packagingTypes}
                                        getOptionLabel={(o) => o.name || o}
                                        value={packagingTypes.find((t:any) => t.id === row.item_packaging_type_id) || row.item_packaging_type_id}
                                        onChange={(_, val: any) => {
                                            const pkg = [...data.packaging];
                                            pkg[i].item_packaging_type_id = val?.id || val;
                                            setData('packaging', pkg);
                                        }}
                                        renderInput={(params) => <TextField {...params} label="Type (Box, Pallet...)" size="small" />}
                                    />
                                    <TextField
                                        label="Qty" size="small" type="number" sx={{ flex: 1, ...inputStyle }}
                                        value={row.quantity}
                                        onChange={e => {
                                            const pkg = [...data.packaging];
                                            pkg[i].quantity = parseInt(e.target.value);
                                            setData('packaging', pkg);
                                        }}
                                    />
                                    <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} color="error" disabled={data.packaging.length === 1}>
                                        <DeleteIcon />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button startIcon={<AddCircleIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])} sx={{ color: '#3ea6ff' }}>
                                Add Packaging Level
                            </Button>
                        </Grid>

                        {/* BOTTOM AREA: IMAGE UPLOAD */}
                        <Grid size={12}>
                            <Divider sx={{ my: 2, borderColor: '#333' }} />
                            <Typography variant="subtitle2" color="primary" mb={2} fontWeight="bold">PRODUCT IMAGES</Typography>

                            <Box
                                sx={{
                                    border: '2px dashed #444',
                                    borderRadius: 2,
                                    p: 4,
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    '&:hover': { borderColor: '#3ea6ff', bgcolor: '#252525' }
                                }}
                                component="label"
                            >
                                <input type="file" hidden multiple onChange={handleFileChange} accept="image/*" />
                                <CloudUploadIcon sx={{ fontSize: 40, color: '#aaa', mb: 1 }} />
                                <Typography color="#aaa">Click or Drag images here to upload</Typography>
                                {data.images.length > 0 && (
                                    <Typography color="primary" fontWeight="bold" mt={1}>
                                        {data.images.length} images staged for upload
                                    </Typography>
                                )}
                            </Box>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            sx={{
                                px: 10, py: 1.5,
                                borderRadius: '30px',
                                bgcolor: 'white',
                                color: 'black',
                                fontWeight: 'bold',
                                '&:hover': { bgcolor: '#ccc' }
                            }}
                        >
                            {processing ? "Saving..." : "Create Product"}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
