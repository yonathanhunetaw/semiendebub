import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import React from "react";

interface Props {
    user: {
        id: number;
        first_name: string;
        last_name: string | null;
        email: string;
        phone_number: string | null;
        /** Display form, e.g. "Stock Keeper". */
        role: string | null;
        created_at: string | null;
        store?: { id: number; name: string } | null;
        creator?: { first_name: string; last_name: string | null } | null;
    };
}

/** One user's profile: who they are, what they can do, where they work. */
export default function ShowUser({ user }: Props): React.ReactElement {
    const rows: Array<[string, React.ReactNode]> = [
        ["Email", user.email],
        ["Phone", user.phone_number ?? "—"],
        ["Role", user.role ? <Chip size="small" label={user.role} /> : "—"],
        ["Store", user.store?.name ?? "All stores"],
        ["Created by", user.creator ? `${user.creator.first_name} ${user.creator.last_name ?? ""}`.trim() : "—"],
        ["Created", user.created_at ? new Date(user.created_at).toLocaleString() : "—"],
    ];

    return (
        <Box sx={{ p: 3 }}>
            <Head title={`${user.first_name} ${user.last_name ?? ""}`.trim()} />

            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" mb={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Button component={Link} href={route("admin.users.index")} startIcon={<ArrowBackIcon />}>
                        Back
                    </Button>
                    <Typography variant="h5" fontWeight="bold">
                        {user.first_name} {user.last_name}
                    </Typography>
                </Stack>
                <Button component={Link} href={route("admin.users.edit", user.id)} variant="contained" startIcon={<EditIcon />}>
                    Edit
                </Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: 3, maxWidth: 640, borderRadius: 3 }}>
                <Stack spacing={1.5}>
                    {rows.map(([label, value]) => (
                        <Stack key={label} direction="row" justifyContent="space-between" spacing={2}>
                            <Typography color="text.secondary">{label}</Typography>
                            <Box sx={{ textAlign: "right", fontWeight: 600 }}>{value}</Box>
                        </Stack>
                    ))}
                </Stack>
            </Paper>
        </Box>
    );
}

ShowUser.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
