import ApplicationLogo from "@/Components/Navigation/Global/ApplicationLogo";
import { Link } from "@inertiajs/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import React from "react";

interface GuestLayoutProps {
    children: React.ReactNode;
}

export default function GuestLayout({ children }: GuestLayoutProps) {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "grey.100",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: 2,
                py: 6,
                fontFamily: "Figtree, sans-serif",
            }}
        >
            <Stack spacing={3} alignItems="center" sx={{ width: "100%", maxWidth: 420 }}>
                <Box
                    component={Link}
                    href="/"
                    sx={{
                        color: "text.secondary",
                        textDecoration: "none",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <ApplicationLogo className="h-16 w-16 fill-current" />
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Duka
                    </Typography>
                </Box>

                <Paper
                    elevation={0}
                    sx={{
                        width: "100%",
                        p: { xs: 3, sm: 4 },
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor: "divider",
                        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
                    }}
                >
                    {children}
                </Paper>
            </Stack>
        </Box>
    );
}
