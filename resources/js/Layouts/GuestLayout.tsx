import { Link } from "@inertiajs/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import React from "react";

interface GuestLayoutProps {
    children: React.ReactNode;
}

/**
 * Shell for the public auth screens (login, register, password reset).
 * Mirrors the Mezgebe Dirijit landing-page brand so signing in does not
 * look like a different product.
 */
export default function GuestLayout({ children }: GuestLayoutProps) {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: 2,
                py: 6,
                fontFamily: "Figtree, sans-serif",
                bgcolor: "#1a120b",
                backgroundImage:
                    "radial-gradient(circle at 50% -10%, rgba(192,88,0,0.35), transparent 55%)",
            }}
        >
            <Stack spacing={3} alignItems="center" sx={{ width: "100%", maxWidth: 440 }}>
                <Box
                    component={Link}
                    href="/"
                    sx={{
                        textDecoration: "none",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 1.5,
                    }}
                >
                    <Box
                        sx={{
                            width: 56,
                            height: 56,
                            borderRadius: "16px",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: "#c05800",
                            color: "#fdfbd4",
                            fontWeight: 900,
                            fontSize: 22,
                        }}
                    >
                        መዝ
                    </Box>
                    <Box sx={{ textAlign: "center" }}>
                        <Typography
                            sx={{ fontWeight: 900, color: "#fdfbd4", letterSpacing: 2, fontSize: "1.1rem" }}
                        >
                            MEZGEBE DIRIJIT
                        </Typography>
                        <Typography
                            sx={{
                                color: "rgba(253,251,212,0.55)",
                                fontSize: "0.7rem",
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                            }}
                        >
                            Business Registry
                        </Typography>
                    </Box>
                </Box>

                <Paper
                    elevation={0}
                    sx={{
                        width: "100%",
                        p: { xs: 3, sm: 4 },
                        borderRadius: 3,
                        bgcolor: "#ffffff",
                        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
                    }}
                >
                    {children}
                </Paper>

                <Typography sx={{ color: "rgba(253,251,212,0.4)", fontSize: "0.7rem", fontFamily: "monospace" }}>
                    © {new Date().getFullYear()} MEZGEBE DIRIJIT
                </Typography>
            </Stack>
        </Box>
    );
}
