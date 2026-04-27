import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import { Box, Grid, Paper, Stack, Typography } from "@mui/material";
import React from "react";

const menuCards = [
    {
        title: "Catalog",
        description: "Browse active items and pricing ladders.",
        icon: <Inventory2RoundedIcon color="primary" />,
        href: route("seller.items.index"),
    },
    {
        title: "Orders",
        description: "Review carts and active order assignments.",
        icon: <ShoppingCartRoundedIcon color="primary" />,
        href: route("seller.orders.index"),
    },
    {
        title: "Customers",
        description: "Manage customer records and sales relationships.",
        icon: <PeopleRoundedIcon color="primary" />,
        href: route("seller.customers.index"),
    },
    {
        title: "Categories",
        description: "Navigate the catalog tree quickly.",
        icon: <CategoryRoundedIcon color="primary" />,
        href: route("seller.categories.index"),
    },
    {
        title: "Settings",
        description: "Update seller preferences and working defaults.",
        icon: <SettingsRoundedIcon color="primary" />,
        href: route("seller.settings.index"),
    },
];

export default function Index() {
    return (
        <>
            <Head title="Seller Menu" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Seller Menu
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Quick access to the core workflows used during a selling shift.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {menuCards.map((card) => (
                    <Grid key={card.title} size={{ xs: 12, md: 6, xl: 4 }}>
                        <Paper
                            component={Link}
                            href={card.href}
                            elevation={0}
                            sx={{
                                display: "block",
                                p: 3,
                                borderRadius: 3,
                                border: "1px solid",
                                borderColor: "divider",
                                textDecoration: "none",
                                color: "inherit",
                                "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" },
                            }}
                        >
                            <Stack spacing={1.5}>
                                {card.icon}
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    {card.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {card.description}
                                </Typography>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
