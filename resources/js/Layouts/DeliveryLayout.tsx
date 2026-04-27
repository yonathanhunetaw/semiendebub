import * as React from "react";
import {
    Box,
    Paper,
    BottomNavigation,
    BottomNavigationAction,
    useTheme, // Add this
} from "@mui/material";
import { Dashboard } from "@mui/icons-material";
import { CiDeliveryTruck } from "react-icons/ci";
import { CgProfile } from "react-icons/cg";
import { Link, usePage, Head } from "@inertiajs/react"; // Add Head
import { subdomainConfigs, SubdomainType } from "@/theme"; // Add these

export default function DeliveryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { url } = usePage();
    const theme = useTheme(); // Access the current theme color

    // --- 1. SUBDOMAIN DETECTION ---
    const hostParts = window.location.hostname.split('.');
    // If 2 parts (duka.pi), it's the root. If 3 parts, take the first.
    const detected = hostParts.length > 2 ? hostParts[0].toLowerCase() : 'admin';
    const activeKey: SubdomainType = (detected in subdomainConfigs)
        ? (detected as SubdomainType)
        : 'delivery'; // Fallback to delivery for this specific layout

    const config = subdomainConfigs[activeKey];

    const getActiveValue = () => {
        if (url.includes("/dashboard")) return 0;
        if (url.includes("/delivery")) return 1;
        if (url.includes("/profile") || url.includes("/sessions")) return 2;
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
            {/* --- 2. DYNAMIC HEAD (Favicon & Title) --- */}
            <Head>
                <title>{`${config.label} | Duka`}</title>
                <link
                    rel="icon"
                    href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(theme.palette.primary.main)}%22/><text y=%2255%22 x=%2210%22 font-size=%2255%22 fill=%22white%22 font-family=%22sans-serif%22 font-weight=%22900%22 text-anchor=%22start%22>${config.label.charAt(0)}</text></svg>`}
                />
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
