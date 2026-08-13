import AdminLayout from '@/Layouts/AdminLayout';
import { Head } from "@inertiajs/react";
import { Box, Paper, Typography, Divider, Chip, Stack, IconButton, Menu, MenuItem } from "@mui/material";
import { useState } from 'react';
import PeopleIcon from '@mui/icons-material/People';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StorefrontIcon from '@mui/icons-material/Storefront';

interface LowStockItem {
    item_id: number;
    product_name: string;
    store_name: string;
    total_stock: number;
    low_stock_total: number;
}

interface Props {
    sessionsCount: number;
    rolesBreakdown: Record<string, number>;
    openCartsCount: number;
    cartsBreakdown: Record<string, number>;
    customersCount: number;
    productsCount: number;
    activeVariantsCount: number;
    lowStockItems: LowStockItem[];
    stores: Array<{ id: number; name: string }>;
}

export default function Dashboard({
    sessionsCount,
    rolesBreakdown = {},
    openCartsCount = 0,
    cartsBreakdown = {},
    customersCount,
    productsCount,
    activeVariantsCount,
    lowStockItems = [],
    stores = []
}: Props) {
    const [selectedStore, setSelectedStore] = useState<string>('all');
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [menuTarget, setMenuTarget] = useState<string | null>(null);

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, target: string) => {
        setAnchorEl(event.currentTarget);
        setMenuTarget(target);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setMenuTarget(null);
    };

    const StatCard = ({ title, value, icon, color, cardKey, children }: any) => (
        <Paper elevation={0} sx={{
            p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider',
            display: 'flex', flexDirection: 'column', position: 'relative'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        {title}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
                        {value}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ bgcolor: `${color}.main`, p: 1.5, borderRadius: '10px', color: 'white', display: 'flex' }}>
                        {icon}
                    </Box>
                    {cardKey && (
                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, cardKey)}>
                            <MoreVertIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
            </Box>
            {children && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                    {children}
                </Box>
            )}
        </Paper>
    );

    return (
        <Box sx={{ p: 1 }}>
            <Head title="Admin Dashboard" />
            
            {/* Header with Store Switcher Toolbar */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Admin Dashboard
                </Typography>
                
                <Stack direction="row" spacing={1} alignItems="center">
                    <StorefrontIcon color="action" fontSize="small" />
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>Store Scope:</Typography>
                    <Stack direction="row" spacing={0.5}>
                        <Chip 
                            label="All Stores" 
                            onClick={() => setSelectedStore('all')} 
                            color={selectedStore === 'all' ? 'primary' : 'default'}
                            variant={selectedStore === 'all' ? 'filled' : 'outlined'}
                            size="small"
                        />
                        {stores.map((store) => (
                            <Chip 
                                key={store.id} 
                                label={store.name} 
                                onClick={() => setSelectedStore(store.name)} 
                                color={selectedStore === store.name ? 'primary' : 'default'}
                                variant={selectedStore === store.name ? 'filled' : 'outlined'}
                                size="small"
                            />
                        ))}
                    </Stack>
                </Stack>
            </Box>

            {/* Statistics Grid */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(5, 1fr)' },
                gap: 3,
                mb: 4
            }}>
                <StatCard
                    title="Active Sessions" value={sessionsCount}
                    icon={<MonitorHeartIcon />} color="success" cardKey="sessions"
                >
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {Object.entries(rolesBreakdown).map(([role, count]) => (
                            <Chip 
                                key={role} 
                                label={`${count} ${role}`} 
                                size="small" 
                                color={count > 0 ? "success" : "default"} 
                                variant={count > 0 ? "filled" : "outlined"}
                                sx={{ textTransform: 'capitalize' }}
                            />
                        ))}
                    </Stack>
                </StatCard>

                <StatCard
                    title="Open Carts" value={openCartsCount}
                    icon={<ShoppingCartIcon />} color="primary" cardKey="carts"
                >
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {Object.entries(cartsBreakdown).map(([type, count]) => (
                            <Chip 
                                key={type} 
                                label={`${count} ${type}`} 
                                size="small" 
                                color={count > 0 ? "primary" : "default"} 
                                variant={count > 0 ? "filled" : "outlined"}
                                sx={{ textTransform: 'capitalize' }}
                            />
                        ))}
                    </Stack>
                </StatCard>

                <StatCard title="Total Customers" value={customersCount} icon={<PeopleIcon />} color="info" cardKey="customers" />
                <StatCard title="Active Products" value={productsCount} icon={<ShoppingBagIcon />} color="info" cardKey="products" />
                <StatCard title="Total Variants" value={activeVariantsCount} icon={<ShoppingBagIcon />} color="secondary" cardKey="variants" />
            </Box>

            {/* Expanded Breakdown Context Menu */}
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                <Typography variant="subtitle2" sx={{ px: 2, py: 1, fontWeight: 600 }}>
                    Store Breakdown ({menuTarget})
                </Typography>
                <Divider />
                {stores.length > 0 ? (
                    stores.map(store => (
                        <MenuItem key={store.id} onClick={handleMenuClose} sx={{ fontSize: '0.875rem' }}>
                            {store.name}: <Box component="span" sx={{ fontWeight: 600, ml: 1 }}>-- (Data)</Box>
                        </MenuItem>
                    ))
                ) : (
                    <MenuItem onClick={handleMenuClose}>No additional stores found</MenuItem>
                )}
            </Menu>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
                gap: 3
            }}>
                {/* Low Stock Section with Store Context */}
                <Paper sx={{ p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                        <WarningAmberIcon color="warning" />
                        <Typography variant="h6" fontWeight={600}>Low Stock Alerts by Store</Typography>
                    </Stack>
                    <Divider sx={{ mb: 2 }} />

                    {lowStockItems.length > 0 ? (
                        lowStockItems.map((item) => (
                            <Box key={item.item_id} sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
                                '&:last-child': { borderBottom: 'none' }
                            }}>
                                <Box>
                                    <Typography variant="body1" fontWeight={500}>{item.product_name}</Typography>
                                    <Chip label={item.store_name} size="small" variant="outlined" sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }} />
                                </Box>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Typography variant="body2" color="text.secondary">
                                        Remaining: {item.total_stock}
                                    </Typography>
                                    <Chip label="Refill Needed" size="small" color="error" variant="outlined" />
                                </Stack>
                            </Box>
                        ))
                    ) : (
                        <Typography color="text.secondary">All items are sufficiently stocked across all locations.</Typography>
                    )}
                </Paper>

                {/* System Status Panel */}
                <Paper sx={{ p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Typography variant="h6" fontWeight={600} mb={2}>System Status</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Welcome to the Duka Commerce Ledger. All multi-tenant store routing and inventory daemons are operational.
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.disabled">
                        Last Refreshed: {new Date().toLocaleTimeString()}
                    </Typography>
                </Paper>
            </Box>
        </Box>
    );
}

Dashboard.layout = (page: React.ReactNode) => (
    <AdminLayout>
        {page}
    </AdminLayout>
);