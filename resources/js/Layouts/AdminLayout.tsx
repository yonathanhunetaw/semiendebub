import React, { useState } from "react";
import { Box, CssBaseline, Toolbar, useTheme } from "@mui/material";
import { Head } from "@inertiajs/react";
import { subdomainConfigs, SubdomainType } from "@/theme";

// Updated paths to match your new modular folder structure
import AdminNav from "@/Components/Navigation/Admin/AdminNav";
import AdminSidebar from "@/Components/Navigation/Admin/AdminSidebar";

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
    const theme = useTheme();

    // --- 1. SUBDOMAIN & IDENTITY DETECTION ---
    // Extract the subdomain (e.g., 'admin' from 'admin.duka.test')
    const host =
        typeof window !== "undefined"
            ? window.location.hostname.split(".")[0].toLowerCase()
            : "admin";

    // Safety check to ensure we have a valid config, otherwise fallback to admin
    const isKnownSubdomain = host in subdomainConfigs;
    const activeKey: SubdomainType = isKnownSubdomain
        ? (host as SubdomainType)
        : "admin";
    const config = subdomainConfigs[activeKey];

    return (
        <Box
            sx={{
                display: "flex",
                bgcolor: "background.default",
                minHeight: "100vh",
                // Ensures smooth transitions if you toggle themes
                transition: theme.transitions.create(["background-color"], {
                    duration: theme.transitions.duration.standard,
                }),
            }}
        >
            <CssBaseline />

            {/* --- 2. DYNAMIC BROWSER TAB (The "Clear Tab" Goal) --- */}
            <Head>
                {/* Sets the Tab Title: e.g., "Admin | Duka" */}
                <title>{`${config.label} | Duka`}</title>

                {/* DYNAMIC SVG FAVICON:
                  - Uses the Brand Color from theme.ts
                  - Renders the first letter of the subdomain (e.g., "A" for Admin)
                */}
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22>
                        <rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(theme.palette.primary.main)}%22/>
                        <text
                            y=%2255%22
                            x=%2210%22
                            font-size=%2255%22
                            fill=%22white%22
                            font-family=%22sans-serif%22
                            font-weight=%22900%22
                            text-anchor=%22start%22
                        >
                            ${config.label.charAt(0)}
                        </text>
                    </svg>`}
                />
            </Head>

            {/* --- 3. TOP NAVIGATION BAR --- */}
            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

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
                }}
            >
                {/* This Toolbar acts as a spacer.
                  Since the AppBar is 'fixed', this prevents content from sliding under it.
                */}
                <Toolbar />

                <Box
                    sx={{
                        p: { xs: 2, sm: 3 }, // Responsive padding
                        flexGrow: 1,
                    }}
                >
                    {children}
                </Box>

                {/* Optional: You can put a Footer here later */}
            </Box>
        </Box>
    );
}
