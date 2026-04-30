import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box, Button, MenuItem, Paper, Stack, TextField,
    Typography, Checkbox, ListItemText, OutlinedInput, Select, FormControl,
    InputLabel, Chip, IconButton, Divider, Grid
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

    const darkInput = {
        '& .MuiOutlinedInput-root': {
            bgcolor: '#0f0f0f',
            '& fieldset': { borderColor: '#3f3f3f' },
            '&:hover fieldset': { borderColor: '#aaaaaa' },
        },
        '& label': { color: '#aaa' },
        '& input, & textarea, & .MuiSelect-select': { color: '#fff' }
    };

    return (
        <Box sx={{ p: 4, bgcolor: '#0f0f0f', minHeight: '100vh' }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" mb={4}>
                <Typography variant="h5" color="white" fontWeight={700}>New Catalog Item</Typography>
                <Button component={Link} href={route('admin.items.index')} sx={{ color: '#aaa' }}>Cancel</Button>
            </Stack>

            <Paper sx={{ p: 4, bgcolor: '#1f1f1f', borderRadius: 3, border: '1px solid #333' }}>
                <form onSubmit={submit}>
                    <Grid container spacing={4}>
                        {/* Left Column: Basic Info */}
                        <Grid item xs={12} md={7}>
                            <Stack spacing={3}>
                                <TextField fullWidth label="Product Name" value={data.product_name} onChange={e => setData('product_name', e.target.value)} sx={darkInput} />
                                <TextField fullWidth multiline rows={3} label="Description" value={data.product_description} onChange={e => setData('product_description', e.target.value)} sx={darkInput} />
                                <TextField fullWidth label="Packaging Details (e.g. Wrapped in Plastic)" value={data.packaging_details} onChange={e => setData('packaging_details', e.target.value)} sx={darkInput} />

                                <TextField select fullWidth label="Category" value={data.item_category_id} onChange={e => setData('item_category_id', e.target.value)} sx={darkInput}>
                                    {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                </TextField>

                                <Typography variant="subtitle2" color="#aaa">Attributes</Typography>
                                <Stack direction="row" spacing={2}>
                                    <FormControl fullWidth sx={darkInput}>
                                        <InputLabel>Colors</InputLabel>
                                        <Select multiple value={data.color_ids} onChange={e => setData('color_ids', e.target.value as number[])} input={<OutlinedInput label="Colors" />}>
                                            {colors.map(c => <MenuItem key={c.id} value={c.id}><Checkbox checked={data.color_ids.includes(c.id)} />{c.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <FormControl fullWidth sx={darkInput}>
                                        <InputLabel>Sizes</InputLabel>
                                        <Select multiple value={data.size_ids} onChange={e => setData('size_ids', e.target.value as number[])} input={<OutlinedInput label="Sizes" />}>
                                            {sizes.map(s => <MenuItem key={s.id} value={s.id}><Checkbox checked={data.size_ids.includes(s.id)} />{s.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Stack>
                            </Stack>
                        </Grid>

                        {/* Right Column: Packaging & Images */}
                        <Grid item xs={12} md={5}>
                            <Stack spacing={3}>
                                <Typography variant="subtitle2" color="#aaa">Packaging Multipliers</Typography>
                                {data.packaging.map((row, i) => (
                                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                                        <TextField select label="Type" size="small" value={row.item_packaging_type_id} onChange={e => {
                                            const pkg = [...data.packaging]; pkg[i].item_packaging_type_id = e.target.value; setData('packaging', pkg);
                                        }} sx={{ ...darkInput, flex: 2 }}>
                                            {packagingTypes.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                                        </TextField>
                                        <TextField label="Qty" size="small" type="number" value={row.quantity} onChange={e => {
                                            const pkg = [...data.packaging]; pkg[i].quantity = parseInt(e.target.value); setData('packaging', pkg);
                                        }} sx={{ ...darkInput, flex: 1 }} />
                                        <IconButton onClick={() => setData('packaging', data.packaging.filter((_, idx) => idx !== i))} disabled={data.packaging.length === 1} sx={{ color: '#ff4e4e' }}><DeleteIcon /></IconButton>
                                    </Stack>
                                ))}
                                <Button startIcon={<AddCircleIcon />} onClick={() => setData('packaging', [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])} sx={{ color: '#3ea6ff', alignSelf: 'start' }}>Add Level</Button>

                                <Divider sx={{ borderColor: '#333' }} />

                                <Typography variant="subtitle2" color="#aaa">Product Images</Typography>
                                <input type="file" multiple onChange={e => setData('images', Array.from(e.target.files || []))} style={{ color: '#aaa' }} />
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box mt={6} display="flex" justifyContent="flex-end">
                        <Button type="submit" variant="contained" disabled={processing} sx={{ bgcolor: 'white', color: 'black', borderRadius: '24px', px: 6, fontWeight: 700, '&:hover': { bgcolor: '#ddd' } }}>
                            Create Item
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}

Create.layout = (page: any) => <AdminLayout>{page}</AdminLayout>;
