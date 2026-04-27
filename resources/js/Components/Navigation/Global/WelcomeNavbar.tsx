import React, { useState } from 'react';
import {
    AppBar, Toolbar, Button, Box, Popover, Typography, Container,
    IconButton, Drawer, List, ListItem, ListItemButton, ListItemText, Collapse
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Link } from '@inertiajs/react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

export default function WelcomeNavbar() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Desktop Popover States
    const [anchors, setAnchors] = useState<{ [key: string]: HTMLElement | null }>({
        solutions: null,
        resources: null,
        platform: null
    });

    // Mobile Drawer States
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

    const handleOpen = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
        setAnchors({ ...anchors, [key]: e.currentTarget });
    };

    const handleClose = () => setAnchors({ solutions: null, resources: null, platform: null });

    const toggleDrawer = (open: boolean) => () => setMobileOpen(open);

    const handleMobileExpand = (key: string) => {
        setMobileExpanded(mobileExpanded === key ? null : key);
    };

    const menuStyles = {
        width: 600, p: 3, mt: 2, borderRadius: 4, bgcolor: '#fdfbd4',
        boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid #c05800'
    };

    return (
<AppBar
    position="fixed"
    sx={{
        bgcolor: 'rgba(0, 0, 0, 0.8)', // Deep black with slight transparency
        backdropFilter: 'blur(10px)',   // Keeps the "glass" effect
        height: 72,
        justifyContent: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)', // Subtle border for definition
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8)'           // Darker shadow
    }}
>
            <Container sx={{ maxWidth: 1337 }}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="h5" component={Link} href="/" sx={{ fontWeight: 900, color: '#fdfbd4', textDecoration: 'none' }}>
                        SEMIEN DEBUB
                    </Typography>

                    {/* --- DESKTOP MENU --- */}
                    {!isMobile && (
                        <>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button onClick={handleOpen('solutions')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>Inventory</Button>
                                <Button onClick={handleOpen('resources')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>Commercial</Button>
                                <Button onClick={handleOpen('platform')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>Operations</Button>
                                <Button sx={{ color: '#fdfbd4', fontWeight: 600 }}>Pricing</Button>
                                <Button sx={{ color: '#fdfbd4', fontWeight: 600 }}>About</Button>
                            </Box>
                            <Button
                                component={Link}
                                href={route('login')}
                                variant="contained"
                                sx={{
                                    bgcolor: '#c05800',
                                    color: '#fdfbd4',
                                    borderRadius: '50px',
                                    px: 3,
                                    fontWeight: 700,
                                    '&:hover': { bgcolor: '#e06a00' }
                                }}
                            >
                                Get Started
                            </Button>
                        </>
                    )}

                    {/* --- MOBILE HAMBURGER ICON --- */}
                    {isMobile && (
                        <IconButton onClick={toggleDrawer(true)} sx={{ color: '#fdfbd4' }}>
                            <MenuIcon fontSize="large" />
                        </IconButton>
                    )}

                    {/* --- DESKTOP POPOVERS (Existing Logic) --- */}
                    <Popover open={Boolean(anchors.solutions)} anchorEl={anchors.solutions} onClose={handleClose} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}} PaperProps={{ sx: menuStyles }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}><MenuCard title="Items & Variants" href="/items" desc="Manage product catalog." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Stock Levels" href="/stock" desc="Real-time tracking." /></Grid>
                        </Grid>
                    </Popover>
                    {/* ... (Keep other Popovers same as your original code) */}

                </Toolbar>
            </Container>

            {/* --- MOBILE DRAWER --- */}
            <Drawer anchor="right" open={mobileOpen} onClose={toggleDrawer(false)} PaperProps={{ sx: { width: 280, bgcolor: '#fdfbd4' } }}>
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Typography variant="h6" sx={{ color: '#38240d', fontWeight: 900, mb: 2 }}>MENU</Typography>
                    <List>
                        {/* Mobile Inventory */}
                        <ListItemButton onClick={() => handleMobileExpand('inventory')}>
                            <ListItemText primary="Inventory" sx={{ fontWeight: 700 }} />
                            {mobileExpanded === 'inventory' ? <ExpandLess /> : <ExpandMore />}
                        </ListItemButton>
                        <Collapse in={mobileExpanded === 'inventory'} timeout="auto" unmountOnExit>
                            <List component="div" disablePadding sx={{ pl: 4 }}>
                                <ListItemButton component={Link} href="/items"><ListItemText primary="Items & Variants" /></ListItemButton>
                                <ListItemButton component={Link} href="/stock"><ListItemText primary="Stock Levels" /></ListItemButton>
                            </List>
                        </Collapse>

                        {/* Repeat similar Collapse blocks for Commercial and Operations */}

                        <ListItemButton component={Link} href="/pricing"><ListItemText primary="Pricing" /></ListItemButton>
                        <ListItemButton component={Link} href="/about"><ListItemText primary="About" /></ListItemButton>
                    </List>

                    <Box sx={{ mt: 'auto', pt: 2 }}>
                        <Button
                            component={Link}
                            href={route('login')}
                            variant="contained"
                            fullWidth
                            sx={{
                                bgcolor: '#c05800',
                                color: '#fdfbd4',
                                borderRadius: '50px',
                                fontWeight: 700,
                                '&:hover': { bgcolor: '#e06a00' }
                            }}
                        >
                            Get Started
                        </Button>
                    </Box>
                </Box>
            </Drawer>
        </AppBar>
    );
}

function MenuCard({ title, href, desc }: { title: string, href: string, desc: string }) {
    return (
        <Box component={Link} href={href} sx={{ p: 2, borderRadius: 2, textDecoration: 'none', '&:hover': { bgcolor: '#c0580015' } }}>
            <Typography sx={{ fontWeight: 800, color: '#38240d' }}>{title}</Typography>
            <Typography variant="body2" sx={{ color: '#713600' }}>{desc}</Typography>
        </Box>
    );
}
