import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import UserBottomNav from "@/Components/Navigation/User/UserBottomNav";
import { Head, usePage } from "@inertiajs/react";
import { Alert, Box, CssBaseline, Snackbar, useTheme } from "@mui/material";
import React from "react";
import { FONT_SANS } from "@/theme";

/**
 * Roles that work *inside* the business and therefore keep the seller
 * workspace's own bottom bar on shared pages.
 *
 * Everyone else — buyers, and any role without a workspace of its own — is a
 * shopper here and gets the buyer bar.
 */
const SELLER_WORKSPACE_ROLES = new Set(["seller"]);

/** Ground tone behind the profile cards; matches theme.ts's dark background. */
const ACCOUNT_SURFACE = "#0f172a";

interface SharedProps {
    auth?: { user?: { role_key?: string | null } | null };
    flash?: { success?: string; error?: string };
}

/**
 * Chrome for pages shared across roles — currently Shared/Profile/Edit, which
 * `/profile` serves to every signed-in account regardless of role.
 *
 * It is SellerLayout's surface (same dark ground, same brand glow, same
 * measure) with one difference that matters: the bottom bar is chosen from the
 * viewer's role rather than hard-coded. The profile page used to mount
 * SellerLayout outright, so a shopper who tapped "Account" in the buyer bar
 * arrived at a page wearing the seller bar — Store / Categories / Carts / More,
 * every one of them a route a buyer is not allowed to open.
 */
export default function AccountLayout({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const theme = useTheme();
    const { auth, flash } = usePage().props as SharedProps;

    const roleKey = auth?.user?.role_key ?? null;
    const isSellerWorkspace = roleKey !== null && SELLER_WORKSPACE_ROLES.has(roleKey);

    const brandColor = theme.palette.primary.main;

    return (
        <Box
            sx={{
                minHeight: "100vh",
                // Pinned dark rather than `background.default`. The profile
                // cards are hard-coded `bg-[#1e293b] text-white`, and the app's
                // theme defaults to light mode (see resources/js/app.tsx), so
                // reading the ground from the palette put dark cards and white
                // headings on a near-white page.
                bgcolor: ACCOUNT_SURFACE,
                color: "#e2e8f0",
                fontFamily: FONT_SANS,
                backgroundImage: `radial-gradient(circle at top, ${brandColor}25, transparent 32%)`,
            }}
        >
            <CssBaseline />
            <Head>
                <title>Account</title>
            </Head>

            <Box
                sx={{
                    width: "100%",
                    maxWidth: { xs: "480px", sm: "100%", md: "1200px" },
                    mx: "auto",
                    minHeight: "100vh",
                    position: "relative",
                    // Clears whichever bar is mounted. The buyer bar is hidden
                    // from `md` up, so the reserve is dropped there too.
                    pb: isSellerWorkspace
                        ? "calc(96px + env(safe-area-inset-bottom))"
                        : {
                              xs: "calc(88px + env(safe-area-inset-bottom))",
                              md: 4,
                          },
                    bgcolor: "transparent",
                    boxShadow: { md: "0 28px 80px rgba(0, 0, 0, 0.4)" },
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

                <Box component="main" sx={{ minHeight: "100vh", width: "100%" }}>
                    {children}
                </Box>
            </Box>

            {isSellerWorkspace ? (
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
            ) : (
                /* The buyer bar's Material Symbols face is bundled in app.tsx. */
                <UserBottomNav isAuthenticated />
            )}
        </Box>
    );
}
