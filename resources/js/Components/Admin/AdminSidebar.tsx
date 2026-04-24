// resources/js/Components/Admin/AdminSidebar.tsx
import React, { useState } from "react";
import {
    AccountBalance,
    Badge,
    CalendarMonth,
    Dashboard,
    Description,
    ExpandLess,
    ExpandMore,
    Inventory,
    Inventory2,
    Layers,
    LocalOffer,
    LocalShipping,
    Payments,
    People,
    PointOfSale,
    PriceCheck,
    ReceiptLong,
    Settings,
    ShoppingCart,
    Store,
    SwapHoriz,
    TaskAlt,
    Person,
} from "@mui/icons-material";
import { Link, usePage } from "@inertiajs/react";
import {
    Box,
    Collapse,
    Drawer,
    List,
    ListItem,
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

    const [productsOpen, setProductsOpen] = useState(
        [
            "/items",
            "/variants",
            "/stock",
            "/transfers",
            "/prices",
            "/discounts",
        ].some((path) => url.includes(path)),
    );
    const [moreOpen, setMoreOpen] = useState(
        [
            "/sales",
            "/delivery",
            "/purchase-orders",
            "/balance",
            "/documents",
            "/calendar",
            "/payments",
            "/tasks",
            "/sessions",
        ].some((path) => url.includes(path)),
    );

    const mainItemStyle = { borderRadius: 1, mx: 1, mb: 0.5 };

    // Increased indentation from ml: 4 to ml: 6 for a clearer nesting look
    const indentedItemStyle = { borderRadius: 1, ml: 6, mr: 1, mb: 0.5 };

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
                {/* Dashboard */}
                <ListItemButton
                    component={Link}
                    href="/dashboard"
                    selected={url.startsWith("/dashboard")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon>
                        <Dashboard />
                    </ListItemIcon>
                    <ListItemText primary="Dashboard" />
                </ListItemButton>

                {/* Products Parent */}
                <ListItemButton
                    onClick={(e) => {
                        e.stopPropagation();
                        setProductsOpen(!productsOpen);
                    }}
                    sx={mainItemStyle}
                >
                    <ListItemIcon>
                        <Inventory />
                    </ListItemIcon>
                    <ListItemText primary="Products" />
                    {productsOpen ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>

                {/* Deeply Indented Product Items */}
                <Collapse in={productsOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/items"
                            selected={url.includes("/items")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <Inventory2 fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Items" />
                        </ListItemButton>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/variants"
                            selected={url.includes("/variants")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <Layers fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Variations" />
                        </ListItemButton>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/stock"
                            selected={url.includes("/stock")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <Inventory2 fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Stock" />
                        </ListItemButton>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/transfers"
                            selected={url.includes("/transfers")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <SwapHoriz fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Transfers" />
                        </ListItemButton>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/prices"
                            selected={url.includes("/prices")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <PriceCheck fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Prices" />
                        </ListItemButton>
                        <ListItemButton
                            sx={indentedItemStyle}
                            component={Link}
                            href="/discounts"
                            selected={url.includes("/discounts")}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <LocalOffer fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Discounts" />
                        </ListItemButton>
                    </List>
                </Collapse>

                {/* Main Icons */}
                <ListItemButton
                    component={Link}
                    href="/stores"
                    selected={url.includes("/stores")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon>
                        <Store />
                    </ListItemIcon>
                    <ListItemText primary="Store" />
                </ListItemButton>
                <ListItemButton
                    component={Link}
                    href="/customers"
                    selected={url.includes("/customers")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon>
                        <People />
                    </ListItemIcon>
                    <ListItemText primary="Customers" />
                </ListItemButton>
                <ListItemButton
                    component={Link}
                    href="/carts"
                    selected={url.includes("/carts")}
                    sx={mainItemStyle}
                >
                    <ListItemIcon>
                        <ShoppingCart />
                    </ListItemIcon>
                    <ListItemText primary="Carts" />
                </ListItemButton>

                {/* The "More" Hidden List - NOT Indented */}
                <Collapse in={moreOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/sales"
                            selected={url.includes("/sales")}
                        >
                            <ListItemIcon>
                                <PointOfSale fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Sales" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/delivery"
                            selected={url.includes("/delivery")}
                        >
                            <ListItemIcon>
                                <LocalShipping fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Delivery" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/purchase-orders"
                            selected={url.includes("/purchase-orders")}
                        >
                            <ListItemIcon>
                                <ReceiptLong fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Purchase Orders" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/balance"
                            selected={url.includes("/balance")}
                        >
                            <ListItemIcon>
                                <AccountBalance fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Balance" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/documents"
                            selected={url.includes("/documents")}
                        >
                            <ListItemIcon>
                                <Description fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Documents" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/calendar"
                            selected={url.includes("/calendar")}
                        >
                            <ListItemIcon>
                                <CalendarMonth fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Calendar" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/payments"
                            selected={url.includes("/payments")}
                        >
                            <ListItemIcon>
                                <Payments fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Payments" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/tasks"
                            selected={url.includes("/tasks")}
                        >
                            <ListItemIcon>
                                <TaskAlt fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Tasks" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/users"
                            selected={url.includes("/users")}
                        >
                            <ListItemIcon>
                                {/* Changed from TaskAlt to Person */}
                                <Person fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Users" />
                        </ListItemButton>
                        <ListItemButton
                            sx={mainItemStyle}
                            component={Link}
                            href="/sessions"
                            selected={url.includes("/sessions")}
                        >
                            <ListItemIcon>
                                <Badge fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Sessions" />
                        </ListItemButton>
                    </List>
                </Collapse>

                {/* The YouTube Style Toggle Button */}
                <ListItemButton
                    onClick={(e) => {
                        e.stopPropagation();
                        setMoreOpen(!moreOpen);
                    }}
                    sx={{
                        ...mainItemStyle,
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                    }}
                >
                    <ListItemIcon>
                        {/* Swapped MoreHoriz for ExpandMore (Down Arrow) */}
                        {moreOpen ? <ExpandLess /> : <ExpandMore />}
                    </ListItemIcon>
                    <ListItemText
                        primary={moreOpen ? "Show Less" : "Show More"}
                    />
                </ListItemButton>
            </List>

            <Box sx={{ pb: 2 }}>
                <ListItemButton
                    component={Link}
                    href="/settings"
                    selected={url.includes("/settings")}
                    sx={{
                        ...mainItemStyle,
                        mt: 1,
                        "&.Mui-selected": {
                            backgroundColor: "rgba(255, 255, 255, 0.12)",
                        },
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
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    borderRight: "1px solid rgba(255, 255, 255, 0.12)",
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
