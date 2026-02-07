// resources/js/Components/Admin/AdminLayout.tsx
import React, { useState } from 'react'; // <--- Make sure useState is inside the curly braces
import { Box, CssBaseline, Toolbar } from '@mui/material';
import AdminNav from './AdminNav';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                {/* Mobile Sidebar */}
                <AdminSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: 'block', xl: 'none' } }}
                />

                {/* Desktop Sidebar */}
                <AdminSidebar
                    variant="permanent"
                    open={true} // Fixed: gave it a boolean value
                    onClose={() => {}} // Fixed: Added dummy function because it's required in the type
                    sx={{ display: { xs: 'none', xl: 'block' } }}
                />
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { xl: `calc(100% - 260px)` } }}>
                <Toolbar />
                <Box sx={{ border: '2px dashed #e0e0e0', borderRadius: 2, p: 2, minHeight: '80vh' }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
