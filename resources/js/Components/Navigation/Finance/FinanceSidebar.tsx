import * as React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Divider } from '@mui/material';
import { Link, usePage } from '@inertiajs/react';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'; // For Dashboard
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange'; // For ROI/Crypto
import AssessmentIcon from '@mui/icons-material/Assessment'; // For Reports
import SavingsIcon from '@mui/icons-material/Savings'; // For Gold tracking

export default function FinanceSidebar({ variant, open, onClose, sx }: any) {
    const { url } = usePage();

    const menuItems = [
        { label: 'Ledger Home', icon: <AccountBalanceIcon />, href: '/finance/dashboard' },
        { label: 'ROI & Analytics', icon: <CurrencyExchangeIcon />, href: '/finance/analytics' },
        { label: 'Gold & Crypto', icon: <SavingsIcon />, href: '/finance/assets' },
        { label: 'Reports', icon: <AssessmentIcon />, href: '/finance/reports' },
    ];

    return (
        <Drawer variant={variant} open={open} onClose={onClose} sx={sx} PaperProps={{ sx: { width: 260 } }}>
            <Toolbar>
                <Typography variant="h6" sx={{ fontWeight: 900, color: 'success.main', letterSpacing: 1 }}>
                    DUKA_FINANCE
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
                                '&.Mui-selected': {
                                    borderLeft: '4px solid',
                                    borderColor: 'success.main',
                                    bgcolor: 'success.lighter' // If your theme has this, or use 'action.selected'
                                }
                            }}
                        >
                            <ListItemIcon sx={{ color: url.startsWith(item.href) ? 'success.main' : 'inherit' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
