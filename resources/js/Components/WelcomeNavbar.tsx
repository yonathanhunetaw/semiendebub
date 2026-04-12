import React, { useState } from 'react';
import { AppBar, Toolbar, Button, Box, Popover, Typography, Container } from '@mui/material';
import Grid from '@mui/material/Grid'; // MUI v6 standard
import { Link } from '@inertiajs/react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

export default function WelcomeNavbar() {
    const [anchors, setAnchors] = useState<{ [key: string]: HTMLElement | null }>({
        solutions: null,
        resources: null,
        platform: null
    });

    const handleOpen = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
        setAnchors({ ...anchors, [key]: e.currentTarget });
    };

    const handleClose = () => setAnchors({ solutions: null, resources: null, platform: null });

    const menuStyles = {
        width: 600, p: 3, mt: 2, borderRadius: 4, bgcolor: '#fdfbd4',
        boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid #c05800'
    };

    return (
        <AppBar position="fixed" sx={{ bgcolor: '#38240d', height: 72, justifyContent: 'center', borderBottom: '2px solid #c05800' }}>
            <Container sx={{ maxWidth: 1337 }}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="h5" component={Link} href="/" sx={{ fontWeight: 900, color: '#fdfbd4', textDecoration: 'none' }}>
                        SEMIENDEBUB
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {/* SOLUTIONS DROPDOWN */}
                        <Button onClick={handleOpen('solutions')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>
                            Inventory
                        </Button>

                        {/* RESOURCES DROPDOWN */}
                        <Button onClick={handleOpen('resources')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>
                            Commercial
                        </Button>

                        {/* PLATFORM DROPDOWN */}
                        <Button onClick={handleOpen('platform')} endIcon={<KeyboardArrowDownIcon />} sx={{ color: '#fdfbd4', fontWeight: 600 }}>
                            Operations
                        </Button>

                        <Button sx={{ color: '#fdfbd4', fontWeight: 600 }}>Pricing</Button>
                        <Button sx={{ color: '#fdfbd4', fontWeight: 600 }}>About</Button>
                    </Box>

                    <Button variant="contained" sx={{ bgcolor: '#c05800', color: '#fdfbd4', borderRadius: '50px', px: 3, fontWeight: 700 }}>
                        Get Started
                    </Button>

                    {/* --- INVENTORY MENU --- */}
                    <Popover open={Boolean(anchors.solutions)} anchorEl={anchors.solutions} onClose={handleClose} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}} PaperProps={{ sx: menuStyles }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}><MenuCard title="Items & Variants" href="/items" desc="Manage product catalog and variations." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Stock Levels" href="/stock" desc="Real-time inventory tracking." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Transfers" href="/transfers" desc="Move goods between warehouses." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Pricing Control" href="/prices" desc="Global price list management." /></Grid>
                        </Grid>
                    </Popover>

                    {/* --- COMMERCIAL MENU --- */}
                    <Popover open={Boolean(anchors.resources)} anchorEl={anchors.resources} onClose={handleClose} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}} PaperProps={{ sx: menuStyles }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}><MenuCard title="Sales & Orders" href="/sales" desc="Process customer transactions." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Discounts" href="/discounts" desc="Campaigns and promotional rates." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Delivery" href="/delivery" desc="Logistics and fleet dispatch." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Purchase Orders" href="/purchase-orders" desc="Procurement from suppliers." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Payments" href="/payments" desc="Transaction and gateway logs." /></Grid>
                        </Grid>
                    </Popover>

                    {/* --- OPERATIONS MENU --- */}
                    <Popover open={Boolean(anchors.platform)} anchorEl={anchors.platform} onClose={handleClose} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}} PaperProps={{ sx: menuStyles }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}><MenuCard title="Financial Balance" href="/balance" desc="Ledger and cash flow overview." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Documents" href="/documents" desc="Digital archive and filings." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Calendar" href="/calendar" desc="Schedule shipments and tasks." /></Grid>
                            <Grid size={{ xs: 6 }}><MenuCard title="Tasks" href="/tasks" desc="Assign internal staff duties." /></Grid>
                        </Grid>
                    </Popover>
                </Toolbar>
            </Container>
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
