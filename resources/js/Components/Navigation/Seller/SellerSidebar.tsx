import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
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

export default function SellerSidebar({ variant, open, onClose, sx }: any) {
    const { url } = usePage();

    const menuItems = [
        { label: "Dashboard", icon: <DashboardRoundedIcon />, href: "/dashboard" },
        { label: "Menu", icon: <MenuBookRoundedIcon />, href: "/menu" },
        { label: "Catalog", icon: <Inventory2RoundedIcon />, href: "/items" },
        { label: "Orders", icon: <ShoppingCartRoundedIcon />, href: "/orders" },
        { label: "Customers", icon: <PeopleRoundedIcon />, href: "/customers" },
        { label: "Categories", icon: <CategoryRoundedIcon />, href: "/categories" },
        { label: "Settings", icon: <SettingsRoundedIcon />, href: "/settings" },
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
                <Typography variant="h6" sx={{ fontWeight: 900, color: "primary.main", letterSpacing: 1 }}>
                    DUKA_SELLER
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
                            <ListItemIcon sx={{ color: url.startsWith(item.href) ? "primary.main" : "inherit" }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
