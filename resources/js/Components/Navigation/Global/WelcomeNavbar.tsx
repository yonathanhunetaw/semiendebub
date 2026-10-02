import React, { useState } from 'react';
import {
    AppBar, Toolbar, Button, Box, Popover, Typography, Container,
    IconButton, Drawer, List, ListItemButton, ListItemText, Collapse, Divider
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Link } from '@inertiajs/react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/** Shared palette for the public (unauthenticated) marketing shell. */
const BRAND = {
    accent: '#c05800',
    accentHover: '#e06a00',
    cream: '#fdfbd4',
    ink: '#1a120b',
    inkSoft: '#713600',
    panel: '#fdfbd4',
};

interface NavItem {
    title: string;
    desc: string;
    href: string;
}

interface NavGroup {
    key: string;
    label: string;
    items: NavItem[];
}

/**
 * Menu groups mirror the role/module split of the ERP itself
 * (see config/subdomains.php). Links point at landing-page sections
 * because the real module routes sit behind auth.
 */
const NAV_GROUPS: NavGroup[] = [
    {
        key: 'operations',
        label: 'Operations',
        items: [
            { title: 'Items & Variants', desc: 'One catalogue for every SKU and option.', href: '#inventory' },
            { title: 'Stock & Warehouses', desc: 'Live quantities, alerts and transfers.', href: '#inventory' },
            { title: 'Procurement', desc: 'Purchase orders, vendors and replenishment.', href: '#procurement' },
            { title: 'Delivery & Freight', desc: 'Shipments dispatched and tracked to the door.', href: '#delivery' },
        ],
    },
    {
        key: 'commerce',
        label: 'Commerce',
        items: [
            { title: 'Sales & Carts', desc: 'Counter sales, quotes and order fulfilment.', href: '#sales' },
            { title: 'Multi-Store', desc: 'Run every branch from a single registry.', href: '#stores' },
            { title: 'Online Store', desc: 'A public storefront wired to the same stock.', href: '#storefront' },
            { title: 'Customers', desc: 'Accounts, history and credit in one place.', href: '#sales' },
        ],
    },
    {
        key: 'company',
        label: 'Company',
        items: [
            { title: 'Finance', desc: 'Balances, purchases and reporting.', href: '#finance' },
            { title: 'Marketing & PR', desc: 'Campaigns, outreach and announcements.', href: '#marketing' },
            { title: 'Attendance & Activity', desc: 'Who worked, who shipped, what changed.', href: '#workforce' },
            { title: 'Roles & Access', desc: 'Per-department subdomains and permissions.', href: '#roles' },
        ],
    },
];

export default function WelcomeNavbar() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [anchors, setAnchors] = useState<Record<string, HTMLElement | null>>({});
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

    const handleOpen = (key: string) => (e: React.MouseEvent<HTMLElement>) =>
        setAnchors({ [key]: e.currentTarget });

    const handleClose = () => setAnchors({});

    const toggleDrawer = (open: boolean) => () => setMobileOpen(open);

    const handleMobileExpand = (key: string) =>
        setMobileExpanded(mobileExpanded === key ? null : key);

    const menuStyles = {
        width: 620, p: 3, mt: 2, borderRadius: 4, bgcolor: BRAND.panel,
        boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.5)', border: `1px solid ${BRAND.accent}`,
    };

    return (
        <AppBar
            position="fixed"
            sx={{
                bgcolor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(10px)',
                height: 72,
                justifyContent: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8)',
            }}
        >
            <Container sx={{ maxWidth: '1337px !important' }}>
                <Toolbar disableGutters sx={{ justifyContent: 'space-between', gap: 2 }}>
                    {/* --- BRAND --- */}
                    <Box
                        component={Link}
                        href="/"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textDecoration: 'none', flexShrink: 0 }}
                    >
                        <Box
                            sx={{
                                width: 36, height: 36, borderRadius: '10px',
                                display: 'grid', placeItems: 'center',
                                bgcolor: BRAND.accent, color: BRAND.cream,
                                fontWeight: 900, fontSize: 15, letterSpacing: '-0.5px',
                            }}
                        >
                            መዝ
                        </Box>
                        <Box sx={{ lineHeight: 1 }}>
                            <Typography
                                component="span"
                                sx={{ display: 'block', fontWeight: 900, color: BRAND.cream, fontSize: '1.05rem', letterSpacing: '0.5px' }}
                            >
                                MEZGEBE DIRIJIT
                            </Typography>
                            <Typography
                                component="span"
                                sx={{ display: 'block', fontSize: '0.65rem', color: 'rgba(253,251,212,0.55)', letterSpacing: '0.18em', textTransform: 'uppercase' }}
                            >
                                Business Registry
                            </Typography>
                        </Box>
                    </Box>

                    {/* --- DESKTOP MENU --- */}
                    {!isMobile && (
                        <>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                {NAV_GROUPS.map((group) => (
                                    <Button
                                        key={group.key}
                                        onClick={handleOpen(group.key)}
                                        endIcon={<KeyboardArrowDownIcon />}
                                        sx={{ color: BRAND.cream, fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
                                    >
                                        {group.label}
                                    </Button>
                                ))}
                                <Button
                                    component="a"
                                    href="#about"
                                    sx={{ color: BRAND.cream, fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
                                >
                                    About
                                </Button>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                                <Button
                                    component={Link}
                                    href={route('login')}
                                    sx={{
                                        color: BRAND.cream, fontWeight: 700, textTransform: 'none',
                                        '&:hover': { color: BRAND.accentHover },
                                    }}
                                >
                                    Log in
                                </Button>
                                <Button
                                    component={Link}
                                    href={route('register')}
                                    variant="contained"
                                    disableElevation
                                    sx={{
                                        bgcolor: BRAND.accent, color: BRAND.cream,
                                        borderRadius: '50px', px: 3, fontWeight: 700, textTransform: 'none',
                                        '&:hover': { bgcolor: BRAND.accentHover },
                                    }}
                                >
                                    Sign up
                                </Button>
                            </Box>
                        </>
                    )}

                    {/* --- MOBILE HAMBURGER --- */}
                    {isMobile && (
                        <IconButton onClick={toggleDrawer(true)} aria-label="Open menu" sx={{ color: BRAND.cream }}>
                            <MenuIcon fontSize="large" />
                        </IconButton>
                    )}

                    {/* --- DESKTOP POPOVERS --- */}
                    {NAV_GROUPS.map((group) => (
                        <Popover
                            key={group.key}
                            open={Boolean(anchors[group.key])}
                            anchorEl={anchors[group.key]}
                            onClose={handleClose}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                            slotProps={{ paper: { sx: menuStyles } }}
                        >
                            <Grid container spacing={1}>
                                {group.items.map((item) => (
                                    <Grid size={{ xs: 6 }} key={item.title}>
                                        <MenuCard {...item} onNavigate={handleClose} />
                                    </Grid>
                                ))}
                            </Grid>
                        </Popover>
                    ))}
                </Toolbar>
            </Container>

            {/* --- MOBILE DRAWER --- */}
            <Drawer
                anchor="right"
                open={mobileOpen}
                onClose={toggleDrawer(false)}
                slotProps={{ paper: { sx: { width: 300, bgcolor: BRAND.panel } } }}
            >
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography sx={{ color: BRAND.ink, fontWeight: 900, letterSpacing: 1 }}>
                            MEZGEBE DIRIJIT
                        </Typography>
                        <IconButton onClick={toggleDrawer(false)} aria-label="Close menu" sx={{ color: BRAND.ink }}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Divider sx={{ borderColor: 'rgba(192,88,0,0.25)', mb: 1 }} />

                    <List sx={{ overflowY: 'auto' }}>
                        {NAV_GROUPS.map((group) => (
                            <React.Fragment key={group.key}>
                                <ListItemButton onClick={() => handleMobileExpand(group.key)}>
                                    <ListItemText
                                        primary={group.label}
                                        slotProps={{ primary: { sx: { fontWeight: 700, color: BRAND.ink } } }}
                                    />
                                    {mobileExpanded === group.key ? <ExpandLess /> : <ExpandMore />}
                                </ListItemButton>
                                <Collapse in={mobileExpanded === group.key} timeout="auto" unmountOnExit>
                                    <List component="div" disablePadding sx={{ pl: 2 }}>
                                        {group.items.map((item) => (
                                            <ListItemButton
                                                key={item.title}
                                                component="a"
                                                href={item.href}
                                                onClick={toggleDrawer(false)}
                                            >
                                                <ListItemText
                                                    primary={item.title}
                                                    slotProps={{ primary: { sx: { color: BRAND.inkSoft, fontSize: '0.9rem' } } }}
                                                />
                                            </ListItemButton>
                                        ))}
                                    </List>
                                </Collapse>
                            </React.Fragment>
                        ))}

                        <ListItemButton component="a" href="#about" onClick={toggleDrawer(false)}>
                            <ListItemText
                                primary="About"
                                slotProps={{ primary: { sx: { fontWeight: 700, color: BRAND.ink } } }}
                            />
                        </ListItemButton>
                    </List>

                    <Box sx={{ mt: 'auto', pt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Button
                            component={Link}
                            href={route('register')}
                            variant="contained"
                            fullWidth
                            disableElevation
                            sx={{
                                bgcolor: BRAND.accent, color: BRAND.cream, borderRadius: '50px',
                                fontWeight: 700, textTransform: 'none', py: 1.2,
                                '&:hover': { bgcolor: BRAND.accentHover },
                            }}
                        >
                            Sign up
                        </Button>
                        <Button
                            component={Link}
                            href={route('login')}
                            variant="outlined"
                            fullWidth
                            sx={{
                                color: BRAND.accent, borderColor: BRAND.accent, borderRadius: '50px',
                                fontWeight: 700, textTransform: 'none', py: 1.2,
                                '&:hover': { borderColor: BRAND.accentHover, bgcolor: 'rgba(192,88,0,0.08)' },
                            }}
                        >
                            Log in
                        </Button>
                    </Box>
                </Box>
            </Drawer>
        </AppBar>
    );
}

function MenuCard({ title, href, desc, onNavigate }: NavItem & { onNavigate?: () => void }) {
    return (
        <Box
            component="a"
            href={href}
            onClick={onNavigate}
            sx={{
                display: 'block', p: 2, borderRadius: 2, textDecoration: 'none',
                transition: 'background-color 150ms ease',
                '&:hover': { bgcolor: 'rgba(192,88,0,0.09)' },
            }}
        >
            <Typography sx={{ fontWeight: 800, color: '#38240d' }}>{title}</Typography>
            <Typography variant="body2" sx={{ color: BRAND.inkSoft }}>{desc}</Typography>
        </Box>
    );
}
