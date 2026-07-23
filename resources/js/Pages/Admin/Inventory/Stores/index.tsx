// resources/js/Pages/Admin/Inventory/Stores/index.tsx
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import PlaceIcon from "@mui/icons-material/Place";
import StorefrontIcon from "@mui/icons-material/Storefront";
import VisibilityIcon from "@mui/icons-material/Visibility";
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
    Pagination,
} from "@mui/material";

interface Store {
    id: number;
    name: string;
    location: string | null;
    manager: string | null;
    status: "active" | "inactive";
    store_variants_count: number;
}

interface PaginatedStores {
    data: Store[];
    current_page: number;
    last_page: number;
    total: number;
}

interface Props {
    stores: PaginatedStores;
}

export default function StoresIndex({ stores }: Props) {
    const handleDelete = (store: Store) => {
        if (
            !confirm(
                `Delete store "${store.name}"? All deployed variants will be removed.`,
            )
        )
            return;
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
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        mb={0.5}
                    >
                        <StorefrontIcon color="primary" />
                        <Typography variant="h5" fontWeight={700}>
                            Stores
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Manage stores and their deployed item variants. Use
                        "Deploy to Store" from an item to add variants.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href={route("store.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 700,
                    }}
                >
                    Add Store
                </Button>
            </Stack>

            {stores.data.length === 0 ? (
                <Paper
                    elevation={0}
                    sx={{
                        p: 6,
                        textAlign: "center",
                        borderRadius: "16px",
                        border: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    <StorefrontIcon
                        sx={{
                            fontSize: 48,
                            color: "text.disabled",
                            mb: 1,
                            display: "block",
                            mx: "auto",
                        }}
                    />
                    <Typography color="text.secondary">
                        No stores yet. Click "Add Store" to create one.
                    </Typography>
                </Paper>
            ) : (
                <>
                    {/* Mobile & Tablet View (Cards) */}
                    <Box sx={{ display: { xs: "grid", md: "none" }, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 3 }}>
                        {stores.data.map((store) => (
                            <Paper
                                key={store.id}
                                elevation={0}
                                sx={{
                                    p: 2.5,
                                    borderRadius: "16px",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    display: "flex",
                                    flexDirection: "column",
                                    height: "100%",
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                                            {store.name}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            label={store.status.toUpperCase()}
                                            color={store.status === "active" ? "success" : "default"}
                                            variant={store.status === "active" ? "filled" : "outlined"}
                                            sx={{ fontWeight: 600, fontSize: "0.7rem", height: 24 }}
                                        />
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={`${store.store_variants_count} variants`}
                                        color="info"
                                        variant="outlined"
                                        sx={{ fontWeight: 600 }}
                                    />
                                </Stack>

                                <Box sx={{ flexGrow: 1 }}>
                                    <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                                        <PersonIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                                        <Typography variant="body2" color={store.manager ? "text.primary" : "text.disabled"}>
                                            {store.manager || "No manager assigned"}
                                        </Typography>
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                                        <PlaceIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                                        <Typography variant="body2" color={store.location ? "text.primary" : "text.disabled"}>
                                            {store.location || "No location set"}
                                        </Typography>
                                    </Stack>
                                </Box>

                                <Stack direction="row" spacing={1} justifyContent="flex-end" pt={1.5} sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                                    <Tooltip title="View Store Inventory">
                                        <IconButton size="small" color="primary" component={Link} href={route("store.show", store.id)}>
                                            <VisibilityIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit store">
                                        <IconButton size="small" component={Link} href={route("store.edit", store.id)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete store">
                                        <IconButton size="small" color="error" onClick={() => handleDelete(store)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            </Paper>
                        ))}
                    </Box>

                    {/* Desktop View (Table) */}
                    <TableContainer
                        component={Paper}
                        elevation={0}
                        sx={{
                            display: { xs: "none", md: "block" },
                            borderRadius: "16px",
                            border: "1px solid",
                            borderColor: "divider",
                            mb: 3,
                        }}
                    >
                        <Table sx={{ minWidth: 600 }}>
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
                                {stores.data.map((store) => (
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
                                                sx={{ fontWeight: 600 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" label={`${store.store_variants_count} variants`} color="info" variant="outlined" sx={{ fontWeight: 600 }} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Tooltip title="View Store Inventory">
                                                    <IconButton size="small" color="primary" component={Link} href={route("store.show", store.id)}>
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Edit store">
                                                    <IconButton size="small" component={Link} href={route("store.edit", store.id)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete store">
                                                    <IconButton size="small" color="error" onClick={() => handleDelete(store)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Pagination */}
                    {stores.last_page > 1 && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                            <Pagination 
                                count={stores.last_page} 
                                page={stores.current_page} 
                                color="primary"
                                shape="rounded"
                                onChange={(e, page) => {
                                    router.get(route('store.index'), { page }, { preserveState: true, preserveScroll: true });
                                }} 
                            />
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}

StoresIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
