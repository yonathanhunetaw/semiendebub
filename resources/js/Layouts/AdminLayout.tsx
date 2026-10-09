import React, { useEffect, useRef, useState } from "react";
import { Box, Breadcrumbs, CssBaseline, Link as MuiLink, Toolbar, Typography, useTheme } from "@mui/material";
import { Head, Link, usePage } from "@inertiajs/react";
import FlashToast from "@/Components/Shared/FlashToast";
import AdminSidebar, { ADMIN_SIDEBAR_WIDTH } from "@/Components/Navigation/Admin/AdminSidebar";
import AdminTopBar from "@/Components/Navigation/Admin/AdminTopBar";
import SectionTabs from "@/Components/Navigation/Admin/SectionTabs";
import GuideButton from "@/Components/Guide/GuideButton";
import { stackedTableSx, useStackedTableLabels } from "@/Components/Navigation/Admin/stackedTables";
import { arrive, motionSafe } from "@/Components/Visual/motion";
import { getRole, useRole } from "@/theme";

interface Props {
    children: React.ReactNode;
    /** A breadcrumb trail built from the path (the old AppLayout's). */
    breadcrumbs?: boolean;
    /** Flash messages as a toast (the old AppLayout's). */
    flashToast?: boolean;
}

const breadcrumbLabelMap: Record<string, string> = {
    dashboard: "Dashboard",
    items: "Items",
    create: "Create",
    edit: "Edit",
    inventory: "Inventory",
    stores: "Stores",
    users: "Users",
    settings: "Settings",
    sessions: "Sessions",
};

function PathBreadcrumbs() {
    const segments = typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean) : [];

    return (
        <Breadcrumbs aria-label="breadcrumb" sx={{ fontSize: "0.8rem", mb: 2 }}>
            <MuiLink component={Link} underline="hover" color="inherit" href={route("admin.dashboard")}>
                Admin
            </MuiLink>
            {segments.map((segment, index) => {
                const href = `/${segments.slice(0, index + 1).join("/")}`;
                const raw = breadcrumbLabelMap[segment] ?? segment.replace(/[-_]/g, " ");
                const label = raw.charAt(0).toUpperCase() + raw.slice(1);

                return index === segments.length - 1 ? (
                    <Typography key={href} color="text.primary" sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {label}
                    </Typography>
                ) : (
                    <MuiLink key={href} component={Link} underline="hover" color="inherit" href={href} sx={{ fontSize: "0.8rem" }}>
                        {label}
                    </MuiLink>
                );
            })}
        </Breadcrumbs>
    );
}

/**
 * The admin shell: a full-width top bar, the store-scoped sidebar (permanent
 * from lg, a temporary drawer below), and the page. Persistent across visits
 * through the page's `.layout`.
 */
export default function AdminLayout({ children, breadcrumbs = false, flashToast = false }: Props) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { url } = usePage();
    const contentRef = useRef<HTMLDivElement | null>(null);

    // Tables read as labelled cards on phones and tablets (no sideways scroll).
    useStackedTableLabels(contentRef);

    // A visit (a link, or a store picked in the drawer) closes the drawer.
    useEffect(() => setMobileOpen(false), [url]);
    const theme = useTheme();
    const role = useRole();
    const config = getRole(role);

    return (
        <Box
            sx={{
                display: "flex",
                bgcolor: "background.default",
                minHeight: "100vh",
                maxWidth: "100%",
                // `clip`, not `hidden`: overflow-x:hidden forces overflow-y to
                // auto and would nest a second scrollbar inside the page.
                overflowX: "clip",
                transition: theme.transitions.create(["background-color"], { duration: theme.transitions.duration.standard }),
            }}
        >
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Duka`}</title>
            </Head>

            <AdminTopBar onMenuClick={() => setMobileOpen((open) => !open)} current={role} />

            <Box component="nav" sx={{ width: { lg: ADMIN_SIDEBAR_WIDTH }, flexShrink: { lg: 0 } }}>
                <AdminSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: "block", lg: "none" } }}
                />
                <AdminSidebar variant="permanent" open onClose={() => {}} sx={{ display: { xs: "none", lg: "block" } }} />
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    bgcolor: "background.default",
                    minHeight: "100vh",
                    width: { lg: `calc(100% - ${ADMIN_SIDEBAR_WIDTH}px)` },
                    display: "flex",
                    flexDirection: "column",
                    // A flex item defaults to `min-width: auto` and would grow
                    // past the viewport instead of letting content wrap.
                    minWidth: 0,
                }}
            >
                {flashToast && <FlashToast bottomClass="bottom-6" />}
                <Toolbar sx={{ minHeight: { xs: 64 } }} />
                {/* One narrow gutter on a phone; pages add their own padding. */}
                <Box ref={contentRef} sx={(t) => ({ px: { xs: 1, sm: 3 }, py: { xs: 1.5, sm: 3 }, flexGrow: 1, minWidth: 0, ...stackedTableSx(t) })}>
                    {breadcrumbs && <PathBreadcrumbs />}
                    {/* Payments, Customers and Settings group several screens under tabs. */}
                    <SectionTabs />
                    {/* The page's step in the guide, one tap away. */}
                    <GuideButton app="admin" />
                    {/* Keyed by path, so a new page rises in; filters on the same page don't replay it. */}
                    <Box key={url.split("?")[0]} sx={{ animation: `${arrive} .32s ease-out both`, ...motionSafe }}>
                        {children}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
