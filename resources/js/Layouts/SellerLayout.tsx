import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import { Head, usePage } from "@inertiajs/react";
import { Alert, Box, CssBaseline, useTheme } from "@mui/material";
import React from "react";

export default function SellerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const theme = useTheme();
    const { flash } = usePage().props as {
        flash?: { success?: string; error?: string };
    };

    // This dynamically pulls '#7c3aed' (Purple) from your theme.ts!
    const brandColor = theme.palette.primary.main;

    return (
        <Box
            sx={{
                minHeight: "100vh",
                // Uses your theme's default background (#0f172a in dark mode)
                bgcolor: "background.default",
                color: "text.primary",
                fontFamily: "Figtree, sans-serif",
                // Replaces the hardcoded orange glow with a dynamic brand-colored glow
                backgroundImage: `radial-gradient(circle at top, ${brandColor}25, transparent 32%)`,
            }}
        >
            <CssBaseline />
            <Head>
                <title>Seller | Duka</title>
                {/* Dynamically uses the purple brand color for the favicon */}
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(brandColor)}%22/><text y=%2258%22 x=%2223%22 font-size=%2250%22 fill=%22white%22 font-family=%22sans-serif%22 font-weight=%22900%22>S</text></svg>`}
                />
            </Head>

            <Box
                sx={{
                    width: "min(100%, 480px)",
                    mx: "auto",
                    minHeight: "100vh",
                    position: "relative",
                    pb: "calc(96px + env(safe-area-inset-bottom))",
                    // Removed the hardcoded light rgba background here
                    bgcolor: "transparent",
                    boxShadow: {
                        md: "0 28px 80px rgba(0, 0, 0, 0.4)",
                    },
                }}
            >
                {flash?.success && (
                    <Alert
                        severity="success"
                        sx={{ m: 2, mb: 0, borderRadius: 3 }}
                    >
                        {flash.success}
                    </Alert>
                )}
                {flash?.error && (
                    <Alert
                        severity="error"
                        sx={{ m: 2, mb: 0, borderRadius: 3 }}
                    >
                        {flash.error}
                    </Alert>
                )}

                <Box
                    component="main"
                    sx={{ minHeight: "100vh", width: "100%" }}
                >
                    {children}
                </Box>
            </Box>

            <Box
                sx={{
                    position: "fixed",
                    left: "50%",
                    bottom: 0,
                    transform: "translateX(-50%)",
                    width: "min(100%, 480px)",
                    px: 2,
                    pb: "calc(12px + env(safe-area-inset-bottom))",
                    pointerEvents: "none",
                    zIndex: 50,
                }}
            >
                <Box
                    sx={{
                        pointerEvents: "auto",
                        "& .MuiBottomNavigation-root": {
                            bgcolor: "primary.main", // This turns Orange (#c2410c)
                            borderRadius: 4,
                            height: 70,
                        },
                        // Force ALL text/icons inside the Orange bar to be BLACK
                        "& .MuiBottomNavigationAction-label": {
                            color: "#000000 !important",
                            fontWeight: 600,
                            opacity: 0.8,
                        },
                        "& .Mui-selected .MuiBottomNavigationAction-label": {
                            color: "#000000 !important",
                            fontWeight: 900,
                            opacity: 1,
                        },
                        "& .MuiSvgIcon-root": {
                            color: "#000000 !important",
                            opacity: 0.8,
                        },
                        "& .Mui-selected .MuiSvgIcon-root": {
                            color: "#000000 !important",
                            opacity: 1,
                        },
                    }}
                >
                    <SellerBottomNav />
                </Box>
            </Box>
        </Box>
    );
}
