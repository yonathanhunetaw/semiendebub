import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";

interface Category {
    id: number;
    category_name: string;
}

interface Props {
    categories: Category[];
}

export default function Create({ categories }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        product_name: "",
        product_description: "",
        item_category_id: "",
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("admin.items.store"));
    };

    return (
        <Box sx={{ p: 3, maxWidth: 860 }}>
            <Head title="Create Item" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h5" fontWeight={700}>Create Item</Typography>
                <Button component={Link} href={route("admin.items.index")} variant="outlined">
                    Back to Items
                </Button>
            </Stack>

            <Paper sx={{ p: 3 }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2.5}>
                        <TextField
                            label="Product Name"
                            value={data.product_name}
                            onChange={(e) => setData("product_name", e.target.value)}
                            error={Boolean(errors.product_name)}
                            helperText={errors.product_name}
                            fullWidth
                        />

                        <TextField
                            label="Product Description"
                            value={data.product_description}
                            onChange={(e) => setData("product_description", e.target.value)}
                            error={Boolean(errors.product_description)}
                            helperText={errors.product_description}
                            fullWidth
                            multiline
                            minRows={3}
                        />

                        <TextField
                            select
                            label="Category"
                            value={data.item_category_id}
                            onChange={(e) => setData("item_category_id", e.target.value)}
                            error={Boolean(errors.item_category_id)}
                            helperText={errors.item_category_id}
                            fullWidth
                        >
                            {categories.map((category) => (
                                <MenuItem key={category.id} value={String(category.id)}>
                                    {category.category_name}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Stack direction="row" spacing={1.5}>
                            <Button type="submit" variant="contained" disabled={processing}>
                                Save Item
                            </Button>
                            <Button component={Link} href={route("admin.items.index")} variant="text">
                                Cancel
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
}

Create.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
