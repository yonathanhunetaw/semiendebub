import React, { useState } from 'react';
import MenuIcon from '@mui/icons-material/Menu';
import {
    AppBar,
    Avatar,
    Box,
    IconButton,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from '@mui/material';
import { Link, router, usePage } from '@inertiajs/react';

const drawerWidth = 260;

export default function AdminNav({ onMenuClick }: { onMenuClick?: () => void }) {
    const { auth } = usePage().props as any;
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const menuOpen = Boolean(anchorEl);

    return (
        <AppBar
            position="fixed"
            color="default"
            elevation={0}
            sx={{
                borderBottom: '1px solid',
                borderColor: 'divider',
                // CHANGE: Use 'lg' (1200px) instead of 'xl'.
                // This ensures the Nav shrinks when the sidebar is visible.
                width: { lg: `calc(100% - ${drawerWidth}px)` },
                ml: { lg: `${drawerWidth}px` },
                bgcolor: 'background.paper',
                color: 'text.primary',
            }}
        >
            <Toolbar>
                <IconButton
                    color="inherit"
                    aria-label="open drawer"
                    edge="start"
                    onClick={onMenuClick}
                    // CHANGE: Display on mobile (xs) and hide on desktop (lg)
                    sx={{ mr: 2, display: { xs: 'inline-flex', lg: 'none' } }}
                >
                    <MenuIcon />
                </IconButton>

                <Box component={Link} href="/dashboard" sx={{ textDecoration: 'none', color: 'inherit' }}>
                    <Typography variant="h6" noWrap component="div">
                        Mezgebe Dirijit
                    </Typography>
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                        <Typography variant="subtitle2" sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                            {auth?.user?.first_name || auth?.user?.name || 'User'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {auth?.user?.email || ''}
                        </Typography>
                    </Box>
                    <IconButton
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                        size="small"
                        sx={{ ml: 1 }}
                    >
                        <Avatar sx={{ width: 32, height: 32 }}>
                            {(auth?.user?.first_name || auth?.user?.name || 'U').charAt(0)}
                        </Avatar>
                    </IconButton>
                    <Menu
                        id="admin-account-menu"
                        anchorEl={anchorEl}
                        open={menuOpen}
                        onClose={() => setAnchorEl(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                        <MenuItem component={Link} href="/profile" onClick={() => setAnchorEl(null)}>
                            Profile
                        </MenuItem>
                        <MenuItem component={Link} href="/admin/settings" onClick={() => setAnchorEl(null)}>
                            Settings
                        </MenuItem>
                        <MenuItem
                            onClick={() => {
                                setAnchorEl(null);
                                router.post('/logout');
                            }}
                        >
                            Sign out
                        </MenuItem>
                    </Menu>
                </Box>
            </Toolbar>
        </AppBar>
    );
}
