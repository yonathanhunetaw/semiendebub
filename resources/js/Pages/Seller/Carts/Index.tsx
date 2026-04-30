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

// Utility to handle names safely
const formatName = (first?: string, last?: string) => {
    const name = [first, last].filter(Boolean).join(" ");
    return name.length > 0 ? name : null;
};

const getInitials = (name: string) => {
    if (!name) return "??";
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
};

export default function Index({ carts }: { carts: any }) {
    const theme = useTheme();

    // Fix: Ensure we extract data correctly from Laravel Paginator or raw Array
    const cartList: SellerCart[] = Array.isArray(carts) ? carts : (carts.data || []);

    // Helper for contrast colors
    const isDark = theme.palette.mode === 'dark';
    const contrastText = isDark ? "#000" : "#fff";
    const subtextOpacity = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)";

    return (
        <Box
            sx={{
                bgcolor: "background.default",
                minHeight: "100vh",
                color: "text.primary",
            }}
        >
            <Head title="Seller Carts" />

            {/* Header Section */}
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
                        color: contrastText,
                        "&:hover": { bgcolor: "primary.dark" },
                    }}
                >
                    <AddRoundedIcon />
                </IconButton>
            </Box>

            <Box sx={{ px: 2 }}>
                <Stack spacing={1.5}>
                    {cartList.map((cart) => {
                        const customerName = formatName(
                            cart.customer?.first_name,
                            cart.customer?.last_name
                        );
                        const sellerLabel = formatName(
                            cart.seller?.first_name,
                            cart.seller?.last_name
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
                                    transition: "transform 0.1s ease",
                                    "&:active": { transform: "scale(0.98)" },
                                }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    alignItems="center"
                                >
                                    {/* Avatar */}
                                    <Avatar
                                        sx={{
                                            bgcolor: isDark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)",
                                            color: contrastText,
                                            fontWeight: 900,
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {getInitials(customerName || `C${cart.id}`)}
                                    </Avatar>

                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            sx={{
                                                fontWeight: 900,
                                                color: contrastText,
                                                fontSize: "1rem",
                                                lineHeight: 1.2,
                                            }}
                                            noWrap
                                        >
                                            {customerName ? `${customerName}'s Cart` : `Cart #${cart.id}`}
                                        </Typography>

                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: subtextOpacity,
                                                fontWeight: 600,
                                                mt: 0.2,
                                            }}
                                            noWrap
                                        >
                                            {sellerLabel || "Unassigned Seller"}
                                        </Typography>
                                    </Box>

                                    <Stack alignItems="flex-end" spacing={0.5}>
                                        <Chip
                                            label={`${cart.items?.length ?? 0} items`}
                                            size="small"
                                            sx={{
                                                bgcolor: "rgba(0,0,0,0.1)",
                                                color: contrastText,
                                                fontWeight: 800,
                                                fontSize: "0.7rem",
                                            }}
                                        />
                                        <ChevronRightRoundedIcon
                                            sx={{
                                                color: contrastText,
                                                opacity: 0.5,
                                            }}
                                        />
                                    </Stack>
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>

                {/* Empty State */}
                {cartList.length === 0 && (
                    <Box sx={{ textAlign: "center", mt: 10, opacity: 0.5 }}>
                        <Typography variant="body1">No active carts found.</Typography>
                    </Box>
                )}

                <Typography
                    variant="body2"
                    sx={{ textAlign: "center", py: 4, opacity: 0.7 }}
                >
                    Total: {cartList.length}
                </Typography>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout children={page} />;
