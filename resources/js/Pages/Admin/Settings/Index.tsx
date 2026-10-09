import * as React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Card,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalance from "@mui/icons-material/AccountBalance";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import AccountTree from "@mui/icons-material/AccountTree";
import AutoStories from "@mui/icons-material/AutoStories";
import AirportShuttle from "@mui/icons-material/AirportShuttle";
import ChevronRight from "@mui/icons-material/ChevronRight";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import Devices from "@mui/icons-material/Devices";
import Layers from "@mui/icons-material/Layers";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import LocalOffer from "@mui/icons-material/LocalOffer";
import ManageAccounts from "@mui/icons-material/ManageAccounts";
import PersonOutline from "@mui/icons-material/PersonOutline";
import SettingsBrightness from "@mui/icons-material/SettingsBrightness";
import Store from "@mui/icons-material/Store";
import Storefront from "@mui/icons-material/Storefront";
import Tune from "@mui/icons-material/Tune";
import Warehouse from "@mui/icons-material/Warehouse";
import { ThemeContext } from "@/app";
import { useAdminScope } from "@/Components/Navigation/Admin/useAdminScope";
import StoreScopeSelect from "@/Components/Navigation/Admin/StoreScopeSelect";

type ThemeSetting = "light" | "dark" | "system";

interface SettingLink {
    icon: SvgIconComponent;
    title: string;
    desc: string;
    href: string;
}

const cardSx = { borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "none" } as const;

function SettingsCard({ title, caption, links }: { title: string; caption?: string; links: SettingLink[] }) {
    return (
        <Card sx={cardSx}>
            <Box sx={{ px: 2, pt: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
                {caption && (
                    <Typography variant="caption" color="text.secondary">
                        {caption}
                    </Typography>
                )}
            </Box>
            <List sx={{ py: 1 }}>
                {links.map((link) => {
                    const Icon = link.icon;

                    return (
                        <ListItemButton key={link.title} component={Link} href={link.href} sx={{ mx: 1, borderRadius: 2 }}>
                            <ListItemIcon sx={{ minWidth: 40 }}>
                                <Icon sx={{ color: "primary.main" }} />
                            </ListItemIcon>
                            <ListItemText
                                primary={link.title}
                                secondary={link.desc}
                                slotProps={{ primary: { sx: { fontWeight: 700, fontSize: "0.9rem" } }, secondary: { sx: { fontSize: "0.8rem" } } }}
                            />
                            <ChevronRight sx={{ color: "text.disabled" }} />
                        </ListItemButton>
                    );
                })}
            </List>
        </Card>
    );
}

/**
 * Settings: appearance, who you are in the admin app, and the screens that
 * configure the system. Users, sessions and the network-wide screens are a
 * global admin's only; a store admin sees what applies to their store.
 */
export default function SettingsIndex() {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (newMode: ThemeSetting) => void;
        currentSetting: ThemeSetting;
    };
    const { isGlobalAdmin, activeStore, accessibleStores, canSwitch } = useAdminScope();

    const storeLinks: SettingLink[] = [
        ...(activeStore.id !== "all"
            ? [{ icon: Storefront, title: "Store page", desc: `${activeStore.name}: items, prices and replenishment`, href: route("store.show", activeStore.id) }]
            : []),
        { icon: AccountTree, title: "Locations", desc: "Shelf, floor and Remote Hub, and who manages each", href: route("admin.inventory.stock-locations.index") },
        { icon: Tune, title: "Capacity", desc: "Min and max levels that drive replenishment", href: route("admin.inventory.capacity.index") },
        { icon: AccountBalance, title: "Payment accounts", desc: "Where customers pay in, and who confirms each", href: route("admin.payment-accounts.index") },
        { icon: AccountBalanceWallet, title: "Seller balances", desc: "What each seller holds and has handed over", href: route("admin.balances.index") },
        { icon: LocalOffer, title: "Customer prices & discounts", desc: "Per-customer prices and when discounts end", href: route("admin.customers.discounts") },
    ];

    const adminLinks: SettingLink[] = [
        { icon: ManageAccounts, title: "Users", desc: "Staff, roles and which store each works at", href: route("admin.users.index") },
        { icon: Devices, title: "Sessions", desc: "Who is signed in, and ending sessions", href: route("admin.sessions.index") },
        { icon: Store, title: "All stores", desc: "Add, rename or close stores", href: route("admin.inventory.stores") },
        { icon: Warehouse, title: "Warehouses", desc: "Main hubs and the stores each serves", href: route("admin.inventory.warehouse.index") },
        { icon: AirportShuttle, title: "Fleet", desc: "Vehicles shared by every store", href: route("admin.inventory.fleet.index") },
        { icon: Layers, title: "Items", desc: "The catalogue every store sells from", href: route("admin.items.index") },
    ];

    return (
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
            <Head title="Settings" />

            <Stack spacing={0.5} sx={{ mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Settings
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Appearance, your access, and the screens that configure Mezgebe Dirijit.
                </Typography>
            </Stack>

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

                <SettingsCard title="Store setup" caption={activeStore.id === "all" ? "Every store" : activeStore.name} links={storeLinks} />
                {isGlobalAdmin && <SettingsCard title="Administration" caption="Global admins only" links={adminLinks} />}
            </Box>
        </Box>
    );
}

SettingsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
