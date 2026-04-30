import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm } from "@inertiajs/react";
import {
    Box, Button, Paper, Stack, TextField, Typography,
    Autocomplete, Chip, IconButton, Divider, Grid as Grid,
    Alert, Fade
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import { useState } from "react";

export default function Create({ categories, colors, sizes, packagingTypes }: any) {
    const { data, setData, post, processing } = useForm({
        product_name: "",
        product_description: "",
        packaging_details: "",
        item_category_id: "" as string | number,
        color_ids: [] as (string | number)[],
        size_ids: [] as (string | number)[],
        packaging: [{ item_packaging_type_id: "" as string | number, quantity: 1 }],
        images: [] as File[],
    });

    const [activeCreator, setActiveCreator] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState("");
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const inputStyle = {
        '& .MuiInputLabel-root': { color: '#aaa' },
        '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: '#444' },
            '&:hover fieldset': { borderColor: '#fff' },
            '&.Mui-focused fieldset': { borderColor: '#3ea6ff' },
        },
    };

    const handleInlineSave = (field: string, index?: number) => {
        if (!tempValue.trim()) return;

        if (field === 'packaging_type' && index !== undefined) {
            // Special handling for nested packaging array
            const newPkg = [...data.packaging];
            newPkg[index].item_packaging_type_id = tempValue;
            setData('packaging', newPkg);
        } else if (Array.isArray(data[field as keyof typeof data])) {
            const currentArr = data[field as keyof typeof data] as any[];
            setData(field as any, [...currentArr, tempValue]);
        } else {
            setData(field as any, tempValue);
        }

        setSuccessMsg(`"${tempValue}" added!`);
        setTempValue("");
        setActiveCreator(null);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    const InlineCreator = ({ field, label, index }: { field: string, label: string, index?: number }) => {
        const uniqueId = index !== undefined ? `${field}-${index}` : field;

        return (
            <Box sx={{ mt: 1 }}>
                {activeCreator !== uniqueId ? (
                    <Button
                        startIcon={<AddIcon />}
                        size="small"
                        onClick={() => setActiveCreator(uniqueId)}
                        sx={{ color: '#3ea6ff', textTransform: 'none', fontSize: '0.75rem' }}
                    >
                        Create New {label}
                    </Button>
                ) : (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <TextField
                            size="small"
                            placeholder={`New ${label}...`}
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            autoFocus
                            sx={{ ...inputStyle, bgcolor: '#111', flex: 1 }}
                        />
                        <Button variant="contained" size="small" onClick={() => handleInlineSave(field, index)} sx={{ bgcolor: '#3ea6ff' }}>Save</Button>
                        <Button size="small" onClick={() => setActiveCreator(null)} sx={{ color: '#aaa' }}>Cancel</Button>
                    </Stack>
                )}
            </Box>
        );
    };

    return (
        <Box sx={{ p: 3, bgcolor: '#0f0f0f', minHeight: '100vh', color: 'white' }}>
            <Head title="Create Item" />

            <Box sx={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
                <Fade in={!!successMsg}><Alert icon={<CheckCircleIcon fontSize="inherit" />} severity="success" sx={{ bgcolor: '#1e3a1e', color: '#8dfb8d' }}>{successMsg}</Alert></Fade>
            </Box>

            <Typography variant="h5" fontWeight="bold" mb={3}>Register New Item</Typography>

            <Paper sx={{ p: 4, bgcolor: '#1e1e1e', backgroundImage: 'none', border: '1px solid #333' }}>
                <form onSubmit={(e) => { e.preventDefault(); post(route('admin.items.store')); }}>
                    <Grid container spacing={4}>
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={4}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={inputStyle} />
                                <TextField fullWidth multiline rows={3} label="Product Description" value={data.product_description} onChange={e => setData('product_description', e.target.value)} sx={inputStyle} />

                                <Box>
                                    <Autocomplete fullWidth freeSolo options={categories}
                                        getOptionLabel={(o: any) => o.category_name || o.name || o.toString()}
                                        value={categories.find((c: any) => c.id === data.item_category_id) || data.item_category_id || null}
                                        onChange={(_, val: any) => setData('item_category_id', val?.id || val)}
                                        renderInput={(p) => <TextField {...p} label="Category" sx={inputStyle} />}
                                    />
                                    <InlineCreator field="item_category_id" label="Category" />
                                </Box>

                                <Box>
                                    <Autocomplete multiple fullWidth freeSolo options={colors}
                                        getOptionLabel={(o: any) => o.name || o.toString()}
                                        value={data.color_ids.map(id => colors.find((c: any) => c.id === id) || id)}
                                        onChange={(_, val) => setData('color_ids', val.map((v: any) => v.id || v))}
                                        renderInput={(p) => <TextField {...p} label="Colors" sx={inputStyle} />}
                                        renderTags={(val, getTagProps) => val.map((o: any, i: number) => (
                                            <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                        ))}
                                    />
                                    <InlineCreator field="color_ids" label="Color" />
                                </Box>

                                <Box>
                                    <Autocomplete multiple fullWidth freeSolo options={sizes}
                                        getOptionLabel={(o: any) => o.name || o.toString()}
                                        value={data.size_ids.map(id => sizes.find((s: any) => s.id === id) || id)}
                                        onChange={(_, val) => setData('size_ids', val.map((v: any) => v.id || v))}
                                        renderInput={(p) => <TextField {...p} label="Sizes" sx={inputStyle} />}
                                        renderTags={(val, getTagProps) => val.map((o: any, i: number) => (
                                            <Chip label={o.name || o} {...getTagProps({ index: i })} size="small" sx={{ bgcolor: '#333', color: 'white' }} />
                                        ))}
                                    />
                                    <InlineCreator field="size_ids" label="Size" />
                                </Box>
                            </Stack>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }}>
                            <Stack spacing={3}>
                                <TextField fullWidth multiline rows={2} label="Packaging Details" value={data.packaging_details} onChange={e => setData('packaging_details', e.target.value)} sx={inputStyle} />

                                <Typography variant="subtitle2" color="primary" fontWeight="bold">PACKAGING LEVELS</Typography>
                                {data.packaging.map((row, i) => (
                                    <Box key={i} sx={{ mb: 3, p: 2, borderRadius: 1, border: '1px solid #333', bgcolor: '#161616' }}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Autocomplete freeSolo sx={{ flex: 3, ...inputStyle }} options={packagingTypes}
                                                getOptionLabel={(o: any) => o.name || o.toString()}
                                                value={packagingTypes.find((t: any) => t.id === row.item_packaging_type_id) || row.item_packaging_type_id || null}
                                                onChange={(_, val: any) => {
                                                    const pkg = [...data.packaging];
                                                    pkg[i].item_packaging_type_id = val?.id || val;
                                                    setData('packaging', pkg);
                                                }}
                                                renderInput={(p) => <TextField {...p} label="Type" size="small" />}
                                            />
                                            <TextField label="Qty" size="small" type="number" sx={{ width: 80, ...inputStyle }} value={row.quantity} onChange={e => {
                                                const pkg = [...data.packaging];
                                                pkg[i].quantity = parseInt(e.target.value) || 0;
                                                setData('packaging', pkg);
                                            }} />
                                            <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} color="error" disabled={data.packaging.length === 1}><DeleteIcon /></IconButton>
                                        </Stack>
                                        <InlineCreator field="packaging_type" label="Type" index={i} />
                                    </Box>
                                ))}
                                <Button startIcon={<AddIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])} sx={{ color: '#3ea6ff' }}>Add Level</Button>

                                <Divider sx={{ my: 2, borderColor: '#333' }} />
                                <Box sx={{ border: '2px dashed #444', borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer', '&:hover': { borderColor: '#3ea6ff' } }} component="label">
                                    <input type="file" hidden multiple accept="image/*" onChange={e => setData('images', [...data.images, ...Array.from(e.target.files || [])])} />
                                    <CloudUploadIcon sx={{ fontSize: 35, color: '#aaa', mb: 1 }} />
                                    <Typography variant="body2" color="#aaa">Click to upload images</Typography>
                                    {data.images.length > 0 && <Typography color="primary" mt={1}>{data.images.length} files staged</Typography>}
                                </Box>
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing} sx={{ px: 10, py: 1.5, borderRadius: 20, bgcolor: 'white', color: 'black', fontWeight: 'bold' }}>Save Everything</Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
