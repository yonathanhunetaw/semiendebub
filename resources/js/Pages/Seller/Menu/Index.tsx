import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PointOfSaleRoundedIcon from "@mui/icons-material/PointOfSaleRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import WalletRoundedIcon from "@mui/icons-material/WalletRounded";
import {
    Box,
    Chip,
    IconButton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import React from "react";

const menuCards = [
    { label: "Dashboard", href: route("seller.dashboard"), icon: DashboardRoundedIcon },
    { label: "Catalog", href: route("seller.items.index"), icon: Inventory2RoundedIcon },
    { label: "Customers", href: route("seller.customers.index"), icon: GroupsRoundedIcon },
    { label: "Carts", href: route("seller.carts.index"), icon: PointOfSaleRoundedIcon },
    { label: "Categories", href: route("seller.categories.index"), icon: CategoryRoundedIcon },
    { label: "Settings", href: route("seller.settings.index"), icon: SettingsRoundedIcon },
    { label: "Balance", icon: WalletRoundedIcon, soon: true },
    { label: "Documents", icon: ReceiptLongRoundedIcon, soon: true },
];

export default function Index({ stats }: { stats?: { customers?: number; carts?: number; items?: number; }; }) {
    const theme = useTheme();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
            <Head title="Seller Menu" />

            {/* Clean Header replacing SellerHeader */}
            <Box sx={{ px: 2, pt: 4, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>More</Typography>
                <IconButton
                    component={Link}
                    href={route("seller.settings.index")}
                    sx={{ bgcolor: 'primary.main', color: '#000000', '&:hover': { bgcolor: 'primary.dark' } }}
                >
                    <SettingsRoundedIcon />
                </IconButton>
            </Box>

            <Box sx={{ px: 2, pt: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 1.5,
                    }}
                >
                    {menuCards.map((card) => {
                        const Icon = card.icon;
                        const badge = card.label === "Customers" ? stats?.customers
                                    : card.label === "Carts" ? stats?.carts
                                    : card.label === "Catalog" ? stats?.items
                                    : undefined;

                        return (
                            <Box
                                key={card.label}
                                component={card.href ? Link : 'div'}
                                href={card.href}
                                sx={{
                                    textDecoration: "none",
                                    bgcolor: "#1e293b", // Deep Dark Navy background
                                    p: 2.5,
                                    borderRadius: 4,
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'block',
                                    transition: '0.2s',
                                    '&:active': { transform: 'scale(0.95)' }
                                }}
                            >
                                <Stack spacing={2}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        {/* Icon uses the Orange Brand Color */}
                                        <Icon sx={{ color: "primary.main", fontSize: '1.8rem' }} />

                                        {card.soon ? (
                                            <Chip label="Soon" size="small" variant="outlined" sx={{ color: 'text.secondary', borderColor: 'rgba(255,255,255,0.2)' }} />
                                        ) : badge != null ? (
                                            <Chip label={badge} size="small" sx={{ bgcolor: 'primary.main', color: '#000000', fontWeight: 900 }} />
                                        ) : null}
                                    </Stack>

                                    <Typography sx={{ fontWeight: 800, color: '#ffffff', fontSize: '1rem' }}>
                                        {card.label}
                                    </Typography>
                                </Stack>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
