import React, { useState } from "react";
import {
    Dashboard,
    ShoppingCart,
    People,
    Layers,
    Inventory,
    MultipleStop,
    Storefront,
    Warehouse,
    PointOfSale,
    Payments,
    LocalShipping,
    ReceiptLong,
    TaskAlt,
    Settings,
    ExpandLess,
    ExpandMore,
    Draw,
} from "@mui/icons-material";
import { Link, usePage } from "@inertiajs/react";
import {
    Box,
    Collapse,
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
} from "@mui/material";

const drawerWidth = 260;

export default function AdminSidebar({
    open,
    onClose,
    variant,
    sx,
}: {
    open: boolean;
    onClose: () => void;
    variant: "temporary" | "permanent";
    sx?: Record<string, unknown>;
}) {
    const { url } = usePage();

    // Only one dropdown state now: Inventory
    const [inventoryOpen, setInventoryOpen] = useState(
        ["/inventory/transfers", "/inventory/stores", "/inventory/warehouse"].some((path) => url.includes(path))
    );

    const mainItemStyle = {
        borderRadius: 1,
        mx: 1,
        mb: 0.5,
        "&.Mui-selected": {
            backgroundColor: "action.selected",
        },
    };

    const indentedItemStyle = {
        borderRadius: 1,
        ml: 6,
        mr: 1,
        mb: 0.5,
    };

    const menuItems = (
        <Box
            sx={{
                pt: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
            }}
            onClick={variant === "temporary" ? onClose : undefined}
        >
            <List sx={{ flexGrow: 1 }}>
                {/* 1. Dashboard */}
                <ListItemButton
                    component={Link}
                    href="/dashboard"
                    selected={url === "/dashboard"}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><Dashboard /></ListItemIcon>
                    <ListItemText primary="Dashboard" />
                </ListItemButton>

                {/* 2. Carts */}
                <ListItemButton
                    component={Link}
                    href="/carts"
                    selected={url.includes("/carts")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><ShoppingCart /></ListItemIcon>
                    <ListItemText primary="Carts" />
                </ListItemButton>

                {/* 3. Customers */}
                <ListItemButton
                    component={Link}
                    href="/customers"
                    selected={url.includes("/customers")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><People /></ListItemIcon>
                    <ListItemText primary="Customers" />
                </ListItemButton>

                {/* 4. Items (The Global Catalog) */}
                <ListItemButton
                    component={Link}
                    href="/items"
                    selected={url.includes("/items") && !url.includes("/inventory")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><Layers /></ListItemIcon>
                    <ListItemText primary="Items" />
                </ListItemButton>

                {/* 5. Inventory (The Hub + Shortcuts) */}
                <Box sx={{ position: "relative" }}>
                    <ListItemButton
                        component={Link}
                        href="/inventory"
                        selected={url.startsWith("/inventory") && !url.includes("/inventory/")}
                        sx={mainItemStyle}
                    >
                        <ListItemIcon><Inventory /></ListItemIcon>
                        <ListItemText primary="Inventory" />
                        <Box
                            component="div"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInventoryOpen(!inventoryOpen);
                            }}
                            sx={{ display: "flex", alignItems: "center" }}
                        >
                            {inventoryOpen ? <ExpandLess /> : <ExpandMore />}
                        </Box>
                    </ListItemButton>

                    <Collapse in={inventoryOpen} timeout="auto" unmountOnExit>
                        <List component="div" disablePadding>
                            <ListItemButton
                                component={Link}
                                href="/inventory/stores"
                                selected={url.includes("/inventory/stores")}
                                sx={indentedItemStyle}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Storefront fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary="Stores" />
                            </ListItemButton>
                            <ListItemButton
                                component={Link}
                                href="/inventory/warehouse"
                                selected={url.includes("/inventory/warehouse")}
                                sx={indentedItemStyle}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Warehouse fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary="Warehouse" />
                            </ListItemButton>
                            <ListItemButton
                                component={Link}
                                href="/inventory/transfers"
                                selected={url.includes("/inventory/transfers")}
                                sx={indentedItemStyle}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <MultipleStop fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary="Transfers" />
                            </ListItemButton>
                        </List>
                    </Collapse>
                </Box>

                {/* 6. Operations */}
                <ListItemButton
                    component={Link}
                    href="/sales"
                    selected={url.includes("/sales")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><PointOfSale /></ListItemIcon>
                    <ListItemText primary="Sales" />
                </ListItemButton>

                <ListItemButton
                    component={Link}
                    href="/payments"
                    selected={url.includes("/payments")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><Payments /></ListItemIcon>
                    <ListItemText primary="Payments" />
                </ListItemButton>

                <ListItemButton
                    component={Link}
                    href="/delivery"
                    selected={url.includes("/delivery")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><LocalShipping /></ListItemIcon>
                    <ListItemText primary="Delivery" />
                </ListItemButton>

                <ListItemButton
                    component={Link}
                    href="/purchase-orders"
                    selected={url.includes("/purchase-orders")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><ReceiptLong /></ListItemIcon>
                    <ListItemText primary="Purchase Orders" />
                </ListItemButton>

                <ListItemButton
                    component={Link}
                    href="/tasks"
                    selected={url.includes("/tasks")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><TaskAlt /></ListItemIcon>
                    <ListItemText primary="Tasks" />
                </ListItemButton>
                {/* White Board / Canvas */}
                <ListItemButton
                    component="a"
                    href="/canvas"
                    target="_blank"
                    selected={url.includes("/canvas")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon><Draw /></ListItemIcon>
                    <ListItemText primary="White Board" />
                </ListItemButton>
            </List>

            {/* Bottom: Settings */}
            <Box sx={{ pb: 2 }}>
                <ListItemButton
                    component={Link}
                    href="/settings"
                    selected={url.includes("/settings")}
                    sx={{
                        ...mainItemStyle,
                        mt: 1,
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                        <Settings fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Settings" />
                </ListItemButton>
            </Box>
        </Box>
    );

    return (
        <Drawer
            variant={variant}
            open={open}
            onClose={onClose}
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                    width: drawerWidth,
                    boxSizing: "border-box",
                    bgcolor: "background.paper",
                    color: "text.primary",
                    borderRight: "1px solid",
                    borderColor: "divider",
                    "&::-webkit-scrollbar": { width: "8px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": {
                        background: "#717171",
                        borderRadius: "4px",
                    },
                    "&::-webkit-scrollbar-thumb:hover": {
                        background: "#a0a0a0",
                    },
                    "& .MuiListItemIcon-root": {
                        color: "inherit",
                        opacity: 0.8,
                    },
                    "& .Mui-selected .MuiListItemIcon-root": { opacity: 1 },
                },
                ...sx,
            }}
        >
            <Toolbar />
            {menuItems}
        </Drawer>
    );
}
