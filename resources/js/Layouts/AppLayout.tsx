// resources/js/Components/Admin/AdminLayout.tsx
import React, { useState } from 'react';
import { Box, Breadcrumbs, CssBaseline, Link as MuiLink, Toolbar, Typography } from '@mui/material';
import { Link } from '@inertiajs/react';
import AdminNav from '../Components/Navigation/Admin/AdminNav';
import AdminSidebar from '../Components/Navigation/Admin/AdminSidebar';

const breadcrumbLabelMap: Record<string, string> = {
    dashboard: 'Dashboard',
    items: 'Items',
    create: 'Create',
    edit: 'Edit',
    inventory: 'Inventory',
    stores: 'Stores',
    users: 'Users',
    settings: 'Settings',
    sessions: 'Sessions',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathSegments =
        typeof window !== 'undefined'
            ? window.location.pathname.split('/').filter(Boolean)
            : [];

    const breadcrumbSegments = pathSegments.map((segment, index) => {
        const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
        const label = breadcrumbLabelMap[segment] ?? segment.replace(/[-_]/g, ' ');

        return {
            href,
            label: label.charAt(0).toUpperCase() + label.slice(1),
            isLast: index === pathSegments.length - 1,
        };
    });

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <AdminSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />
                <AdminSidebar
                    variant="permanent"
                    open={true}
                    onClose={() => {}}
                    sx={{ display: { xs: 'none', xl: 'block' } }}
                />
            </Box>

            {/* MAIN CONTENT AREA */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    bgcolor: 'background.default',
                    minHeight: '100vh',
                    width: { xl: `calc(100% - 260px)` }
                }}
            >
                <Toolbar /> {/* This offsets the fixed AppBar */}
                <Box sx={{ p: { xs: 2, sm: 3 } }}> {/* This is the only padding container you need */}
                    <Box sx={{ mb: 2 }}>
                        <Breadcrumbs aria-label="breadcrumb" sx={{ fontSize: '0.8rem' }}>
                            <MuiLink
                                component={Link}
                                underline="hover"
                                color="inherit"
                                href={route('admin.dashboard')}
                            >
                                Admin
                            </MuiLink>
                            {breadcrumbSegments.map((segment) =>
                                segment.isLast ? (
                                    <Typography key={segment.href} color="text.primary" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                        {segment.label}
                                    </Typography>
                                ) : (
                                    <MuiLink
                                        key={segment.href}
                                        component={Link}
                                        underline="hover"
                                        color="inherit"
                                        href={segment.href}
                                        sx={{ fontSize: '0.8rem' }}
                                    >
                                        {segment.label}
                                    </MuiLink>
                                )
                            )}
                        </Breadcrumbs>
                    </Box>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
