import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import { Head } from '@inertiajs/react';
import { getRole, useRole } from '@/theme';
import AdminNav from '@/Components/Navigation/Admin/AdminNav';
import MarketingSidebar from '@/Components/Navigation/Marketing/MarketingSidebar';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const config = getRole(useRole());

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Marketing`}</title>
            </Head>

            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <MarketingSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />
                <MarketingSidebar variant="permanent" open={true} sx={{ display: { xs: 'none', xl: 'block' } }} />
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { xl: `calc(100% - 260px)` } }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
