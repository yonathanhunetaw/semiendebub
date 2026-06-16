import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ReviewsRoundedIcon from "@mui/icons-material/ReviewsRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import {
    Box, Chip, Stack, Typography, useTheme, alpha,
} from "@mui/material";
import React from "react";

const liveCards = [
    { label: "Sales",     icon: TrendingUpRoundedIcon,           href: () => route("seller.sales.index") },
    { label: "Orders",    icon: ShoppingBagRoundedIcon,          href: () => route("seller.orders.index") },
    { label: "Delivery",  icon: LocalShippingRoundedIcon,        href: () => route("seller.delivery.index") },
    { label: "Calendar",  icon: CalendarMonthRoundedIcon,        href: () => route("seller.calendar.index") },
    { label: "Balance",   icon: AccountBalanceWalletRoundedIcon, href: () => route("seller.balance.index") },
    { label: "Documents", icon: ReceiptLongRoundedIcon,          href: () => route("seller.documents.index") },
];

const soonCards = [
    { label: "Reviews",    icon: ReviewsRoundedIcon,   description: "Customer feedback" },
    { label: "Promotions", icon: CampaignRoundedIcon,  description: "Discounts & offers" },
    { label: "Analytics",  icon: InsightsRoundedIcon,  description: "Deep insights" },
];

export default function Index({
    stats,
}: {
    stats?: { sales?: number; orders?: number; deliveries?: number };
}) {
    const theme = useTheme();
    const isLight = theme.palette.mode === "light";
    const accent = theme.palette.primary.main;

    const getBadge = (label: string) => {
        if (label === "Sales")    return stats?.sales;
        if (label === "Orders")   return stats?.orders;
        if (label === "Delivery") return stats?.deliveries;
        return undefined;
    };

    return (
        <Box sx={{ minHeight: "100vh", pb: 6 }}>
            <Head title="More" />

            {/* Header */}
            <Box sx={{
                px: 2, pt: 4, pb: 2,
                display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
                <Typography sx={{ fontWeight: 900, fontSize: 26, color: "text.primary" }}>
                    More
                </Typography>
                <Box
                    component={Link}
                    href={route("seller.settings.index")}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40, height: 40,
                        borderRadius: "12px",
                        bgcolor: alpha(accent, 0.12),
                        color: "primary.main",
                        textDecoration: "none",
                        transition: "0.15s",
                        "&:active": { transform: "scale(0.93)" },
                    }}
                >
                    <SettingsRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
            </Box>

            <Stack spacing={3} sx={{ px: 2 }}>

                {/* Live grid */}
                <Box sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 1.5,
                }}>
                    {liveCards.map((card) => {
                        const Icon = card.icon;
                        const badge = getBadge(card.label);
                        let href: string;
                        try { href = card.href(); } catch { href = "#"; }

                        return (
                            <Box
                                key={card.label}
                                component={Link}
                                href={href}
                                sx={{
                                    textDecoration: "none",
                                    bgcolor: "background.paper",
                                    p: 2.5,
                                    borderRadius: "16px",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    boxShadow: isLight
                                        ? "0 1px 4px rgba(0,0,0,0.05)"
                                        : "0 1px 4px rgba(0,0,0,0.25)",
                                    display: "block",
                                    transition: "0.15s",
                                    "&:active": { transform: "scale(0.95)", opacity: 0.85 },
                                }}
                            >
                                <Stack spacing={2}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        <Box sx={{
                                            width: 40, height: 40,
                                            borderRadius: "10px",
                                            bgcolor: alpha(accent, 0.10),
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}>
                                            <Icon sx={{ color: "primary.main", fontSize: 22 }} />
                                        </Box>
                                        {badge != null && (
                                            <Chip
                                                label={badge}
                                                size="small"
                                                sx={{
                                                    bgcolor: "primary.main",
                                                    color: isLight ? "#fff" : "#000",
                                                    fontWeight: 900,
                                                    height: 22,
                                                    fontSize: 11,
                                                }}
                                            />
                                        )}
                                    </Stack>
                                    <Typography sx={{ fontWeight: 800, color: "text.primary", fontSize: 15 }}>
                                        {card.label}
                                    </Typography>
                                </Stack>
                            </Box>
                        );
                    })}
                </Box>

                {/* Coming soon row */}
                <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 12, color: "text.disabled", letterSpacing: 0.8, textTransform: "uppercase", mb: 1.5 }}>
                        Coming soon
                    </Typography>
                    <Stack spacing={1}>
                        {soonCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <Box
                                    key={card.label}
                                    sx={{
                                        bgcolor: "background.paper",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: "14px",
                                        px: 2, py: 1.5,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        opacity: 0.6,
                                    }}
                                >
                                    <Icon sx={{ color: "text.disabled", fontSize: 22, flexShrink: 0 }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.secondary" }}>
                                            {card.label}
                                        </Typography>
                                        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                                            {card.description}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label="Soon"
                                        size="small"
                                        sx={{ fontSize: 11, height: 22, bgcolor: "action.hover", color: "text.disabled" }}
                                    />
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>

            </Stack>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;