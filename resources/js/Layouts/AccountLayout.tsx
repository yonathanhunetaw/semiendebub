import FlashToast from "@/Components/Shared/FlashToast";
import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import UserBottomNav from "@/Components/Navigation/User/UserBottomNav";
import { Head, usePage } from "@inertiajs/react";
import { Box, CssBaseline, useTheme } from "@mui/material";
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

interface SharedProps {
    auth?: { user?: { role_key?: string | null } | null };
    flash?: { success?: string; error?: string };
}

/**
 * Chrome for pages shared across roles — currently Shared/Profile/Edit, which
 * `/profile` serves to every signed-in account regardless of role.
 *
 * It is SellerLayout's surface (same theme ground, same brand glow, same
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
    const { auth } = usePage().props as SharedProps;

    const roleKey = auth?.user?.role_key ?? null;
    const isSellerWorkspace = roleKey !== null && SELLER_WORKSPACE_ROLES.has(roleKey);

    return (
        <Box
            sx={{
                minHeight: "100vh",
                // Theme ground: the profile cards are on tokens too, so the
                // page follows the app's light/dark mode.
                bgcolor: "background.default",
                color: "text.primary",
                fontFamily: FONT_SANS,
                backgroundImage: "radial-gradient(circle at top, rgb(var(--primary) / 0.15), transparent 32%)",
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
                    boxShadow: { md: theme.palette.mode === "dark" ? "none" : "0 28px 80px rgb(var(--on-surface) / 0.12)" },
                }}
            >
                <FlashToast />


                <Box component="main" sx={{ minHeight: "100vh", width: "100%" }}>
                    {children}
                </Box>
            </Box>

            {isSellerWorkspace ? (
                <SellerBottomNav />
            ) : (
                /* The buyer bar's Material Symbols face is bundled in app.tsx. */
                <UserBottomNav isAuthenticated />
            )}
        </Box>
    );
}
