import React, { useState } from "react";
import {
    Box,
    CssBaseline,
    AppBar,
    Toolbar,
    Typography,
    useTheme,
} from "@mui/material";
import AdminSidebar from "@/Components/Admin/AdminSidebar";
import { Link, Head } from "@inertiajs/react";
import { subdomainConfigs, SubdomainType } from "@/theme";
import * as LucideIcons from "lucide-react";
import { LucideIcon } from "lucide-react";

interface Props {
    header?: React.ReactNode;
    children: React.ReactNode;
}

export default function AdminLayout({ header, children }: Props) {
    const theme = useTheme();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Dynamic Subdomain Detection with TS Safety
    const host = window.location.hostname.split(".")[0].toLowerCase();
    const isKnownSubdomain = host in subdomainConfigs;
    const activeKey: SubdomainType = isKnownSubdomain
        ? (host as SubdomainType)
        : "admin";
    const config = subdomainConfigs[activeKey];

    return (
        <Box
            sx={{
                display: "flex",
                minHeight: "100vh",
                bgcolor: "background.default",
            }}
        >
            <CssBaseline />

            {/* 1. DYNAMIC BROWSER TAB (The "Clear Tab" Goal) */}
            <Head>
                <title>{`${config.label} | Duka`}</title>
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(theme.palette.primary.main)}%22/><text y=%22.9em%22 font-size=%2270%22 x=%2215%22 fill=%22white%22 font-family=%22sans-serif%22 font-weight=%22bold%22>${config.label.charAt(0)}</text></svg>`}
                />
            </Head>

            {/* 2. DYNAMIC NAVIGATION BAR */}
            <AppBar
                position="fixed"
                elevation={0}
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    bgcolor: "primary.main",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Toolbar>
                    <Box
                        component={Link}
                        href="/"
                        sx={{
                            textDecoration: "none",
                            color: "primary.contrastText",
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                        }}
                    >
                        {/* --- THE FIX --- */}
                        {(() => {
                            // 1. Get the name, providing a fallback string if it's missing
                            const iconName = config.icon || "Shield";

                            // 2. Cast to any then to LucideIcon to satisfy the JSX checker
                            const Icon = (LucideIcons as any)[
                                iconName
                            ] as LucideIcons.LucideIcon;

                            // 3. Return the component
                            return Icon ? (
                                <Icon size={24} strokeWidth={2.5} />
                            ) : (
                                <LucideIcons.Shield
                                    size={24}
                                    strokeWidth={2.5}
                                />
                            );
                        })()}

                        <Typography variant="h6" fontWeight="bold">
                            Mezgebe Dirijit — {config.label}
                        </Typography>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* 3. SIDEBAR */}
            <AdminSidebar
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                variant="permanent"
            />

            {/* 4. MAIN CONTENT AREA */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    width: { xl: `calc(100% - 260px)` },
                    mt: 8, // Offsets the fixed AppBar
                }}
            >
                {header && (
                    <Box
                        sx={{
                            mb: 3,
                            p: 2,
                            bgcolor: "background.paper",
                            borderRadius: 2,
                            boxShadow: 1,
                        }}
                    >
                        {header}
                    </Box>
                )}

                <Box
                    sx={{
                        p: 3,
                        bgcolor: "background.paper",
                        borderRadius: 2,
                        boxShadow: 1,
                    }}
                >
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
