import AdminNav from "@/Components/Navigation/Admin/AdminNav";
import VendorSidebar from "@/Components/Navigation/Vendor/VendorSidebar";
import { getRole, useRole } from "@/theme";
import { Head } from "@inertiajs/react";
import { Box, CssBaseline, Toolbar } from "@mui/material";
import React, { useState } from "react";

/**
 * Shell for the supplier console.
 *
 * Mirrors StockKeeperLayout — the Vendor module previously had no layout at
 * all and its one page borrowed AdminLayout, which showed admin navigation to
 * suppliers.
 */
export default function VendorLayout({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const [mobileOpen, setMobileOpen] = useState(false);
    const config = getRole(useRole());

    return (
        <Box
            sx={{ display: "flex", bgcolor: "background.default", minHeight: "100vh" }}
        >
            <CssBaseline />
            <Head>
                <title>{`${config.label} | Vendor`}</title>
            </Head>

            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <VendorSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: "block", xl: "none" } }}
                />
                <VendorSidebar
                    variant="permanent"
                    open
                    onClose={() => {}}
                    sx={{ display: { xs: "none", xl: "block" } }}
                />
            </Box>

            <Box
                component="main"
                sx={{ flexGrow: 1, p: 3, width: { xl: "calc(100% - 260px)" } }}
            >
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
