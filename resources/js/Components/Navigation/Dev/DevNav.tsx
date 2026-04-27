import * as React from 'react';
import { AppBar, IconButton, Toolbar, Typography, Stack, Box, useTheme } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TerminalIcon from '@mui/icons-material/Terminal';
import ColorModeIconDropdown from '@/theme/ColorModeIconDropdown';

interface DevNavProps {
    onMenuClick: () => void;
}

export default function DevNav({ onMenuClick }: DevNavProps) {
    const theme = useTheme();

    return (
        <AppBar
            position="fixed"
            sx={{
                width: { xl: `calc(100% - 260px)` },
                ml: { xl: `260px` },
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderBottom: '1px solid',
                borderColor: 'divider',
                elevation: 0,
                boxShadow: 'none',
            }}
        >
            <Toolbar sx={{ justifyContent: 'space-between' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={onMenuClick}
                        sx={{ mr: 2, display: { xl: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>

                    {/* Dev Brand Logo/Icon */}
                    <TerminalIcon sx={{ color: 'primary.main', display: { xs: 'none', sm: 'block' } }} />
                    <Typography
                        variant="h6"
                        noWrap
                        component="div"
                        sx={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            letterSpacing: '.1rem'
                        }}
                    >
                        DEV_WORKSPACE
                    </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={2}>
                    {/* Search or other dev tools could go here */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                display: { xs: 'none', md: 'block' },
                                fontFamily: 'monospace',
                                bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
                                px: 1,
                                borderRadius: 1
                            }}
                        >
                            v1.0.4-stable
                        </Typography>
                        <ColorModeIconDropdown />
                    </Box>
                </Stack>
            </Toolbar>
        </AppBar>
    );
}
