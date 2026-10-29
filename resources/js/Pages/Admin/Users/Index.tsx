import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import {
    Box,
    Button,
    InputAdornment,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    IconButton,
    Tooltip
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, PageBand, Pill, TablePanel, adminTableSx, tinySx, type PillTone } from "@/Components/Admin/adminUi";
import UserAvatar from "@/Components/Visual/UserAvatar";
import { dayDate } from "@/utils/dates";

interface User {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string;
    /** Every role they hold (main first is not guaranteed). */
    role_keys?: string[];
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

const ROLE_TONE: Record<string, PillTone> = { admin: "error", seller: "primary", "stock keeper": "info", stock_keeper: "info", delivery: "warning" };

export default function UsersIndex({ users = [] }: Props) {
    const [query, setQuery] = React.useState("");

    const handleDelete = (userId: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            router.delete(route('admin.users.destroy', userId), {
                preserveScroll: true,
            });
        }
    };

    const needle = query.trim().toLowerCase();
    const shown = needle
        ? users.filter((user) => [user.first_name, user.last_name, user.email, user.phone_number, user.role].filter(Boolean).join(" ").toLowerCase().includes(needle))
        : users;
    const roleCounts = users.reduce<Record<string, number>>((acc, user) => ({ ...acc, [user.role]: (acc[user.role] ?? 0) + 1 }), {});
    const topRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return (
        <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title="Users" />

            <PageBand
                icon={<PeopleAltOutlined />}
                title="Users"
                subtitle="Everyone who can sign in, their roles, and who added them"
                actions={
                    <Button component={Link} href={route('admin.users.create')} size="small" variant="contained" disableElevation startIcon={<AddIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                        Add user
                    </Button>
                }
            />

            <FigureRow>
                <FigureTile label="People" value={users.length} tone="primary" />
                {topRoles.map(([role, n]) => (
                    <FigureTile key={role} label={role} value={n} tone={ROLE_TONE[role.toLowerCase()] ?? "default"} />
                ))}
            </FigureRow>

            <TablePanel
                head={
                    <TextField
                        size="small"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name, email, phone or role"
                        sx={{ maxWidth: 360, width: "100%" }}
                        slotProps={{ input: { startAdornment: (<InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>) } }}
                    />
                }
            >
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Phone</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Created by</TableCell>
                                <TableCell>Added</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.length > 0 ? shown.map((user) => {
                                const name = `${user.first_name} ${user.last_name || ''}`.trim();

                                return (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <UserAvatar name={name} role={user.role.toLowerCase().replace(/ /g, "_")} size={30} />
                                                <Typography component={Link} href={route('admin.users.show', user.id)} sx={{ fontWeight: 700, fontSize: "0.8125rem", color: "text.primary", textDecoration: "none", "&:hover": { color: "primary.main" } }}>
                                                    {name}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ color: "text.secondary" }}>{user.email}</TableCell>
                                        <TableCell>{user.phone_number || 'N/A'}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                                                <Pill tone={ROLE_TONE[user.role.toLowerCase()] ?? "default"} label={user.role} />
                                                {/* The roles they also hold, so who can do what is visible at a glance. */}
                                                {(user.role_keys ?? [])
                                                    .filter((key) => key.replace(/_/g, ' ') !== user.role.toLowerCase())
                                                    .map((key) => (
                                                        <Pill key={key} label={key.replace(/_/g, ' ')} />
                                                    ))}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ color: "text.secondary" }}>
                                            {user.creator ? `${user.creator.first_name} ${user.creator.last_name || ''}`.trim() : 'System'}
                                        </TableCell>
                                        <TableCell sx={{ ...tinySx, whiteSpace: "nowrap" }}>{dayDate(user.created_at)}</TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title="View">
                                                    <IconButton component={Link} href={route('admin.users.show', user.id)} size="small" color="info"><VisibilityIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                                <Tooltip title="Edit">
                                                    <IconButton component={Link} href={route('admin.users.edit', user.id)} size="small" color="primary"><EditIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton onClick={() => handleDelete(user.id)} size="small" color="error"><DeleteIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            }) : (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: "text.secondary" }}>No users found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TablePanel>
        </Box>
    );
}

UsersIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);
