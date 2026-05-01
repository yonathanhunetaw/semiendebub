import * as React from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Typography,
    Stack,
    Button,
    Breadcrumbs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    IconButton,
    InputBase,
    alpha // Correct lowercase utility
} from "@mui/material";
import {
    ArrowBack,
    Search,
    FilterList,
    MoreVert,
    Inventory,
    History,
    Edit
} from "@mui/icons-material";

// Interfaces for domain-driven models
interface Variant {
    id: number;
    name: string;
    sku: string;
    stock: number;
}

interface InventoryItem {
    id: number;
    name: string;
    category: { name: string };
    variants: Variant[];
    total_stock: number;
    status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface Props {
    store: { id: number; name: string };
    inventory: {
        data: InventoryItem[];
        links: any[];
    };
}

export default function InventoryShow({ store, inventory }: Props) {
    return (
        <Box sx={{ p: 3, maxWidth: 1600, margin: "0 auto" }}>
            <Head title={`${store.name} - Inventory`} />

            {/* Breadcrumbs & Navigation */}
            <Stack spacing={1} mb={4}>
                <Breadcrumbs sx={{ fontSize: '0.875rem' }}>
                    <Link
                        href={route('inventory.index')}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        Inventory Hub
                    </Link>
                    <Typography color="text.primary" sx={{ fontWeight: 600 }}>{store.name}</Typography>
                </Breadcrumbs>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <IconButton
                            component={Link}
                            href={route('inventory.index')}
                            sx={{ border: '1px solid', borderColor: 'divider' }}
                        >
                            <ArrowBack />
                        </IconButton>
                        <Box>
                            <Typography variant="h4" fontWeight={900}>{store.name} Stock</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Tracking {inventory.data.length} product lines in this location.
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={2}>
                        <Button startIcon={<History />} variant="outlined" sx={{ borderRadius: '10px', textTransform: 'none' }}>
                            Stock Log
                        </Button>
                        <Button startIcon={<Edit />} variant="contained" sx={{ borderRadius: '10px', textTransform: 'none' }}>
                            Adjust Stock
                        </Button>
                    </Stack>
                </Stack>
            </Stack>

            {/* Toolbar */}
            <Paper elevation={0} sx={{
                p: 2,
                mb: 3,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '12px',
                display: 'flex',
                gap: 2
            }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    py: 1,
                    bgcolor: 'action.hover',
                    borderRadius: '8px',
                    flexGrow: 1,
                    border: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Search sx={{ color: 'text.secondary', mr: 1 }} />
                    <InputBase placeholder="Search by SKU or Product Name..." fullWidth sx={{ fontWeight: 500 }} />
                </Box>
                <Button startIcon={<FilterList />} sx={{ color: 'text.primary', fontWeight: 600 }}>Filters</Button>
            </Paper>

            {/* Inventory Table */}
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Product Details</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Category</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Variants</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Availability</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {inventory.data.map((item) => (
                            <TableRow key={item.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                <TableCell>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{
                                            p: 1,
                                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                                            borderRadius: '8px',
                                            color: 'primary.main',
                                            display: 'flex'
                                        }}>
                                            <Inventory />
                                        </Box>
                                        <Box>
                                            <Typography variant="body1" fontWeight={700}>{item.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">ID: DKA-{item.id.toString().padStart(4, '0')}</Typography>
                                        </Box>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Chip label={item.category?.name || 'Uncategorized'} size="small" sx={{ fontWeight: 600 }} />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={600}>{item.variants.length} Types</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {item.variants.slice(0, 2).map(v => v.name).join(', ')}{item.variants.length > 2 && '...'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Box>
                                        <Typography variant="body2" fontWeight={800}>{item.total_stock} units</Typography>
                                        <LinearProgress
                                            value={Math.min((item.total_stock / 100) * 100, 100)}
                                            sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover' }}
                                            color={item.total_stock < 10 ? "error" : "success"}
                                        />
                                    </Box>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton size="small"><MoreVert /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

// Simple internal progress bar component
function LinearProgress({ value, sx, color }: any) {
    return (
        <Box sx={{ width: '100%', mr: 1, ...sx }}>
            <Box sx={{
                height: '100%',
                width: `${value}%`,
                bgcolor: (theme: any) => theme.palette[color].main,
                borderRadius: 'inherit',
                transition: 'width 0.5s ease-in-out'
            }} />
        </Box>
    );
}

InventoryShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
