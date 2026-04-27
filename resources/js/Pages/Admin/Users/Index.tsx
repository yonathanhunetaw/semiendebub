import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
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
    Typography,
    IconButton,
    Tooltip
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';

interface User {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string;
    created_at: string;
    creator?: {
        id: number;
        first_name: string;
        last_name: string | null;
    };
}

interface Props {
    users: User[];
}

export default function UsersIndex({ users }: Props) {

    const handleDelete = (userId: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            router.delete(route('admin.users.destroy', userId), {
                preserveScroll: true,
            });
        }
    };

    const getRoleColor = (role: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
        switch (role.toLowerCase()) {
            case 'admin':
                return 'error';
            case 'seller':
                return 'primary';
            case 'stock keeper':
            case 'stock_keeper':
                return 'info';
            default:
                return 'default';
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Head title="Users Management" />

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" fontWeight="bold">Users</Typography>
                <Button
                    component={Link}
                    href={route('admin.users.create')}
                    variant="contained"
                    startIcon={<AddIcon />}
                >
                    Add User
                </Button>
            </Stack>

            {/* Users Table */}
            <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'background.default' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Created By</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.length > 0 ? users.map((user) => (
                            <TableRow key={user.id} hover>
                                <TableCell>
                                    <Typography variant="body1" fontWeight="medium">
                                        {user.first_name} {user.last_name || ''}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {user.email}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">
                                        {user.phone_number || 'N/A'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={user.role}
                                        size="small"
                                        color={getRoleColor(user.role)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {user.creator
                                            ? `${user.creator.first_name} ${user.creator.last_name || ''}`
                                            : 'System'
                                        }
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <Tooltip title="View">
                                            <IconButton
                                                component={Link}
                                                href={route('admin.users.show', user.id)}
                                                size="small"
                                                color="info"
                                            >
                                                <VisibilityIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Edit">
                                            <IconButton
                                                component={Link}
                                                href={route('admin.users.edit', user.id)}
                                                size="small"
                                                color="primary"
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton
                                                onClick={() => handleDelete(user.id)}
                                                size="small"
                                                color="error"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <Typography variant="body1" color="text.secondary">
                                        No users found.
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

UsersIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
