import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import { Head, usePage } from "@inertiajs/react";
import { Alert, Box, CssBaseline, Snackbar, useTheme } from "@mui/material";
import React from "react";
import { FONT_SANS, useRoleFavicon } from "@/theme";

export default function SellerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const theme = useTheme();
    const { flash } = usePage().props as {
        flash?: { success?: string; error?: string };
    };

    // The seller role's primary (orange), from the theme tokens.
    const brandColor = theme.palette.primary.main;
    const favicon = useRoleFavicon();

    return (
        <Box
            sx={{
                minHeight: "100vh",
                // The `background` token for the current mode.
                bgcolor: "background.default",
                color: "text.primary",
                fontFamily: FONT_SANS,
                // Soft glow in the role color at the top of the page.
                backgroundImage: `radial-gradient(circle at top, ${brandColor}25, transparent 32%)`,
            }}
        >
            <CssBaseline />
            <Head>
                <title>Seller | Duka</title>
                {/* Role-colored favicon with the role's first letter. */}
                <link
                    rel="icon"
                    href={favicon}
                />
            </Head>

            <Box
                sx={{
                    width: "100%",
                    maxWidth: { xs: "480px", sm: "100%", md: "1200px" },
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
                <Snackbar
                    open={!!flash?.success}
                    autoHideDuration={3000}
                    anchorOrigin={{ vertical: "top", horizontal: "center" }}
                    sx={{ mt: 2 }}
                >
                    <Alert severity="success" sx={{ borderRadius: 3, boxShadow: 3 }}>
                        {flash?.success}
                    </Alert>
                </Snackbar>

                <Snackbar
                    open={!!flash?.error}
                    autoHideDuration={4000}
                    anchorOrigin={{ vertical: "top", horizontal: "center" }}
                    sx={{ mt: 2 }}
                >
                    <Alert severity="error" sx={{ borderRadius: 3, boxShadow: 3 }}>
                        {flash?.error}
                    </Alert>
                </Snackbar>

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
                    width: "100%",
                    maxWidth: { xs: "480px", sm: "100%", md: "1200px" },
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
                            bgcolor: "primary.main",
                            borderRadius: 4,
                            height: 70,
                        },
                        // Text and icons on the primary-colored bar use the
                        // on-primary token (contrast-checked per role and mode).
                        "& .MuiBottomNavigationAction-label": {
                            color: "primary.contrastText",
                            fontWeight: 600,
                            opacity: 0.8,
                        },
                        "& .Mui-selected .MuiBottomNavigationAction-label": {
                            color: "primary.contrastText",
                            fontWeight: 900,
                            opacity: 1,
                        },
                        "& .MuiSvgIcon-root": {
                            color: "primary.contrastText",
                            opacity: 0.8,
                        },
                        "& .Mui-selected .MuiSvgIcon-root": {
                            color: "primary.contrastText",
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
