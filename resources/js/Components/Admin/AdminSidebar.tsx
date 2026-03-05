// resources/js/Components/Admin/AdminSidebar.tsx
import React, {useState} from 'react';
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
    MoreHoriz,
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
} from '@mui/icons-material';
import {Link, usePage} from '@inertiajs/react';
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
} from '@mui/material';

const drawerWidth = 260;

export default function AdminSidebar({
                                         open,
                                         onClose,
                                         variant,
                                         sx,
                                     }: {
    open: boolean;
    onClose: () => void;
    variant: 'temporary' | 'permanent';
    sx?: Record<string, unknown>;
}) {
    const {url} = usePage();
    const [productsOpen, setProductsOpen] = useState(
        ['/items', '/variants', '/stock', '/transfers', '/prices', '/discounts']
            .some((path) => url.includes(path))
    );
    const [moreOpen, setMoreOpen] = useState(
        ['/sales', '/delivery', '/purchase-orders', '/balance', '/documents', '/calendar', '/payments', '/tasks', '/sessions', '/settings']
            .some((path) => url.includes(path))
    );

    const menuItems = (
        <Box sx={{pt: 2, height: '100%', display: 'flex', flexDirection: 'column'}}
             onClick={variant === 'temporary' ? onClose : undefined}>
            <List>
                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        href="/dashboard"
                        selected={url.startsWith('/dashboard')}
                        sx={{
                            borderRadius: 1,
                            mx: 1,
                            '&.Mui-selected': {
                                backgroundColor: 'rgba(59, 130, 246, 0.18)',
                                '&:hover': {backgroundColor: 'rgba(59, 130, 246, 0.24)'},
                            },
                        }}
                    >
                        <ListItemIcon>
                            <Dashboard/>
                        </ListItemIcon>
                        <ListItemText primary="Dashboard"/>
                    </ListItemButton>
                </ListItem>

                <ListItemButton
                    onClick={(e) => {
                        e.stopPropagation();
                        setProductsOpen(!productsOpen);
                    }}
                    sx={{
                        borderRadius: 1,
                        mx: 1,
                        mt: 0.5,
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        '&:hover': {backgroundColor: 'rgba(59, 130, 246, 0.14)'},
                    }}
                >
                    <ListItemIcon>
                        <Inventory/>
                    </ListItemIcon>
                    <ListItemText primary="Products"/>
                    {productsOpen ? <ExpandLess/> : <ExpandMore/>}
                </ListItemButton>
                <Collapse in={productsOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/items"
                                        selected={url.includes('/items')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Inventory2 fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Items"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/variants"
                                        selected={url.includes('/variants')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Layers fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Variations"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/stock"
                                        selected={url.includes('/stock')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Inventory2 fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Stock"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/transfers"
                                        selected={url.includes('/transfers')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <SwapHoriz fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Transfers"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/prices"
                                        selected={url.includes('/prices')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <PriceCheck fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Prices"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/discounts"
                                        selected={url.includes('/discounts')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <LocalOffer fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Discounts and Promotions"/>
                        </ListItemButton>
                    </List>
                </Collapse>

                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        href="/stores"
                        selected={url.includes('/stores')}
                        sx={{
                            borderRadius: 1,
                            mx: 1,
                            mt: 0.5,
                            '&.Mui-selected': {
                                backgroundColor: 'rgba(34, 197, 94, 0.18)',
                                '&:hover': {backgroundColor: 'rgba(34, 197, 94, 0.24)'},
                            },
                        }}
                    >
                        <ListItemIcon>
                            <Store/>
                        </ListItemIcon>
                        <ListItemText primary="Store"/>
                    </ListItemButton>
                </ListItem>

                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        href="/customers"
                        selected={url.includes('/customers')}
                        sx={{
                            borderRadius: 1,
                            mx: 1,
                            mt: 0.5,
                            '&.Mui-selected': {
                                backgroundColor: 'rgba(14, 165, 233, 0.18)',
                                '&:hover': {backgroundColor: 'rgba(14, 165, 233, 0.24)'},
                            },
                        }}
                    >
                        <ListItemIcon>
                            <People/>
                        </ListItemIcon>
                        <ListItemText primary="Customers"/>
                    </ListItemButton>
                </ListItem>

                <ListItem disablePadding>
                    <ListItemButton
                        component={Link}
                        href="/carts"
                        selected={url.includes('/carts')}
                        sx={{
                            borderRadius: 1,
                            mx: 1,
                            mt: 0.5,
                            '&.Mui-selected': {
                                backgroundColor: 'rgba(168, 85, 247, 0.18)',
                                '&:hover': {backgroundColor: 'rgba(168, 85, 247, 0.24)'},
                            },
                        }}
                    >
                        <ListItemIcon>
                            <ShoppingCart/>
                        </ListItemIcon>
                        <ListItemText primary="Carts"/>
                    </ListItemButton>
                </ListItem>

                <ListItemButton
                    onClick={(e) => {
                        e.stopPropagation();
                        setMoreOpen(!moreOpen);
                    }}
                    sx={{
                        borderRadius: 1,
                        mx: 1,
                        mt: 0.5,
                        backgroundColor: 'rgba(168, 85, 247, 0.08)',
                        '&:hover': {backgroundColor: 'rgba(168, 85, 247, 0.14)'},
                    }}
                >
                    <ListItemIcon>
                        <MoreHoriz/>
                    </ListItemIcon>
                    <ListItemText primary="More"/>
                    {moreOpen ? <ExpandLess/> : <ExpandMore/>}
                </ListItemButton>
                <Collapse in={moreOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/sales"
                                        selected={url.includes('/sales')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <PointOfSale fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Sales"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/delivery"
                                        selected={url.includes('/delivery')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <LocalShipping fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Delivery"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/purchase-orders"
                                        selected={url.includes('/purchase-orders')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <ReceiptLong fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Purchase Orders"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/balance"
                                        selected={url.includes('/balance')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <AccountBalance fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Balance"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/documents"
                                        selected={url.includes('/documents')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Description fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Documents"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/calendar"
                                        selected={url.includes('/calendar')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <CalendarMonth fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Calendar"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/payments"
                                        selected={url.includes('/payments')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Payments fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Payments"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/tasks"
                                        selected={url.includes('/tasks')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <TaskAlt fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Tasks"/>
                        </ListItemButton>
                        <ListItemButton sx={{pl: 9}} component={Link} href="/sessions"
                                        selected={url.includes('/sessions')}>
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Badge fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Sessions"/>
                        </ListItemButton>
                    </List>
                </Collapse>
            </List>
            <Box sx={{mt: 'auto', pb: 2}}>
                <List>
                    <ListItem disablePadding>
                        <ListItemButton
                            component={Link}
                            href="/settings"
                            selected={url.includes('/settings')}
                            sx={{
                                borderRadius: 1,
                                mx: 1,
                                mt: 1,
                                '&.Mui-selected': {
                                    backgroundColor: 'rgba(15, 23, 42, 0.14)',
                                    '&:hover': {backgroundColor: 'rgba(15, 23, 42, 0.2)'},
                                },
                            }}
                        >
                            <ListItemIcon sx={{minWidth: 36}}>
                                <Settings fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText primary="Settings"/>
                        </ListItemButton>
                    </ListItem>
                </List>
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
                '& .MuiDrawer-paper': {
                    width: drawerWidth,
                    boxSizing: 'border-box',
                    background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
                    borderRight: '1px solid rgba(148, 163, 184, 0.3)',
                },
                ...sx,
            }}
        >
            <Toolbar/>
            {menuItems}
        </Drawer>
    );
}
