import * as React from 'react';
import {
    Box,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
} from '@mui/material';
import { Link, usePage } from '@inertiajs/react';
import TerminalIcon from '@mui/icons-material/Terminal';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DevicesIcon from '@mui/icons-material/Devices';
import PsychologyIcon from '@mui/icons-material/Psychology';
import PaletteIcon from '@mui/icons-material/Palette';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLongRounded';
import InventoryIcon from '@mui/icons-material/Inventory2Rounded';
import DownloadIcon from '@mui/icons-material/Download';
import type { SxProps, Theme } from '@mui/material/styles';

import { activeDevHref, DEV_NAVIGATION, DevNavIcon } from './devNavigation';

const ICONS: Record<DevNavIcon, React.ReactElement> = {
    terminal: <TerminalIcon />,
    architecture: <AccountTreeIcon />,
    shipments: <LocalShippingIcon />,
    sessions: <DevicesIcon />,
    lesson: <PsychologyIcon />,
    colors: <PaletteIcon />,
    box: <CropSquareIcon />,
    libraries: <InventoryIcon />,
    logs: <ReceiptLongIcon />,
    download: <DownloadIcon />,
};

interface DevSidebarProps {
    variant: 'permanent' | 'temporary';
    open: boolean;
    onClose: () => void;
    sx?: SxProps<Theme>;
}

export default function DevSidebar({ variant, open, onClose, sx }: DevSidebarProps): React.ReactElement {
    const { url } = usePage();
    const active = activeDevHref(url);

    return (
        <Drawer
            variant={variant}
            open={open}
            onClose={onClose}
            sx={sx}
            slotProps={{ paper: { sx: { width: 260 } } }}
        >
            <Toolbar>
                <Box
                    component={Link}
                    href="/dashboard"
                    sx={{ textDecoration: 'none', color: 'inherit' }}
                >
                    <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 900, lineHeight: 1 }}>
                        DEV_OS
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                        workspace
                    </Typography>
                </Box>
            </Toolbar>

            <Divider />

            <Box sx={{ overflowY: 'auto', pb: 2 }}>
                {DEV_NAVIGATION.map((group) => (
                    <List
                        key={group.title}
                        dense
                        subheader={
                            <Typography
                                variant="caption"
                                sx={{
                                    px: 2,
                                    pt: 1.5,
                                    pb: 0.5,
                                    display: 'block',
                                    color: 'text.secondary',
                                    fontWeight: 800,
                                    letterSpacing: 1,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {group.title}
                            </Typography>
                        }
                    >
                        {group.items.map((item) => {
                            const linkProps = item.external
                                ? { component: 'a' as const, href: item.href }
                                : { component: Link, href: item.href };

                            return (
                                <ListItem key={item.href} disablePadding>
                                    <ListItemButton
                                        {...linkProps}
                                        selected={active === item.href}
                                        onClick={variant === 'temporary' ? onClose : undefined}
                                        sx={{ borderRadius: 1, mx: 1, py: 0.6 }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 38, color: active === item.href ? 'primary.main' : undefined }}>
                                            {ICONS[item.icon]}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.label}
                                            secondary={item.description}
                                            slotProps={{
                                                primary: { sx: { fontFamily: 'monospace', fontSize: 13, fontWeight: 600 } },
                                                secondary: { sx: { fontSize: 10.5 } },
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                    </List>
                ))}
            </Box>
        </Drawer>
    );
}
