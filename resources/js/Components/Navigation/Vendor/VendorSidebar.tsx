import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import {
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    type SxProps,
} from "@mui/material";
import { Link, usePage } from "@inertiajs/react";
import React from "react";

export interface VendorSidebarProps {
    variant: "permanent" | "temporary";
    open: boolean;
    onClose: () => void;
    sx?: SxProps;
}

/**
 * Vendor (store owner) navigation, mirroring the old stock keeper sidebar so the two consoles share
 * one structure.
 */
export default function VendorSidebar({
    variant,
    open,
    onClose,
    sx,
}: VendorSidebarProps): React.ReactElement {
    const { url } = usePage();

    const menuItems = [
        {
            label: "My store",
            icon: <SpaceDashboardRoundedIcon />,
            href: "/dashboard",
        },
        {
            label: "Catalogue",
            icon: <Inventory2RoundedIcon />,
            href: "/catalogue",
        },
        {
            label: "Orders",
            icon: <ReceiptLongRoundedIcon />,
            href: "/orders",
        },
        {
            label: "Store profile",
            icon: <StorefrontRoundedIcon />,
            href: "/store",
        },
        {
            label: "My account",
            icon: <PersonRoundedIcon />,
            href: "/profile",
        },
    ];

    return (
        <Drawer
            variant={variant}
            open={open}
            onClose={onClose}
            sx={sx}
            PaperProps={{ sx: { width: 260 } }}
        >
            <Toolbar>
                <Typography
                    variant="h6"
                    sx={{ fontWeight: 900, color: "primary.main", letterSpacing: 1 }}
                >
                    VENDOR
                </Typography>
            </Toolbar>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.label} disablePadding>
                        <ListItemButton
                            component={Link}
                            href={item.href}
                            selected={url.startsWith(item.href)}
                            sx={{
                                "&.Mui-selected": {
                                    borderLeft: "4px solid",
                                    borderColor: "primary.main",
                                    bgcolor: "action.selected",
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    color: url.startsWith(item.href)
                                        ? "primary.main"
                                        : "inherit",
                                }}
                            >
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{ fontWeight: 700 }}
                            />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
