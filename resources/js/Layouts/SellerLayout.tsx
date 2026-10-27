import FlashToast from "@/Components/Shared/FlashToast";
import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import { Head } from "@inertiajs/react";
import { Box, CssBaseline } from "@mui/material";
import React from "react";
import { FONT_SANS } from "@/theme";

export default function SellerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Box
            className="seller-shell"
            sx={{
                minHeight: "100dvh",
                // The `background` token for the current mode.
                bgcolor: "background.default",
                color: "text.primary",
                fontFamily: FONT_SANS,
                // Soft glow in the role color at the top of the page.
                backgroundImage: "radial-gradient(circle at top, rgb(var(--primary) / 0.15), transparent 32%)",
            }}
        >
            <CssBaseline />
            <Head>
                <title>Seller | Duka</title>
            </Head>

            {/* `nav-pad` clears the bottom nav while it is up (app.css). */}
            <Box
                className="nav-pad"
                sx={{
                    width: "100%",
                    maxWidth: { xs: "480px", sm: "100%", md: "1200px" },
                    mx: "auto",
                    minHeight: "100dvh",
                    position: "relative",
                    // Removed the hardcoded light rgba background here
                    bgcolor: "transparent",
                    // Theme elevation instead of a hand-written black shadow.
                    boxShadow: { md: 24 },
                }}
            >
                <FlashToast />


                <Box component="main" sx={{ width: "100%" }}>
                    {children}
                </Box>
            </Box>

            <SellerBottomNav />
        </Box>
    );
}
