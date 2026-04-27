import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
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
} from "@mui/material";
import { Link, usePage } from "@inertiajs/react";

export default function StockKeeperSidebar({
    variant,
    open,
    onClose,
    sx,
}: any) {
    const { url } = usePage();

    const menuItems = [
        {
            label: "Dashboard",
            icon: <SpaceDashboardRoundedIcon />,
            href: "/dashboard",
        },
        {
            label: "Inventory",
            icon: <Inventory2RoundedIcon />,
            href: "/inventory",
        },
        {
            label: "Orders",
            icon: <LocalShippingRoundedIcon />,
            href: "/orders",
        },
        {
            label: "Stock Alerts",
            icon: <NotificationsActiveRoundedIcon />,
            href: "/stock-alerts",
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
                    STOCKKEEPER
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
