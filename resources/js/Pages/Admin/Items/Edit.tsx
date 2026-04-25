import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head, Link, useForm } from "@inertiajs/react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";

interface Item {
    id: number;
    name?: string;
    description?: string;
    price?: number | string;
    stock?: number | string;
    piecesinapacket?: number | string;
    packetsinacartoon?: number | string;
    status?: string;
}

interface Props {
    item: Item;
}

export default function Edit({ item }: Props) {
    const { data, setData, patch, processing, errors } = useForm({
        name: item.name ?? "",
        description: item.description ?? "",
        price: String(item.price ?? ""),
        stock: String(item.stock ?? ""),
        piecesinapacket: String(item.piecesinapacket ?? ""),
        packetsinacartoon: String(item.packetsinacartoon ?? ""),
        status: item.status ?? "inactive",
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        patch(route("admin.items.update", item.id));
    };

    return (
        <Box sx={{ p: 3, maxWidth: 860 }}>
            <Head title="Edit Item" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h5" fontWeight={700}>Edit Item</Typography>
                <Button component={Link} href={route("admin.items.index")} variant="outlined">
                    Back to Items
                </Button>
            </Stack>

            <Paper sx={{ p: 3 }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2.5}>
                        <TextField
                            label="Name"
                            value={data.name}
                            onChange={(e) => setData("name", e.target.value)}
                            error={Boolean(errors.name)}
                            helperText={errors.name}
                            fullWidth
                        />
                        <TextField
                            label="Description"
                            value={data.description}
                            onChange={(e) => setData("description", e.target.value)}
                            error={Boolean(errors.description)}
                            helperText={errors.description}
                            fullWidth
                            multiline
                            minRows={3}
                        />
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            <TextField
                                label="Price"
                                value={data.price}
                                onChange={(e) => setData("price", e.target.value)}
                                error={Boolean(errors.price)}
                                helperText={errors.price}
                                fullWidth
                            />
                            <TextField
                                label="Stock"
                                value={data.stock}
                                onChange={(e) => setData("stock", e.target.value)}
                                error={Boolean(errors.stock)}
                                helperText={errors.stock}
                                fullWidth
                            />
                        </Stack>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            <TextField
                                label="Pieces in a Packet"
                                value={data.piecesinapacket}
                                onChange={(e) => setData("piecesinapacket", e.target.value)}
                                error={Boolean(errors.piecesinapacket)}
                                helperText={errors.piecesinapacket}
                                fullWidth
                            />
                            <TextField
                                label="Packets in a Cartoon"
                                value={data.packetsinacartoon}
                                onChange={(e) => setData("packetsinacartoon", e.target.value)}
                                error={Boolean(errors.packetsinacartoon)}
                                helperText={errors.packetsinacartoon}
                                fullWidth
                            />
                        </Stack>
                        <TextField
                            label="Status"
                            value={data.status}
                            onChange={(e) => setData("status", e.target.value)}
                            error={Boolean(errors.status)}
                            helperText={errors.status}
                            fullWidth
                        />
                        <Stack direction="row" spacing={1.5}>
                            <Button type="submit" variant="contained" disabled={processing}>
                                Update Item
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

Edit.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
