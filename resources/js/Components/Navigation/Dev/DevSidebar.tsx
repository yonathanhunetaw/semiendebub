import React from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material';
import { Link, usePage } from '@inertiajs/react';
import TerminalIcon from '@mui/icons-material/Terminal';
import PsychologyIcon from '@mui/icons-material/Psychology';
import StorageIcon from '@mui/icons-material/Storage';

export default function DevSidebar({ variant, open, onClose, sx }: any) {
    const { url } = usePage();

    const menuItems = [
        { label: 'Dashboard', icon: <TerminalIcon />, href: '/dev/dashboard' },
        { label: 'ML Lessons', icon: <PsychologyIcon />, href: '/dev/lessons' },
        { label: 'System Lab', icon: <StorageIcon />, href: '/dev/shipments' },
    ];

    return (
        <Drawer variant={variant} open={open} onClose={onClose} sx={sx} PaperProps={{ sx: { width: 260 } }}>
            <Toolbar>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 900 }}>
                    DEV_OS
                </Typography>
            </Toolbar>
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.label} disablePadding>
                        <ListItemButton
                            component={Link}
                            href={item.href}
                            selected={url.startsWith(item.href)}
                        >
                            <ListItemIcon>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.label} primaryTypographyProps={{ fontFamily: 'monospace' }} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}
