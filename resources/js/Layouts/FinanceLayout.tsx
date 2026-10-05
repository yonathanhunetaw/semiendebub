import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import { Head } from '@inertiajs/react';
import { getRole, useRole, useRoleFavicon } from '@/theme';
import AdminNav from '@/Components/Navigation/Admin/AdminNav';
import FinanceSidebar from '@/Components/Navigation/Finance/FinanceSidebar';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const config = getRole(useRole());
    const favicon = useRoleFavicon();

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Finance`}</title>
                <link
                    rel="icon"
                    href={favicon}
                />
            </Head>

            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <FinanceSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />
                <FinanceSidebar variant="permanent" open={true} sx={{ display: { xs: 'none', xl: 'block' } }} />
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { xl: `calc(100% - 260px)` } }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
