import React, { useContext, useMemo, useState } from "react";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import Logout from "@mui/icons-material/Logout";
import PersonOutline from "@mui/icons-material/PersonOutline";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import CalendarTodayOutlined from "@mui/icons-material/CalendarTodayOutlined";
import Hub from "@mui/icons-material/Hub";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import MenuIcon from "@mui/icons-material/Menu";
import { Link, router, usePage } from "@inertiajs/react";
import { AppBar, Box, ButtonBase, Dialog, Divider, IconButton, ListItemIcon, Menu, MenuItem, Switch, Toolbar, Tooltip, Typography, useTheme } from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { ThemeContext } from "@/app";
import type { RoleKey } from "@/theme";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import NotificationsBell from "./NotificationsBell";
import QuickSearch from "./QuickSearch";
import RoleSwitcher from "./RoleSwitcher";
import { useAdminScope } from "./useAdminScope";
import type { AdminScopeProps } from "@/types/adminScope";

/** What the user block calls this person. */
function roleLabel(roleKey: string, isGlobalAdmin: boolean, display: string): string {
    if (roleKey === "admin") {
        return isGlobalAdmin ? "Global admin" : "Store admin";
    }

    return display || "Staff";
}

/**
 * The admin top bar (64px, full width above the sidebar): menu toggle, brand,
 * quick search, Role Switcher, today's date, notifications, and the account.
 */
export default function AdminTopBar({ onMenuClick, current }: { onMenuClick: () => void; current: RoleKey }) {
    const { props } = usePage<AdminScopeProps & Record<string, unknown>>();
    const user = props.auth?.user;
    const { isGlobalAdmin, roleKey, activeStore } = useAdminScope();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const { toggleTheme } = useContext(ThemeContext);
    const mode = useTheme().palette.mode;

    const today = useMemo(
        () => new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "long", year: "numeric" }).format(new Date()),
        [],
    );

    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "User";
    const label = roleLabel(roleKey, isGlobalAdmin, user?.role ?? "");

    return (
        <AppBar
            position="fixed"
            color="inherit"
            elevation={0}
            sx={(theme) => ({
                // Above the permanent sidebar on desktop; below lg the sidebar
                // is a slide-in drawer, which must cover the bar instead.
                zIndex: theme.zIndex.appBar,
                [theme.breakpoints.up("lg")]: { zIndex: theme.zIndex.drawer + 1 },
                bgcolor: "background.paper",
                color: "text.primary",
                borderBottom: "1px solid",
                borderColor: "divider",
            })}
        >
            <Toolbar sx={{ minHeight: { xs: 64 }, gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 2 } }}>
                <IconButton onClick={onMenuClick} edge="start" aria-label="Open navigation" sx={{ display: { lg: "none" } }}>
                    <MenuIcon />
                </IconButton>

                <Box
                    component={Link}
                    href={route("admin.dashboard")}
                    sx={{ display: "flex", alignItems: "center", gap: 1.25, textDecoration: "none", color: "inherit", flexShrink: 0, width: { lg: 232 } }}
                >
                    <Box
                        sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 2,
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            display: "grid",
                            placeItems: "center",
                        }}
                    >
                        <Hub fontSize="small" />
                    </Box>
                    <Typography noWrap sx={{ fontWeight: 800, fontSize: "1.0625rem", display: { xs: "none", sm: "block" } }}>
                        Mezgebe Dirijit
                    </Typography>
                </Box>

                <Box sx={{ flexGrow: 1, display: { xs: "none", md: "flex" }, justifyContent: "center", minWidth: 0 }}>
                    <QuickSearch />
                </Box>
                <Box sx={{ flexGrow: 1, display: { xs: "block", md: "none" } }} />
                {/* Below md the search opens in a dialog. */}
                <Tooltip title="Search">
                    <IconButton onClick={() => setSearchOpen(true)} aria-label="Search" sx={{ display: { xs: "inline-flex", md: "none" } }}>
                        <SearchRounded />
                    </IconButton>
                </Tooltip>

                <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    <RoleSwitcher roleKey={roleKey} current={current} />
                </Box>

                <Box
                    sx={{
                        display: { xs: "none", xl: "flex" },
                        alignItems: "center",
                        gap: 0.75,
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 999,
                        bgcolor: "action.hover",
                        color: "text.secondary",
                        flexShrink: 0,
                    }}
                >
                    <CalendarTodayOutlined sx={{ fontSize: 16 }} />
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap" }}>{today}</Typography>
                </Box>

                <NotificationsBell />

                <ButtonBase
                    onClick={(event) => setAnchor(event.currentTarget)}
                    aria-haspopup="true"
                    aria-controls={anchor ? "admin-account-menu" : undefined}
                    aria-expanded={anchor ? "true" : undefined}
                    sx={{ borderRadius: 999, pl: 0.5, pr: { xs: 0.5, lg: 1 }, py: 0.5, gap: 1, flexShrink: 0 }}
                >
                    {/* The role's character (see Components/Visual/identities.ts). */}
                    <RoleAvatar role={roleKey} size={36} title={`${label}: ${name}`} />
                    <Box sx={{ display: { xs: "none", lg: "block" }, textAlign: "left", minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "primary.main", textTransform: "uppercase", letterSpacing: 0.6, lineHeight: 1.3 }}>
                            {label}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.3, maxWidth: 160 }}>
                            {name}
                        </Typography>
                    </Box>
                    <KeyboardArrowDown fontSize="small" sx={{ color: "text.secondary", display: { xs: "none", lg: "block" } }} />
                </ButtonBase>
                <Menu
                    id="admin-account-menu"
                    anchorEl={anchor}
                    open={Boolean(anchor)}
                    onClose={() => setAnchor(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    transformOrigin={{ vertical: "top", horizontal: "right" }}
                    slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
                >
                    <Box sx={{ px: 2, py: 1 }}>
                        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "primary.main", textTransform: "uppercase", letterSpacing: 0.6 }}>
                            {label}
                        </Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{name}</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                            {user?.email}
                        </Typography>
                        {activeStore && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                Scope: {activeStore.name}
                            </Typography>
                        )}
                    </Box>
                    {/* The pill is hidden on a phone, so the switcher lives here too. */}
                    <Box sx={{ display: { xs: "block", sm: "none" }, px: 2, pb: 1 }}>
                        <RoleSwitcher roleKey={roleKey} current={current} />
                    </Box>
                    <Divider />
                    <MenuItem component={Link} href="/profile" onClick={() => setAnchor(null)}>
                        <ListItemIcon><PersonOutline fontSize="small" /></ListItemIcon>
                        Profile
                    </MenuItem>
                    {/* A real switch; the menu stays open so the change is seen. */}
                    <MenuItem onClick={() => toggleTheme(mode === "dark" ? "light" : "dark")} sx={{ pr: 1 }}>
                        <ListItemIcon>
                            {mode === "dark" ? <DarkModeRounded fontSize="small" /> : <LightModeRounded fontSize="small" />}
                        </ListItemIcon>
                        <Box component="span" sx={{ flexGrow: 1 }}>Dark mode</Box>
                        <Switch
                            size="small"
                            edge="end"
                            checked={mode === "dark"}
                            tabIndex={-1}
                            inputProps={{ "aria-label": "Dark mode" }}
                            sx={{ pointerEvents: "none" }}
                        />
                    </MenuItem>
                    {roleKey === "admin" && (
                        <MenuItem component={Link} href={route("admin.settings")} onClick={() => setAnchor(null)}>
                            <ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>
                            Settings
                        </MenuItem>
                    )}
                    <Divider />
                    <MenuItem
                        onClick={() => {
                            setAnchor(null);
                            router.post("/logout");
                        }}
                    >
                        <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                        Sign out
                    </MenuItem>
                </Menu>
            </Toolbar>

            <Dialog
                open={searchOpen}
                onClose={() => setSearchOpen(false)}
                fullWidth
                maxWidth="sm"
                slotProps={{ paper: { sx: { alignSelf: "flex-start", mt: { xs: 1, sm: 8 }, mx: { xs: 1, sm: 4 }, width: { xs: "calc(100% - 16px)", sm: undefined }, borderRadius: 3 } } }}
            >
                <Box sx={{ p: 1.5 }}>
                    <QuickSearch autoFocus fullWidth onNavigate={() => setSearchOpen(false)} />
                </Box>
            </Dialog>
        </AppBar>
    );
}
