import * as React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Divider } from '@mui/material';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CampaignIcon from '@mui/icons-material/Campaign';

export default function MarketingSidebar({ variant, open, onClose, sx }: any) {
    const { url } = usePage();

    const menuItems = [
        { label: 'Dashboard', icon: <DashboardIcon />, href: '/dashboard' },
        { label: 'Campaigns', icon: <CampaignIcon />, href: '/campaigns' },
    ];

    return (
        <Drawer variant={variant} open={open} onClose={onClose} sx={sx} PaperProps={{ sx: { width: 260 } }}>
            <Toolbar>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 1 }}>
                    DUKA_MARKETING
                </Typography>
            </Toolbar>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.label} disablePadding>
                        <ListItemButton component={Link} href={item.href} selected={url.startsWith(item.href)}>
                            <ListItemIcon sx={{ color: url.startsWith(item.href) ? 'primary.main' : 'inherit' }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
