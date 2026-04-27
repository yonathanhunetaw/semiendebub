import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar, useTheme } from '@mui/material';
import { Head } from '@inertiajs/react';
import { subdomainConfigs, SubdomainType } from '@/theme';
import AdminNav from '@/Components/Navigation/Admin/AdminNav';
import FinanceSidebar from '@/Components/Navigation/Finance/FinanceSidebar';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const theme = useTheme();

    const hostParts = window.location.hostname.split('.');
    const detected = hostParts.length > 2 ? hostParts[0].toLowerCase() : 'finance';
    const activeKey: SubdomainType = (detected in subdomainConfigs) ? (detected as SubdomainType) : 'finance';
    const config = subdomainConfigs[activeKey];

    return (
        <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Finance`}</title>
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(theme.palette.success.main)}%22/><text y=%2255%22 x=%2210%22 font-size=%2255%22 fill=%22white%22 font-family=%22sans-serif%22 font-weight=%22900%22 text-anchor=%22start%22>${config.label.charAt(0)}</text></svg>`}
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
