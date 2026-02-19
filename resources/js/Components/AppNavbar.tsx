import * as React from 'react';
import { Link } from '@inertiajs/react'; // Add this
import { route } from 'ziggy-js';       // Add this
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuIcon from '@mui/icons-material/Menu';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import AdbIcon from '@mui/icons-material/Adb';

// Define the props interface
interface AppNavbarProps {
    auth: any;
}

const pages = [
    { name: 'Services', url: '/services' },
    { name: 'Pricing', url: '/pricing' },
    { name: 'Blog', url: '/blog' },
];

function AppNavbar({ auth }: AppNavbarProps) {
    const [anchorElNav, setAnchorElNav] = React.useState<null | HTMLElement>(null);
    const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null);

    const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorElNav(event.currentTarget);
    const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorElUser(event.currentTarget);
    const handleCloseNavMenu = () => setAnchorElNav(null);
    const handleCloseUserMenu = () => setAnchorElUser(null);

    return (
        <AppBar position="static" sx={{ backgroundColor: '#1f2937' }}>
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    {/* Mobile Menu */}
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
                            <IconButton onClick={handleOpenNavMenu} color="inherit">
                                <MenuIcon />
                            </IconButton>
                            <Menu
                                anchorEl={anchorElNav}
                                open={Boolean(anchorElNav)}
                                onClose={handleCloseNavMenu}
                                sx={{ display: { xs: 'block', md: 'none' } }}
                            >
                                {pages.map((page) => (
                                    <MenuItem
                                        key={page.name}
                                        onClick={handleCloseNavMenu}
                                        component={Link}
                                        href={page.url} // Now this works!
                                    >
                                        <Typography textAlign="center">{page.name}</Typography>
                                    </MenuItem>
                                ))}
                            </Menu>
                        </Box>

                        <AdbIcon sx={{ display: 'flex', mr: 1, ml: { xs: 1, md: 0 } }} />
                        <Typography
                            variant="h6"
                            noWrap
                            component={Link}
                            href="/"
                            sx={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                letterSpacing: '.3rem',
                                color: 'inherit',
                                textDecoration: 'none',
                                mr: 2
                            }}
                        >
                            ሱሜሪያን
                        </Typography>
                    </Box>
                    {/* SPACER 1: Pushes the Desktop Links to the center/right */}
                    <Box sx={{ flexGrow: { xs: 1, md: 1 } }} />

                    {/* 2. MIDDLE: Desktop Navigation Links */}
                    <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
                        {pages.map((page) => (
                            <Button
                                key={page.url}
                                component={Link} // Use Inertia Link for SPA navigation
                                href={page.url}   // Points to the URL in your object
                                onClick={handleCloseNavMenu}
                                sx={{ my: 2, color: 'white', display: 'block' }}
                            >
                                {page.name}
                            </Button>
                        ))}
                    </Box>
                    {/* SPACER 2: Pushes the Avatar to the far right on desktop */}
                    <Box sx={{ flexGrow: { xs: 0, md: 1 } }} />


                    {/* User / Auth Dropdown */}
                    <Box sx={{ flexGrow: 0 }}>
                        <Tooltip title="Open account">
                            <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                                <Avatar alt={auth.user?.name || 'Guest'} src={auth.user?.profile_photo_url || ""} />
                            </IconButton>
                        </Tooltip>
                        <Menu sx={{ mt: '45px' }} anchorEl={anchorElUser} open={Boolean(anchorElUser)} onClose={handleCloseUserMenu}>
                            {auth.user ? (
                                // Logged In Links
                                [
                                    <MenuItem key="dash" onClick={handleCloseUserMenu} component={Link} href={route('dashboard')}>
                                        <Typography textAlign="center">Dashboard</Typography>
                                    </MenuItem>,
                                    <MenuItem key="logout" onClick={handleCloseUserMenu} component={Link} href={route('logout')} method="post" as="button">
                                        <Typography textAlign="center">Logout</Typography>
                                    </MenuItem>
                                ]
                            ) : (
                                // Guest Links
                                [
                                    <MenuItem key="login" onClick={handleCloseUserMenu} component={Link} href={route('login')}>
                                        <Typography textAlign="center">Log In</Typography>
                                    </MenuItem>,
                                    <MenuItem key="register" onClick={handleCloseUserMenu} component={Link} href={route('register')}>
                                        <Typography textAlign="center">Register</Typography>
                                    </MenuItem>
                                ]
                            )}
                        </Menu>
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    );
}

export default AppNavbar;
//
// <Toolbar disableGutters>
//     {/* 1. LEFT: Hamburger (Mobile) + Brand */}
//     <Box sx={{ display: 'flex', alignItems: 'center' }}>
//         <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
//             <IconButton onClick={handleOpenNavMenu} color="inherit">
//                 <MenuIcon />
//             </IconButton>
//         </Box>
//
//         <AdbIcon sx={{ display: 'flex', mr: 1, ml: { xs: 1, md: 0 } }} />
//         <Typography
//             variant="h6"
//             noWrap
//             component={Link}
//             href="/"
//             sx={{
//                 fontFamily: 'monospace',
//                 fontWeight: 700,
//                 letterSpacing: '.3rem',
//                 color: 'inherit',
//                 textDecoration: 'none',
//                 mr: 2
//             }}
//         >
//             SumerianIO
//         </Typography>
//     </Box>
//
//     {/* SPACER 1: Pushes the Desktop Links to the center/right */}
//     <Box sx={{ flexGrow: { xs: 1, md: 1 } }} />
//
//     {/* 2. MIDDLE: Desktop Navigation Links */}
//     <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
//         {pages.map((page) => (
//             <Button
//                 key={page}
//                 sx={{ my: 2, color: 'white', display: 'block' }}
//             >
//                 {page}
//             </Button>
//         ))}
//     </Box>
//
//     {/* SPACER 2: Pushes the Avatar to the far right on desktop */}
//     <Box sx={{ flexGrow: { xs: 0, md: 1 } }} />
//
//     {/* 3. RIGHT: Avatar / User Dropdown */}
//     <Box sx={{ flexGrow: 0 }}>
//         <Tooltip title="Open settings">
//             <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
//                 <Avatar alt={auth.user?.name} src={auth.user?.profile_photo_url} />
//             </IconButton>
//         </Tooltip>
//         {/* ... keep your User Menu code ... */}
//     </Box>
// </Toolbar>
