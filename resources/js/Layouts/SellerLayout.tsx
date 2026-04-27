import SellerBottomNav from "@/Components/Navigation/Seller/SellerBottomNav";
import { SELLER_BG, SELLER_BRAND_DARK } from "@/Components/Seller/sellerUi";
import { Head, usePage } from "@inertiajs/react";
import { Alert, Box, CssBaseline } from "@mui/material";
import React from "react";

export default function SellerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { flash } = usePage().props as {
        flash?: {
            success?: string;
            error?: string;
        };
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: SELLER_BG,
                backgroundImage:
                    "radial-gradient(circle at top, rgba(246, 164, 93, 0.2), transparent 32%)",
                fontFamily: "Figtree, sans-serif",
            }}
        >
            <CssBaseline />
            <Head>
                <title>Seller</title>
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(SELLER_BRAND_DARK)}%22/><text y=%2258%22 x=%2223%22 font-size=%2250%22 fill=%22white%22 font-family=%22sans-serif%22 font-weight=%22900%22>S</text></svg>`}
                />
            </Head>

            <Box
                sx={{
                    width: "min(100%, 480px)",
                    mx: "auto",
                    minHeight: "100vh",
                    position: "relative",
                    pb: "calc(96px + env(safe-area-inset-bottom))",
                    backgroundColor: "rgba(248, 250, 252, 0.9)",
                    boxShadow: {
                        md: "0 28px 80px rgba(15, 23, 42, 0.16)",
                    },
                }}
            >
                {flash?.success ? (
                    <Alert severity="success" sx={{ m: 2, mb: 0, borderRadius: 3 }}>
                        {flash.success}
                    </Alert>
                ) : null}
                {flash?.error ? (
                    <Alert severity="error" sx={{ m: 2, mb: 0, borderRadius: 3 }}>
                        {flash.error}
                    </Alert>
                ) : null}

                <Box component="main" sx={{ minHeight: "100vh", width: "100%" }}>
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
                }}
            >
                <Box sx={{ pointerEvents: "auto" }}>
                    <SellerBottomNav />
                </Box>
            </Box>
        </Box>
    );
}
