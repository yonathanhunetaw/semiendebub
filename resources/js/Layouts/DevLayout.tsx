import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar, useTheme, Typography, Breadcrumbs, Link as MuiLink } from '@mui/material';
import { Head, Link } from '@inertiajs/react';
import { subdomainConfigs, SubdomainType } from '@/theme';
// Import dedicated Dev components instead of Admin ones
import DevNav from '@/Components/Navigation/Dev/DevNav';
import DevSidebar from '@/Components/Navigation/Dev/DevSidebar';

export default function DevLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const theme = useTheme();

    // Subdomain Detection Logic
    const hostParts = window.location.hostname.split('.');
    const detected = hostParts.length > 2 ? hostParts[0].toLowerCase() : 'dev';
    const activeKey: SubdomainType = (detected in subdomainConfigs) ? (detected as SubdomainType) : 'dev';
    const config = subdomainConfigs[activeKey];

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />

            <Head>
                <title>{`${config.label} | Workspace`}</title>
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(theme.palette.primary.main)}%22/><text y=%2255%22 x=%2210%22 font-size=%2255%22 fill=%22white%22 font-family=%22monospace%22 font-weight=%22900%22 text-anchor=%22start%22>${config.label.charAt(0)}</text></svg>`}
                />
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
                    backgroundImage: theme.palette.mode === 'dark'
                        ? 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 0)'
                        : 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                }}
            >
                <Toolbar />

                <Box sx={{ mb: 4 }}>
                    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1, fontSize: '0.75rem' }}>
                        <MuiLink component={Link} underline="hover" color="inherit" href="/dev/dashboard">
                            Dev
                        </MuiLink>
                        <Typography color="text.primary" sx={{ fontSize: '0.75rem' }}>Workspace</Typography>
                    </Breadcrumbs>
                    <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                        &gt; _terminal
                    </Typography>
                </Box>

                <Box sx={{ position: 'relative' }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
