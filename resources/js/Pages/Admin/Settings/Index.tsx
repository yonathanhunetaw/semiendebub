import * as React from "react";
import { PageBand } from "@/Components/Admin/adminUi";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Card,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import AutoStories from "@mui/icons-material/AutoStories";
import ChevronRight from "@mui/icons-material/ChevronRight";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import PersonOutline from "@mui/icons-material/PersonOutline";
import SettingsBrightness from "@mui/icons-material/SettingsBrightness";
import { ThemeContext } from '@/theme/ThemeContext';
import { useAdminScope } from "@/Components/Navigation/Admin/useAdminScope";
import StoreScopeSelect from "@/Components/Navigation/Admin/StoreScopeSelect";
import { useRole } from "@/theme";

type ThemeSetting = "light" | "dark" | "system";

const cardSx = { borderRadius: 2, border: "1px solid", borderColor: "divider", boxShadow: "none" } as const;

/**
 * Settings: appearance and who you are in the admin app. Users, vendors,
 * sessions, system status and Import / Export are the tabs above (global
 * admins only); stores, warehouses, fleet and items are in the sidebar's
 * global zone. A store's own setup lives on its Store page, under Setup.
 */
export default function SettingsIndex() {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (newMode: ThemeSetting) => void;
        currentSetting: ThemeSetting;
    };
    const { isGlobalAdmin, activeStore, accessibleStores, canSwitch, roleKey } = useAdminScope();
    const role = useRole();

    return (
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
            <Head title="Settings" />

            <Box sx={{ mb: 1.5 }}>
                <PageBand icon={<SettingsOutlined />} title="Settings" subtitle="Appearance, your access, and the screens that configure Mezgebe Dirijit." />
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
                <Card sx={{ ...cardSx, p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography sx={{ fontWeight: 800 }}>Your access &amp; store</Typography>
                    <Typography variant="body2">
                        {isGlobalAdmin
                            ? "Global admin: every store, plus users, sessions and the global zone."
                            : `Store admin: ${accessibleStores.map((store) => store.name).join(", ") || "no store assigned"}.`}
                    </Typography>
                    {/* The store the admin app looks at. A global admin (or an admin of
                        several stores) picks it here; one store has nothing to pick. */}
                    {canSwitch ? (
                        <Box sx={{ mx: -2 }}>
                            <StoreScopeSelect />
                        </Box>
                    ) : (
                        <Typography variant="caption" color="text.secondary">
                            Your store: {activeStore.name}
                        </Typography>
                    )}
                    <Box>
                        <ListItemButton component={Link} href={route("admin.guide")} sx={{ borderRadius: 2, px: 1, mx: -1 }}>
                            <ListItemIcon sx={{ minWidth: 36 }}><AutoStories sx={{ color: "primary.main" }} /></ListItemIcon>
                            <ListItemText primary="How Duka works" secondary="The people, the order's road and how stock moves" slotProps={{ primary: { sx: { fontWeight: 700, fontSize: "0.9rem" } } }} />
                            <ChevronRight sx={{ color: "text.disabled" }} />
                        </ListItemButton>
                        <ListItemButton component={Link} href="/profile" sx={{ borderRadius: 2, px: 1, mx: -1 }}>
                            <ListItemIcon sx={{ minWidth: 36 }}><PersonOutline sx={{ color: "primary.main" }} /></ListItemIcon>
                            <ListItemText primary="Profile" secondary="Your name, email and password" slotProps={{ primary: { sx: { fontWeight: 700, fontSize: "0.9rem" } } }} />
                            <ChevronRight sx={{ color: "text.disabled" }} />
                        </ListItemButton>
                    </Box>
                </Card>

                <Card sx={{ ...cardSx, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Box>
                        <Typography sx={{ fontWeight: 800 }}>Appearance</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Also in your profile menu. System follows your device.
                        </Typography>
                    </Box>
                    <ToggleButtonGroup
                        exclusive
                        fullWidth
                        size="small"
                        value={currentSetting}
                        onChange={(_, value: ThemeSetting | null) => value && toggleTheme(value)}
                        aria-label="Theme"
                    >
                        <ToggleButton value="light"><LightModeRounded fontSize="small" sx={{ mr: 0.75 }} />Light</ToggleButton>
                        <ToggleButton value="dark"><DarkModeRounded fontSize="small" sx={{ mr: 0.75 }} />Dark</ToggleButton>
                        <ToggleButton value="system"><SettingsBrightness fontSize="small" sx={{ mr: 0.75 }} />System</ToggleButton>
                    </ToggleButtonGroup>
                </Card>

            </Box>
        </Box>
    );
}

SettingsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
