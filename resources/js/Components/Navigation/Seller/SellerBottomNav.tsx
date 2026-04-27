import { Link, usePage } from "@inertiajs/react";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import { BottomNavigation, BottomNavigationAction, Paper, useTheme } from "@mui/material";
import React from "react";

const navItems = [
    {
        value: "dashboard",
        label: "Home",
        icon: <HomeRoundedIcon />,
        href: route("seller.dashboard"),
    },
    {
        value: "categories",
        label: "Categories",
        icon: <CategoryRoundedIcon />,
        href: route("seller.categories.index"),
    },
    {
        value: "carts",
        label: "Carts",
        icon: <ShoppingCartRoundedIcon />,
        href: route("seller.carts.index"),
    },
    {
        value: "more",
        label: "More",
        icon: <AppsRoundedIcon />,
        href: route("seller.menu.index"),
    },
];

function currentTab(url: string) {
    const path = url.split("?")[0];

    if (path.startsWith("/dashboard")) {
        return "dashboard";
    }

    if (path.startsWith("/categories")) {
        return "categories";
    }

    if (path.startsWith("/orders") || path.startsWith("/carts")) {
        return "carts";
    }

    return "more";
}

export default function SellerBottomNav() {
    const { url } = usePage();
    const theme = useTheme();

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: 999,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: theme.palette.mode === 'dark' ? "none" : "0 20px 48px rgba(15, 23, 42, 0.18)",
                backdropFilter: "blur(16px)",
                bgcolor: "background.paper",
            }}
        >
            <BottomNavigation
                showLabels
                value={currentTab(url)}
                sx={{
                    height: 68,
                    backgroundColor: "transparent",
                    "& .MuiBottomNavigationAction-root": {
                        minWidth: 0,
                        color: "text.secondary",
                        fontFamily: "Figtree, sans-serif",
                    },
                    "& .Mui-selected": {
                        color: "primary.main",
                    },
                    "& .MuiBottomNavigationAction-label": {
                        fontSize: 12,
                        fontWeight: 700,
                    },
                }}
            >
                {navItems.map((item) => (
                    <BottomNavigationAction
                        key={item.value}
                        component={Link}
                        href={item.href}
                        value={item.value}
                        label={item.label}
                        icon={item.icon}
                    />
                ))}
            </BottomNavigation>
        </Paper>
    );
}
