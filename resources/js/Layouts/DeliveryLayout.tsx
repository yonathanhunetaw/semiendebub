import * as React from "react";
import {
    Box,
    Paper,
    BottomNavigation,
    BottomNavigationAction,
} from "@mui/material";
import { Dashboard } from "@mui/icons-material";
import { CiDeliveryTruck } from "react-icons/ci";
import { CgProfile } from "react-icons/cg";
import { Link, usePage } from "@inertiajs/react";

export default function DeliveryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { url } = usePage();

    // Inside DeliveryLayout.tsx

    const getActiveValue = () => {
        if (url.includes("/dashboard")) return 0;
        if (url.includes("/delivery")) return 1;
        // Highlight Profile (2) if we are on profile OR sessions
        if (url.includes("/profile") || url.includes("/sessions")) return 2;
        return 0;
    };

    return (
        <Box sx={{ pb: 7, minHeight: "100vh" }}>
            <Box component="main">{children}</Box>

            <Paper
                sx={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                }}
                elevation={3}
            >
                {/* YOU WERE MISSING THIS WRAPPER BELOW */}
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
                        href={route("delivery.index")}
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
