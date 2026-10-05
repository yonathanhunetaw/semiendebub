import React, { useState } from "react";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import {
    Box,
    Button,
    CssBaseline,
    Menu,
    MenuItem,
    Toolbar,
    useTheme,
} from "@mui/material";
import { Head } from "@inertiajs/react";
import { FONT_SANS, getRole, roleUrl, useRole, useRoleFavicon } from "@/theme";

// Updated paths to match your new modular folder structure
import AdminNav from "@/Components/Navigation/Admin/AdminNav";
import AdminSidebar from "@/Components/Navigation/Admin/AdminSidebar";
// import DatabaseNodeBadge from "@/Components/DatabaseNodeBadge";

interface Props {
    children: React.ReactNode;
}

/**
 * AdminLayout
 * * This is the persistent layout for the Admin subdomain.
 * It handles:
 * 1. Dynamic Browser Tab Icons (Favicons) per subdomain color.
 * 2. The Fixed Navigation Bar.
 * 3. The Sidebar (Permanent on Desktop, Temporary on Mobile).
 */
export default function AdminLayout({ children }: Props) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(
        null,
    );
    const theme = useTheme();

    // --- 1. ROLE (from the hostname, resolved once in app.tsx) ---
    const config = getRole(useRole());
    const favicon = useRoleFavicon();

    const roleSwitcher = (
        <>
            <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={<SwapHorizRoundedIcon />}
                onClick={(event) => setRoleMenuAnchor(event.currentTarget)}
                sx={{
                    borderRadius: 3,
                    textTransform: "none",
                    fontWeight: 700,
                    fontFamily: FONT_SANS,
                    display: { xs: "none", sm: "inline-flex" },
                }}
            >
                Role Switcher
            </Button>
            <Menu
                anchorEl={roleMenuAnchor}
                open={Boolean(roleMenuAnchor)}
                onClose={() => setRoleMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
            >
                <MenuItem
                    component="a"
                    href={roleUrl("finance", "/dashboard")}
                    onClick={() => setRoleMenuAnchor(null)}
                >
                    Finance
                </MenuItem>
                <MenuItem
                    component="a"
                    href={roleUrl("procurement", "/dashboard")}
                    onClick={() => setRoleMenuAnchor(null)}
                >
                    Procurement
                </MenuItem>
                <MenuItem
                    component="a"
                    href={roleUrl("stock_keeper", "/dashboard")}
                    onClick={() => setRoleMenuAnchor(null)}
                >
                    StockKeeper
                </MenuItem>
            </Menu>
        </>
    );

    return (
        <Box
            sx={{
                display: "flex",
                bgcolor: "background.default",
                minHeight: "100vh",
                maxWidth: "100%",
                // `clip`, not `hidden`: overflow-x:hidden forces overflow-y to
                // auto, which would turn this box into a vertical scroll
                // container and nest a second scrollbar inside the page.
                overflowX: "clip",
                // Ensures smooth transitions if you toggle themes
                transition: theme.transitions.create(["background-color"], {
                    duration: theme.transitions.duration.standard,
                }),
            }}
        >
            <CssBaseline />

            {/* --- 2. DYNAMIC BROWSER TAB (The "Clear Tab" Goal) --- */}
            <Head>
                {/* Tab title, e.g. "Admin | Duka" */}
                <title>{`${config.label} | Duka`}</title>

                {/* Role-colored favicon with the role's first letter. */}
                <link rel="icon" href={favicon} />
            </Head>

            {/* --- 3. TOP NAVIGATION BAR --- */}
            <AdminNav
                onMenuClick={() => setMobileOpen(!mobileOpen)}
                toolbarActions={roleSwitcher}
            />

            {/* --- 4. SIDEBAR NAVIGATION --- */}
            <Box
                component="nav"
                sx={{
                    width: { xl: 260 },
                    flexShrink: { xl: 0 },
                }}
            >
                {/* Mobile Drawer (Temporary) */}
                <AdminSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{
                        display: { xs: "block", xl: "none" },
                        "& .MuiDrawer-paper": {
                            boxSizing: "border-box",
                            width: 260,
                        },
                    }}
                />

                {/* Desktop Sidebar (Permanent) */}
                <AdminSidebar
                    variant="permanent"
                    open={true}
                    onClose={() => {}}
                    sx={{
                        display: { xs: "none", xl: "block" },
                        "& .MuiDrawer-paper": {
                            boxSizing: "border-box",
                            width: 260,
                            borderRight: "1px solid",
                            borderColor: "divider",
                        },
                    }}
                />
            </Box>

            {/* --- 5. MAIN CONTENT AREA --- */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    bgcolor: "background.default",
                    minHeight: "100vh",
                    // Subtract sidebar width on large screens
                    width: { xl: `calc(100% - 260px)` },
                    display: "flex",
                    flexDirection: "column",
                    /*
                     * A flex item defaults to `min-width: auto`, so this box
                     * refused to shrink below the widest thing inside it and
                     * grew past the viewport instead — which is why admin
                     * pages had to be pinch-zoomed out on a phone before they
                     * fitted. `minWidth: 0` lets the content wrap or scroll in
                     * its own right.
                     */
                    minWidth: 0,
                }}
            >
                {/* This Toolbar acts as a spacer.
                  Since the AppBar is 'fixed', this prevents content from sliding under it.
                */}
                <Toolbar />

                {/*
                 * One gutter, and a narrow one on a phone. Pages add their own
                 * padding on top of this, so 16px here became a 28px gutter on
                 * each side and cost a 390px screen a seventh of its width.
                 */}
                <Box
                    sx={{
                        px: { xs: 1, sm: 3 },
                        py: { xs: 1.5, sm: 3 },
                        flexGrow: 1,
                        minWidth: 0,
                    }}
                >
                    {children}
                </Box>

                {/* <DatabaseNodeBadge variant="footer" /> */}
            </Box>
        </Box>
    );
}
