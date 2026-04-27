// resources/js/Components/Admin/AdminLayout.tsx
import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import AdminNav from '../Components/Navigation/Admin/AdminNav';
import AdminSidebar from '../Components/Navigation/Admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);

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
                <Box sx={{ p: 3 }}> {/* This is the only padding container you need */}
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
