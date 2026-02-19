import AdminLayout from "@/Components/Admin/AdminLayout";
import {Head, Link, router} from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {route} from 'ziggy-js';

interface Item {
    id: number;
    product_name: string;
    status: 'active' | 'inactive' | 'unavailable' | 'draft';
    active_variants_count: number;
    total_stock: number;
}

interface Props {
    items: Item[];
    filters: {
        filter: string;
        sort: string;
        direction: 'asc' | 'desc';
    };
}

export default function ItemIndex({items, filters}: Props) {

    // Handle filtering and sorting by visiting the route with new params
    const updateParams = (newParams: Record<string, string>) => {
        router.get(route('admin.items.index'), {
            ...filters,
            ...newParams,
        }, {preserveState: true});
    };

    const statusOptions = ['all', 'active', 'inactive', 'unavailable', 'draft'];

    return (
        <Box sx={{p: 3}}>
            <Head title="Items Management"/>

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" fontWeight="bold">Items</Typography>
                <Button
                    component={Link}
                    href={route('admin.items.create')}
                    variant="contained"
                    startIcon={<AddIcon/>}
                >
                    Add Item
                </Button>
            </Stack>

            {/* Status Filters */}
            <Paper sx={{p: 2, mb: 3}}>
                <Typography variant="subtitle2" gutterBottom sx={{textTransform: 'uppercase', color: 'text.secondary'}}>
                    Filter by Status
                </Typography>
                <Stack direction="row" spacing={1}>
                    {statusOptions.map((opt) => (
                        <Chip
                            key={opt}
                            label={opt.toUpperCase()}
                            onClick={() => updateParams({filter: opt})}
                            color={filters.filter === opt ? "primary" : "default"}
                            variant={filters.filter === opt ? "filled" : "outlined"}
                            sx={{cursor: 'pointer'}}
                        />
                    ))}
                </Stack>
            </Paper>

            {/* Items Table */}
            <TableContainer component={Paper} sx={{boxShadow: 3}}>
                <Table>
                    <TableHead sx={{backgroundColor: '#f5f5f5'}}>
                        <TableRow>
                            <TableCell>
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    sx={{cursor: 'pointer', fontWeight: 'bold'}}
                                    onClick={() => updateParams({
                                        sort: 'name',
                                        direction: filters.direction === 'asc' ? 'desc' : 'asc'
                                    })}
                                >
                                    Name
                                    {filters.sort === 'name' && (
                                        filters.direction === 'asc' ? <ArrowUpwardIcon fontSize="small"/> :
                                            <ArrowDownwardIcon fontSize="small"/>
                                    )}
                                </Stack>
                            </TableCell>
                            <TableCell sx={{fontWeight: 'bold'}}>Inventory Details</TableCell>
                            <TableCell align="right" sx={{fontWeight: 'bold'}}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.length > 0 ? items.map((item) => (
                            <TableRow key={item.id} hover>
                                <TableCell>
                                    <Typography variant="body1" fontWeight="medium">
                                        {item.product_name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {item.status.toUpperCase()}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={`Variants: ${item.active_variants_count}`}
                                        size="small"
                                        color="info"
                                        sx={{mr: 1}}
                                    />
                                    <Typography variant="body2" component="span">
                                        Stock: <strong>{item.total_stock}</strong>
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Button
                                        component={Link}
                                        href={route('admin.items.show', item.id)}
                                        size="small"
                                        variant="outlined"
                                    >
                                        View
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} align="center" sx={{py: 5}}>
                                    No items found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

ItemIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
