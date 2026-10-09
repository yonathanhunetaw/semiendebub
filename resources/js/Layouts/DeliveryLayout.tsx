import * as React from "react";
import GuideButton from "@/Components/Guide/GuideButton";
import { Box, Paper, BottomNavigation, BottomNavigationAction, alpha } from "@mui/material";
import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import { Link, usePage, Head } from "@inertiajs/react";
import { getRole, useRole } from "@/theme";

/** Height of the nav bar itself, without the phone's safe area. */
const NAV_HEIGHT = 64;

/**
 * Every nav item gets the same share of the bar and the same icon size.
 *
 * The bar used MUI's default 80px minimum per item: five of them do not fit a
 * 360px phone, so "My Delivery" wrapped onto a second line and the react-icons
 * truck (an inline svg with its own size) shrank below the others.
 */
const actionSx = {
    minWidth: 0,
    flex: 1,
    px: 0.25,
    py: 1,
    color: "text.secondary",
    "& .MuiSvgIcon-root": { fontSize: 24, transition: "transform 0.15s" },
    "& .MuiBottomNavigationAction-label": {
        fontSize: "0.68rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
        mt: 0.25,
        "&.Mui-selected": { fontSize: "0.68rem" },
    },
    "&.Mui-selected": {
        color: "primary.main",
        "& .MuiSvgIcon-root": { transform: "translateY(-1px)" },
    },
} as const;

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
    const { url } = usePage();
    const config = getRole(useRole());

    const getActiveValue = () => {
        if (url.includes("/dashboard")) return 0;
        if (url.includes("/shipments")) return 2;
        if (url.includes("/transfers")) return 3;
        if (url.includes("/profile") || url.includes("/sessions")) return 4;
        if (url.includes("/delivery") || url.includes("/history")) return 1;
        return 0;
    };

    return (
        <Box
            sx={{
                pb: `calc(${NAV_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px))`,
                minHeight: "100vh",
                bgcolor: "background.default",
                color: "text.primary",
            }}
        >
            <Head>
                <title>{`${config.label} | Duka`}</title>
            </Head>

            <Box component="main" sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
                {children}
                {/* The page's step in the guide (Components/Guide). */}
                <GuideButton app="delivery" variant="fab" />
            </Box>

            <Paper
                elevation={0}
                sx={(theme) => ({
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    pb: "env(safe-area-inset-bottom, 0px)",
                    bgcolor: alpha(theme.palette.background.paper, 0.92),
                    backdropFilter: "blur(14px)",
                    borderTop: 1,
                    borderColor: "divider",
                    boxShadow: `0 -6px 24px ${alpha(theme.palette.common.black, 0.08)}`,
                })}
            >
                <BottomNavigation
                    showLabels
                    value={getActiveValue()}
                    sx={{ height: NAV_HEIGHT, bgcolor: "transparent", maxWidth: 560, mx: "auto" }}
                >
                    <BottomNavigationAction
                        label="Home"
                        icon={<SpaceDashboardRoundedIcon />}
                        component={Link}
                        href={route("delivery.dashboard")}
                        sx={actionSx}
                    />
                    {/* Last-mile customer deliveries. */}
                    <BottomNavigationAction
                        label="Delivery"
                        icon={<LocalShippingRoundedIcon />}
                        component={Link}
                        href={route("delivery.delivery.index")}
                        sx={actionSx}
                    />
                    {/* Inter-site freight: agree a window, pick up, sign, deliver. */}
                    <BottomNavigationAction
                        label="Freight"
                        icon={<WarehouseRoundedIcon />}
                        component={Link}
                        href={route("delivery.shipments.index")}
                        sx={actionSx}
                    />
                    {/* Transfers between two sites (e.g. Remote Hub → Store). */}
                    <BottomNavigationAction
                        label="Transfers"
                        icon={<SwapHorizRoundedIcon />}
                        component={Link}
                        href={route("delivery.transfers.index")}
                        sx={actionSx}
                    />
                    <BottomNavigationAction
                        label="Profile"
                        icon={<AccountCircleRoundedIcon />}
                        component={Link}
                        href={route("delivery.profile.index")}
                        sx={actionSx}
                    />
                </BottomNavigation>
            </Paper>
        </Box>
    );
}
