import AdminLayout from "@/Layouts/AppLayout";
import { shopZone } from "@/utils/dates";
import { Head, Link } from "@inertiajs/react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, PageBand, PanelHead, Pill, densePanelSx, tinySx } from "@/Components/Admin/adminUi";
import UserAvatar from "@/Components/Visual/UserAvatar";
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
        /** Every role they hold. */
        role_keys?: string[];
        created_at: string | null;
        store?: { id: number; name: string } | null;
        creator?: { first_name: string; last_name: string | null } | null;
    };
}

/** One user's profile: who they are, what they can do, where they work, who added them. */
export default function ShowUser({ user }: Props): React.ReactElement {
    const name = `${user.first_name} ${user.last_name ?? ""}`.trim();
    const alsoRoles = (user.role_keys ?? []).filter((key) => key.replace(/_/g, " ") !== (user.role ?? "").toLowerCase());
    const creator = user.creator ? `${user.creator.first_name} ${user.creator.last_name ?? ""}`.trim() : "System";
    const created = user.created_at ? new Date(user.created_at).toLocaleString(undefined, { timeZone: shopZone() }) : "—";
    const rows: Array<[string, React.ReactNode]> = [
        ["Email", user.email],
        ["Phone", user.phone_number ?? "—"],
        ["Role", user.role ? <Pill tone="primary" label={user.role} /> : "—"],
        ["Also works as", alsoRoles.length > 0 ? <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ flexWrap: "wrap" }}>{alsoRoles.map((key) => <Pill key={key} label={key.replace(/_/g, " ")} />)}</Stack> : "—"],
        ["Store", user.store?.name ?? "All stores"],
        ["Created by", creator],
        ["Created", created],
    ];

    return (
        <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title={name} />

            <PageBand
                icon={<PeopleAltOutlined />}
                title={name}
                subtitle={`${user.role ?? "No role"} · ${user.store?.name ?? "All stores"}`}
                actions={
                    <>
                        <Button component={Link} href={route("admin.users.index")} size="small" variant="contained" disableElevation startIcon={<ArrowBackIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                            All users
                        </Button>
                        <Button component={Link} href={route("admin.users.edit", user.id)} size="small" variant="contained" disableElevation startIcon={<EditIcon />} sx={{ bgcolor: "background.paper", color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: "background.paper" } }}>
                            Edit
                        </Button>
                    </>
                }
            />

            <FigureRow>
                <FigureTile label="Role" value={user.role ?? "—"} tone="primary" hint={alsoRoles.length ? `+ ${alsoRoles.length} more` : undefined} />
                <FigureTile label="Store" value={user.store?.name ?? "All stores"} />
                <FigureTile label="Created by" value={creator} />
                <FigureTile label="Created" value={user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { timeZone: shopZone() }) : "—"} />
            </FigureRow>

            <Paper elevation={0} sx={{ ...densePanelSx, maxWidth: 720 }}>
                <PanelHead icon={<BadgeOutlined sx={{ fontSize: 16, color: "primary.main" }} />} title="Profile" />
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                    <UserAvatar name={name} role={user.role_keys?.[0] ?? (user.role ?? "").toLowerCase().replace(/ /g, "_")} size={48} />
                    <Box>
                        <Typography sx={{ fontWeight: 800 }}>{name}</Typography>
                        <Typography sx={tinySx}>{user.email}</Typography>
                    </Box>
                </Stack>
                <Stack spacing={0.75} divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
                    {rows.map(([label, value]) => (
                        <Stack key={label} direction="row" justifyContent="space-between" spacing={2} sx={{ pt: 0.75 }}>
                            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{label}</Typography>
                            <Box sx={{ textAlign: "right", fontWeight: 600, fontSize: "0.8125rem" }}>{value}</Box>
                        </Stack>
                    ))}
                </Stack>
            </Paper>
        </Box>
    );
}

ShowUser.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
