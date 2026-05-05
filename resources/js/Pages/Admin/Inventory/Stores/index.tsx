// resources/js/Pages/Admin/Inventory/Stores/index.tsx
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import PlaceIcon from "@mui/icons-material/Place";
import StorefrontIcon from "@mui/icons-material/Storefront";
import {
    Box,
    Button,
    Chip,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";

interface Store {
    id: number;
    name: string;
    location: string | null;
    manager: string | null;
    status: "active" | "inactive";
    store_variants_count: number;
}

interface Props {
    stores: Store[];
}

export default function StoresIndex({ stores }: Props) {
    const handleDelete = (store: Store) => {
        if (!confirm(`Delete store "${store.name}"? All deployed variants will be removed.`)) return;
        router.delete(route("store.destroy", store.id));
    };

    return (
        <Box>
            <Head title="Stores" />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                mb={3}
            >
                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <StorefrontIcon color="primary" />
                        <Typography variant="h5" fontWeight={700}>
                            Stores
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Manage stores and their deployed item variants. Use "Deploy to Store" from an item to add variants.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("store.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700 }}
                >
                    Add Store
                </Button>
            </Stack>

            <TableContainer
                component={Paper}
                elevation={0}
                sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider" }}
            >
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Store</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Manager</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Variants Deployed</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stores.length > 0 ? (
                            stores.map((store) => (
                                <TableRow key={store.id} hover>
                                    <TableCell>
                                        <Typography variant="body1" fontWeight={700}>
                                            {store.name}
                                        </Typography>
                                        {store.location && (
                                            <Stack direction="row" alignItems="center" spacing={0.5} mt={0.25}>
                                                <PlaceIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {store.location}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {store.manager ? (
                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                <PersonIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                                                <Typography variant="body2">{store.manager}</Typography>
                                            </Stack>
                                        ) : (
                                            <Typography variant="body2" color="text.disabled">—</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={store.status.toUpperCase()}
                                            color={store.status === "active" ? "success" : "default"}
                                            variant={store.status === "active" ? "filled" : "outlined"}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={`${store.store_variants_count} variants`}
                                            color="info"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Tooltip title="Edit store">
                                                <IconButton
                                                    size="small"
                                                    component={Link}
                                                    href={route("store.edit", store.id)}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete store">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleDelete(store)}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                    <StorefrontIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1, display: "block", mx: "auto" }} />
                                    <Typography color="text.secondary">
                                        No stores yet. Click "Add Store" to create one.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

StoresIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
