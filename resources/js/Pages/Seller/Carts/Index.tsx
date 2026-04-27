import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
    Avatar,
    Box,
    Chip,
    IconButton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import React from "react";

interface CartItem {
    id: number;
}

interface SellerCart {
    id: number;
    customer?: {
        first_name?: string;
        last_name?: string;
    } | null;
    seller?: {
        first_name?: string;
        last_name?: string;
    } | null;
    items?: CartItem[];
}

// Utility to handle names without importing old UI files
const formatName = (first?: string, last?: string) => {
    return [first, last].filter(Boolean).join(" ");
};

const getInitials = (name: string) => {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
};

export default function Index({ carts = [] }: { carts?: SellerCart[] }) {
    const theme = useTheme();

    return (
        <Box
            sx={{
                bgcolor: "background.default",
                minHeight: "100vh",
                color: "text.primary",
            }}
        >
            <Head title="Seller Carts" />

            {/* Simple, High-Contrast Header */}
            <Box
                sx={{
                    px: 2,
                    pt: 4,
                    pb: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    Carts
                </Typography>
                <IconButton
                    component={Link}
                    href={route("seller.carts.create")}
                    sx={{
                        bgcolor: "primary.main",
                        color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                        "&:hover": { bgcolor: "primary.dark" },
                    }}
                >
                    <AddRoundedIcon />
                </IconButton>
            </Box>

            <Box sx={{ px: 2 }}>
                <Stack spacing={1.5}>
                    {carts.map((cart) => {
                        const customerName = formatName(
                            cart.customer?.first_name,
                            cart.customer?.last_name,
                        );
                        const sellerLabel = formatName(
                            cart.seller?.first_name,
                            cart.seller?.last_name,
                        );

                        return (
                            <Box
                                key={cart.id}
                                component={Link}
                                href={route("seller.carts.show", cart.id)}
                                sx={{
                                    textDecoration: "none",
                                    display: "block",
                                    p: 2,
                                    borderRadius: 4,
                                    bgcolor: "primary.main",
                                    border: "1px solid rgba(0,0,0,0.05)",
                                    transition: "transform 0.1s active",
                                    "&:active": { transform: "scale(0.98)" },
                                }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    alignItems="center"
                                >
                                    {/* Avatar with dynamic contrast background */}
                                    <Avatar
                                        sx={{
                                            bgcolor: theme.palette.mode === 'dark' ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)",
                                            color: theme.palette.mode === 'dark' ? "#fff" : "#000",
                                            fontWeight: 900,
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {getInitials(
                                            customerName || `C${cart.id}`,
                                        )}
                                    </Avatar>

                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        {/* The Title: Isabelle Crona's Cart */}
                                        <Typography
                                            sx={{
                                                fontWeight: 900,
                                                color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                                                fontSize: "1rem",
                                                lineHeight: 1.2,
                                            }}
                                            noWrap
                                        >
                                            {customerName
                                                ? `${customerName}'s Cart`
                                                : `Cart #${cart.id}`}
                                        </Typography>

                                        {/* The Subtitle: Morris Bartoletti (Fixed Visibility) */}
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: theme.palette.mode === 'dark' ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)",
                                                fontWeight: 600,
                                                mt: 0.2,
                                            }}
                                            noWrap
                                        >
                                            {sellerLabel ||
                                                "Seller not assigned"}
                                        </Typography>
                                    </Box>

                                    <Stack alignItems="flex-end" spacing={0.5}>
                                        <Chip
                                            label={`${cart.items?.length ?? 0} items`}
                                            size="small"
                                            sx={{
                                                bgcolor: "rgba(0,0,0,0.15)",
                                                color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                                                fontWeight: 800,
                                                fontSize: "0.7rem",
                                            }}
                                        />
                                        <ChevronRightRoundedIcon
                                            sx={{
                                                color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                                                opacity: 0.5,
                                            }}
                                        />
                                    </Stack>
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>

                {carts.length === 0 && (
                    <Typography
                        sx={{ textAlign: "center", mt: 10, opacity: 0.5 }}
                    >
                        No active carts found.
                    </Typography>
                )}

                <Typography
                    variant="body2"
                    sx={{ textAlign: "center", py: 4, opacity: 0.7 }}
                >
                    Total {carts.length}
                </Typography>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
