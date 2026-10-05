import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import { Head } from '@inertiajs/react';
import { getRole, useRole } from '@/theme';
import AdminNav from '@/Components/Navigation/Admin/AdminNav'; // Reusing AdminNav or create SharedNav
import SharedSidebar from '@/Components/Navigation/Shared/SharedSidebar';

export default function SharedLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const config = getRole(useRole());

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Duka`}</title>
            </Head>

            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <SharedSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />
                <SharedSidebar variant="permanent" open={true} sx={{ display: { xs: 'none', xl: 'block' } }} />
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { xl: `calc(100% - 260px)` } }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
