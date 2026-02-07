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
                width: { xl: `calc(100% - ${drawerWidth}px)` },
                ml: { xl: `${drawerWidth}px` },
                backgroundColor: 'background.paper',
            }}
        >
            <Toolbar>
                <IconButton
                    color="inherit"
                    aria-label="open drawer"
                    edge="start"
                    onClick={onMenuClick}
                    sx={{ mr: 2, display: { xs: 'inline-flex', xl: 'none' } }}
                >
                    <MenuIcon />
                </IconButton>
                <Box component={Link} href="/admin/dashboard" sx={{ textDecoration: 'none', color: 'inherit' }}>
                    <Typography variant="h6" noWrap component="div">
                        Mezgebe Dirijit
                    </Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                            {auth?.user?.first_name || auth?.user?.name || 'User'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {auth?.user?.email || ''}
                        </Typography>
                    </Box>
                    <IconButton
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                        size="small"
                        sx={{ ml: 1 }}
                        aria-controls={menuOpen ? 'admin-account-menu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={menuOpen ? 'true' : undefined}
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
