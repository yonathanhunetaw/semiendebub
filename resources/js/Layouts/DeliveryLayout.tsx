import * as React from "react";
import {
    Box,
    Paper,
    BottomNavigation,
    BottomNavigationAction,
} from "@mui/material";
import Dashboard from "@mui/icons-material/Dashboard";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { CiDeliveryTruck } from "react-icons/ci";
import { CgProfile } from "react-icons/cg";
import { Link, usePage, Head } from "@inertiajs/react";
import { getRole, useRole } from "@/theme";

export default function DeliveryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { url } = usePage();
    const config = getRole(useRole());

    const getActiveValue = () => {
        if (url.includes("/dashboard")) return 0;
        if (url.includes("/delivery")) return 1;
        if (url.includes("/shipments")) return 2;
        if (url.includes("/transfers")) return 3;
        if (url.includes("/profile") || url.includes("/sessions")) return 4;
        return 0;
    };

    return (
        <Box
            sx={{
                pb: 7,
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
            </Box>

            <Paper
                sx={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    bgcolor: "background.paper",
                }}
                elevation={3}
            >
                <BottomNavigation showLabels value={getActiveValue()}>
                    <BottomNavigationAction
                        label="Dashboard"
                        icon={<Dashboard />}
                        component={Link}
                        href={route("delivery.dashboard")}
                    />
                    <BottomNavigationAction
                        label="My Delivery"
                        icon={<CiDeliveryTruck size={24} />}
                        component={Link}
                        href={route("delivery.delivery.index")}
                    />
                    {/*
                      Inter-store freight.
                      The board and its routes existed, but nothing in this nav
                      pointed at them — a courier had no way to reach the runs
                      waiting for a driver, so every shipment a seller or admin
                      raised looked like it never arrived. "My Delivery" is
                      last-mile customer deliveries, which is a different thing.
                    */}
                    <BottomNavigationAction
                        label="Freight"
                        icon={<WarehouseRoundedIcon />}
                        component={Link}
                        href={route("delivery.shipments.index")}
                    />
                    {/* Transfers between two sites (e.g. Remote Hub → Store):
                        the courier collects from the origin and hands over at
                        the destination. */}
                    <BottomNavigationAction
                        label="Transfers"
                        icon={<SwapHorizRoundedIcon />}
                        component={Link}
                        href={route("delivery.transfers.index")}
                    />
                    <BottomNavigationAction
                        label="Profile"
                        icon={<CgProfile size={24} />}
                        component={Link}
                        href={route("delivery.profile.index")}
                    />
                </BottomNavigation>
            </Paper>
        </Box>
    );
}
