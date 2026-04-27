import * as React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Divider } from '@mui/material';
import { Link, usePage } from '@inertiajs/react';
import HubIcon from '@mui/icons-material/Hub';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';

export default function SharedSidebar({ variant, open, onClose, sx }: any) {
    const { url } = usePage();

    const menuItems = [
        { label: 'Common Hub', icon: <HubIcon />, href: '/shared/dashboard' },
        { label: 'Resources', icon: <FolderSharedIcon />, href: '/shared/resources' },
        { label: 'Integrations', icon: <SettingsInputComponentIcon />, href: '/shared/tools' },
    ];

    return (
        <Drawer variant={variant} open={open} onClose={onClose} sx={sx} PaperProps={{ sx: { width: 260 } }}>
            <Toolbar>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 1 }}>
                    SHARED_RESOURCES
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
                        >
                            <ListItemIcon sx={{ color: url.startsWith(item.href) ? 'primary.main' : 'inherit' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.label} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
