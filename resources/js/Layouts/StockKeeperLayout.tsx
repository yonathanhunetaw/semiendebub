import StockKeeperSidebar from "@/Components/Navigation/StockKeeper/StockKeeperSidebar";
import GuideButton from "@/Components/Guide/GuideButton";
import AdminNav from "@/Components/Navigation/Admin/AdminNav";
import { getRole, useRole } from "@/theme";
import { Head } from "@inertiajs/react";
import { Box, CssBaseline, Toolbar } from "@mui/material";
import React, { useState } from "react";

export default function StockKeeperLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const config = getRole(useRole());

    return (
        <Box sx={{ display: "flex", bgcolor: "background.default", minHeight: "100vh" }}>
            <CssBaseline />
            <Head>
                <title>{`${config.label} | StockKeeper`}</title>
            </Head>

            <AdminNav onMenuClick={() => setMobileOpen(!mobileOpen)} />

            <Box component="nav" sx={{ width: { xl: 260 }, flexShrink: { xl: 0 } }}>
                <StockKeeperSidebar
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    sx={{ display: { xs: "block", xl: "none" } }}
                />
                <StockKeeperSidebar
                    variant="permanent"
                    open={true}
                    onClose={() => {}}
                    sx={{ display: { xs: "none", xl: "block" } }}
                />
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { xl: `calc(100% - 260px)` } }}>
                <Toolbar />
                {children}
                {/* The page's step in the guide (Components/Guide). */}
                <GuideButton app="stock_keeper" variant="fab" />
            </Box>
        </Box>
    );
}
