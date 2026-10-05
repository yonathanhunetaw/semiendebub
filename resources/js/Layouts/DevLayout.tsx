import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar, Typography, Breadcrumbs, Link as MuiLink } from '@mui/material';
import { Head, Link, usePage } from '@inertiajs/react';
import { getRole, useRole } from '@/theme';
// Import dedicated Dev components instead of Admin ones
import DevNav from '@/Components/Navigation/Dev/DevNav';
import DevSidebar from '@/Components/Navigation/Dev/DevSidebar';
import { activeDevEntry } from '@/Components/Navigation/Dev/devNavigation';

export default function DevLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { url } = usePage();
    const active = activeDevEntry(url);

    const config = getRole(useRole());

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />

            <Head>
                <title>{`${config.label} | Workspace`}</title>
            </Head>

            {/* Use the dedicated DevNav */}
            <DevNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <DevSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />
                <DevSidebar
                    variant="permanent"
                    open={true}
                    onClose={() => {}}
                    sx={{ display: { xs: 'none', xl: 'block' } }}
                />
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    width: { xl: `calc(100% - 260px)` },
                    // Dot grid in the ink color, so it is dark dots on light and light dots on dark.
                    backgroundImage: 'radial-gradient(rgb(var(--on-surface) / 0.05) 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                }}
            >
                <Toolbar />

                <Box sx={{ mb: 4 }}>
                    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1, fontSize: '0.75rem' }}>
                        <MuiLink component={Link} underline="hover" color="inherit" href="/dashboard">
                            Dev
                        </MuiLink>
                        {active && (
                            <Typography color="inherit" sx={{ fontSize: '0.75rem' }}>
                                {active.group.title}
                            </Typography>
                        )}
                        <Typography color="text.primary" sx={{ fontSize: '0.75rem' }}>
                            {active?.item.label ?? 'Workspace'}
                        </Typography>
                    </Breadcrumbs>
                    <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                        &gt; {active?.item.label ?? '_terminal'}
                    </Typography>
                    {active && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                            {active.item.description}
                        </Typography>
                    )}
                </Box>

                <Box sx={{ position: 'relative' }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
