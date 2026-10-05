import { Link } from "@inertiajs/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import React from "react";
import { FONT_SANS } from "@/theme";

interface GuestLayoutProps {
    children: React.ReactNode;
}

/**
 * Shell for the public auth screens (login, register, password reset).
 * Mirrors the Mezgebe Dirijit landing-page brand so signing in does not
 * look like a different product. Colors are theme tokens: the accent follows
 * the subdomain's role (admin on the root domain) and the page follows
 * light/dark.
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
                fontFamily: FONT_SANS,
                bgcolor: "background.default",
                backgroundImage:
                    "radial-gradient(circle at 50% -10%, rgb(var(--primary) / 0.25), transparent 55%)",
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
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            fontWeight: 900,
                            fontSize: 22,
                        }}
                    >
                        መዝ
                    </Box>
                    <Box sx={{ textAlign: "center" }}>
                        <Typography
                            sx={{ fontWeight: 900, color: "text.primary", letterSpacing: 2, fontSize: "1.1rem" }}
                        >
                            MEZGEBE DIRIJIT
                        </Typography>
                        <Typography
                            sx={{
                                color: "text.secondary",
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
                        bgcolor: "background.paper",
                        border: "1px solid",
                        borderColor: "divider",
                        boxShadow: ({ palette }) =>
                            palette.mode === "dark" ? "none" : "0 24px 60px rgb(var(--on-surface) / 0.12)",
                    }}
                >
                    {children}
                </Paper>

                <Typography sx={{ color: "text.secondary", fontSize: "0.7rem", fontFamily: "monospace" }}>
                    © {new Date().getFullYear()} MEZGEBE DIRIJIT
                </Typography>
            </Stack>
        </Box>
    );
}
