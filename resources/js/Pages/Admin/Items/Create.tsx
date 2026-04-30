import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box, Button, MenuItem, Paper, Stack, TextField,
    Typography, Checkbox, ListItemText, OutlinedInput, Select, FormControl, InputLabel, Chip
} from "@mui/material";

// Update interfaces to match what Controller is sending
interface BaseItem { id: number; name: string; }
interface Category { id: number; name: string; } // Matching your ItemCategory model
interface Color extends BaseItem { hex_code: string; }

interface Props {
    categories: Category[];
    colors: Color[];
    sizes: BaseItem[];
    packagingTypes: BaseItem[];
}

export default function Create({ categories, colors, sizes, packagingTypes }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        product_description: "",
        item_category_id: "",
        status: "active",
        color_ids: [] as number[],
        size_ids: [] as number[],
        // Storing packaging as an object with ID and quantity
        packaging: [] as { id: number; quantity: number }[],
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("admin.items.store"));
    };

    // Style helper for YouTube Dark inputs
    const darkInputStyle = {
        '& .MuiOutlinedInput-root': {
            backgroundColor: '#0f0f0f',
            '& fieldset': { borderColor: '#3f3f3f' },
            '&:hover fieldset': { borderColor: '#ffffff' },
        },
        '& .MuiInputLabel-root': { color: '#aaaaaa' },
        '& .MuiInputBase-input': { color: '#ffffff' },
    };

    return (
        <Box sx={{ p: 4, bgcolor: '#0f0f0f', minHeight: '100vh', color: 'white' }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h5" fontWeight={700}>Register New Product Template</Typography>
                <Button
                    component={Link}
                    href={route("admin.items.index")}
                    variant="contained"
                    sx={{ borderRadius: '20px', bgcolor: '#3f3f3f', '&:hover': { bgcolor: '#555' } }}
                >
                    Back to Catalog
                </Button>
            </Stack>

            <Paper sx={{ p: 4, bgcolor: '#1f1f1f', borderRadius: 3, border: '1px solid #333' }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={4}>

                        {/* Section 1: Basic Info */}
                        <Stack spacing={2.5}>
                            <TextField
                                label="Product Name"
                                value={data.product_name}
                                onChange={(e) => setData("product_name", e.target.value)}
                                error={Boolean(errors.product_name)}
                                helperText={errors.product_name}
                                fullWidth
                                sx={darkInputStyle}
                            />

                            <TextField
                                select
                                label="Category"
                                value={data.item_category_id}
                                onChange={(e) => setData("item_category_id", e.target.value)}
                                error={Boolean(errors.item_category_id)}
                                helperText={errors.item_category_id}
                                fullWidth
                                sx={darkInputStyle}
                            >
                                {categories.map((category) => (
                                    <MenuItem key={category.id} value={String(category.id)}>
                                        {category.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>

                        {/* Section 2: Attributes (Colors & Sizes) */}
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                            <FormControl fullWidth sx={darkInputStyle}>
                                <InputLabel>Available Colors</InputLabel>
                                <Select
                                    multiple
                                    value={data.color_ids}
                                    onChange={(e) => setData('color_ids', e.target.value as number[])}
                                    input={<OutlinedInput label="Available Colors" />}
                                    renderValue={(selected) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {selected.map((value) => (
                                                <Chip key={value} label={colors.find(c => c.id === value)?.name} sx={{ bgcolor: '#3f3f3f', color: 'white' }} />
                                            ))}
                                        </Box>
                                    )}
                                >
                                    {colors.map((color) => (
                                        <MenuItem key={color.id} value={color.id}>
                                            <Checkbox checked={data.color_ids.indexOf(color.id) > -1} sx={{ color: '#3f3f3f' }} />
                                            <ListItemText primary={color.name} />
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth sx={darkInputStyle}>
                                <InputLabel>Available Sizes</InputLabel>
                                <Select
                                    multiple
                                    value={data.size_ids}
                                    onChange={(e) => setData('size_ids', e.target.value as number[])}
                                    input={<OutlinedInput label="Available Sizes" />}
                                    renderValue={(selected) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {selected.map((value) => (
                                                <Chip key={value} label={sizes.find(s => s.id === value)?.name} sx={{ bgcolor: '#3f3f3f', color: 'white' }} />
                                            ))}
                                        </Box>
                                    )}
                                >
                                    {sizes.map((size) => (
                                        <MenuItem key={size.id} value={size.id}>
                                            <Checkbox checked={data.size_ids.indexOf(size.id) > -1} sx={{ color: '#3f3f3f' }} />
                                            <ListItemText primary={size.name} />
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>

                        {/* Submit Button (YouTube Pill Style) */}
                        <Stack direction="row" spacing={2}>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                sx={{
                                    bgcolor: 'white',
                                    color: 'black',
                                    fontWeight: 700,
                                    borderRadius: '24px',
                                    px: 4,
                                    '&:hover': { bgcolor: '#e5e5e5' }
                                }}
                            >
                                Create Template
                            </Button>
                        </Stack>

                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
