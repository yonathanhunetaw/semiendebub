import { SellerCard, SellerHeader, SELLER_BRAND_DARK, sellerHeaderButtonSx } from "@/Components/Seller/sellerUi";
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
} from "@mui/material";
import React from "react";

const menuCards = [
    {
        label: "Dashboard",
        href: route("seller.dashboard"),
        icon: DashboardRoundedIcon,
    },
    {
        label: "Catalog",
        href: route("seller.items.index"),
        icon: Inventory2RoundedIcon,
    },
    {
        label: "Customers",
        href: route("seller.customers.index"),
        icon: GroupsRoundedIcon,
    },
    {
        label: "Carts",
        href: route("seller.carts.index"),
        icon: PointOfSaleRoundedIcon,
    },
    {
        label: "Categories",
        href: route("seller.categories.index"),
        icon: CategoryRoundedIcon,
    },
    {
        label: "Settings",
        href: route("seller.settings.index"),
        icon: SettingsRoundedIcon,
    },
    {
        label: "Balance",
        icon: WalletRoundedIcon,
        soon: true,
    },
    {
        label: "Documents",
        icon: ReceiptLongRoundedIcon,
        soon: true,
    },
];

export default function Index({
    stats,
}: {
    stats?: {
        customers?: number;
        carts?: number;
        items?: number;
    };
}) {
    return (
        <>
            <Head title="Seller Menu" />

            <SellerHeader
                title="More"
                action={(
                    <IconButton
                        component={Link}
                        href={route("seller.settings.index")}
                        sx={sellerHeaderButtonSx}
                    >
                        <SettingsRoundedIcon />
                    </IconButton>
                )}
            />

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
                        const badge =
                            card.label === "Customers"
                                ? stats?.customers
                                : card.label === "Carts"
                                  ? stats?.carts
                                  : card.label === "Catalog"
                                    ? stats?.items
                                    : undefined;

                        const cardProps = card.href
                            ? { component: Link, href: card.href, sx: { textDecoration: "none", color: "inherit" } }
                            : {};

                        return (
                            <SellerCard key={card.label} {...cardProps}>
                                <Stack spacing={1.5}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        <Icon sx={{ color: SELLER_BRAND_DARK }} />
                                        {card.soon ? (
                                            <Chip label="Soon" size="small" variant="outlined" />
                                        ) : badge != null ? (
                                            <Chip label={badge} size="small" sx={{ fontWeight: 700 }} />
                                        ) : null}
                                    </Stack>
                                    <Typography sx={{ fontWeight: 700 }}>{card.label}</Typography>
                                </Stack>
                            </SellerCard>
                        );
                    })}
                </Box>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
