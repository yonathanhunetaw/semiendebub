import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head } from "@inertiajs/react";
import { Box, Paper, Typography, Card, CardContent, Divider, Chip } from "@mui/material";
import PeopleIcon from '@mui/icons-material/People';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface LowStockItem {
    item_id: number;
    product_name: string;
    total_stock: number;
    low_stock_total: number;
}

interface Props {
    sessionsCount: number;
    customersCount: number;
    productsCount: number;
    activeVariantsCount: number;
    lowStockItems: LowStockItem[];
}

export default function Dashboard({
    sessionsCount,
    customersCount,
    productsCount,
    activeVariantsCount,
    lowStockItems
}: Props) {

    // Helper for Stat Cards
    const StatCard = ({ title, value, icon, color }: any) => (
        <Paper elevation={0} sx={{
            p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
            <Box>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {title}
                </Typography>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
                    {value}
                </Typography>
            </Box>
            <Box sx={{ bgcolor: `${color}.main`, p: 1.5, borderRadius: '10px', color: 'white', display: 'flex' }}>
                {icon}
            </Box>
        </Paper>
    );

    return (
        <Box sx={{ p: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
                Admin Dashboard
            </Typography>

            {/* Statistics Row using Box Grid */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' },
                gap: 3,
                mb: 4
            }}>
                <StatCard
                    title="Active Sessions" value={sessionsCount}
                    icon={<MonitorHeartIcon />} color="success"
                />
                <StatCard
                    title="Total Customers" value={customersCount}
                    icon={<PeopleIcon />} color="primary"
                />
                <StatCard
                    title="Active Products" value={productsCount}
                    icon={<ShoppingBagIcon />} color="info"
                />
                <StatCard
                    title="Total Variants" value={activeVariantsCount}
                    icon={<ShoppingBagIcon />} color="secondary"
                />
            </Box>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
                gap: 3
            }}>
                {/* Low Stock Section */}
                <Paper sx={{ p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                        <WarningAmberIcon color="warning" />
                        <Typography variant="h6" fontWeight={600}>Low Stock Alerts</Typography>
                    </Stack>
                    <Divider sx={{ mb: 2 }} />

                    {lowStockItems.length > 0 ? (
                        lowStockItems.map((item) => (
                            <Box key={item.item_id} sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
                                '&:last-child': { borderBottom: 'none' }
                            }}>
                                <Typography variant="body1" fontWeight={500}>{item.product_name}</Typography>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Typography variant="body2" color="text.secondary">
                                        Remaining: {item.total_stock}
                                    </Typography>
                                    <Chip label="Refill Needed" size="small" color="error" variant="outlined" />
                                </Stack>
                            </Box>
                        ))
                    ) : (
                        <Typography color="text.secondary">All items are sufficiently stocked.</Typography>
                    )}
                </Paper>

                {/* Welcome / System Info */}
                <Paper sx={{ p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Typography variant="h6" fontWeight={600} mb={2}>System Status</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Welcome to the Duka Commerce Ledger. All systems are currently operational.
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

// Adding Stack to the import at the top
import { Stack } from "@mui/material";

Dashboard.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Admin Dashboard"/>
        {page}
    </AdminLayout>
);
