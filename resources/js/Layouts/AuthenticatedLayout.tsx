import ApplicationLogo from "@/Components/Navigation/Global/ApplicationLogo";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import {
    AppBar,
    Avatar,
    Box,
    Button,
    Container,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Toolbar,
    Typography,
} from "@mui/material";
import { Link, router, usePage } from "@inertiajs/react";
import React, { useState } from "react";

interface AuthUser {
    name?: string;
    first_name?: string;
    email?: string;
}

interface AuthenticatedLayoutProps {
    header?: React.ReactNode;
    children: React.ReactNode;
}

export default function AuthenticatedLayout({
    header,
    children,
}: AuthenticatedLayoutProps) {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const user = auth?.user;
    const userName = user?.name || user?.first_name || "User";
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { label: "Dashboard", href: route("dashboard") },
        { label: "Contact", href: route("contact") },
    ];

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "grey.100",
                fontFamily: "Figtree, sans-serif",
            }}
        >
            <AppBar
                position="sticky"
                color="inherit"
                elevation={0}
                sx={{ borderBottom: "1px solid", borderColor: "divider" }}
            >
                <Container maxWidth="lg">
                    <Toolbar disableGutters sx={{ gap: 2 }}>
                        <IconButton
                            edge="start"
                            onClick={() => setMobileOpen(true)}
                            sx={{ display: { xs: "inline-flex", md: "none" } }}
                        >
                            <MenuRoundedIcon />
                        </IconButton>

                        <Box
                            component={Link}
                            href="/"
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                textDecoration: "none",
                                color: "text.primary",
                                gap: 1.5,
                            }}
                        >
                            <ApplicationLogo
                                className="h-9 w-9 fill-current"
                                style={{ color: "currentColor" }}
                            />
                            <Typography
                                variant="h6"
                                sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}
                            >
                                Duka
                            </Typography>
                        </Box>

                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{ display: { xs: "none", md: "flex" } }}
                        >
                            {navItems.map((item) => (
                                <Button
                                    key={item.label}
                                    component={Link}
                                    href={item.href}
                                    color="inherit"
                                    sx={{
                                        borderRadius: 3,
                                        textTransform: "none",
                                        fontWeight: 700,
                                    }}
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </Stack>

                        <Box sx={{ flexGrow: 1 }} />

                        <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                                sx={{
                                    textAlign: "right",
                                    display: { xs: "none", sm: "block" },
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    {userName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {user?.email || ""}
                                </Typography>
                            </Box>
                            <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)}>
                                <Avatar sx={{ width: 36, height: 36, borderRadius: 3 }}>
                                    {userName.charAt(0)}
                                </Avatar>
                            </IconButton>
                        </Stack>

                        <Menu
                            anchorEl={menuAnchor}
                            open={Boolean(menuAnchor)}
                            onClose={() => setMenuAnchor(null)}
                        >
                            <MenuItem
                                component={Link}
                                href={route("profile.edit")}
                                onClick={() => setMenuAnchor(null)}
                            >
                                Profile
                            </MenuItem>
                            <MenuItem
                                onClick={() => {
                                    setMenuAnchor(null);
                                    router.post(route("logout"));
                                }}
                            >
                                Log Out
                            </MenuItem>
                        </Menu>
                    </Toolbar>
                </Container>
            </AppBar>

            <Drawer
                anchor="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                PaperProps={{ sx: { width: 260 } }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                        Navigation
                    </Typography>
                    <List>
                        {navItems.map((item) => (
                            <ListItemButton
                                key={item.label}
                                component={Link}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                sx={{ borderRadius: 3 }}
                            >
                                <ListItemText primary={item.label} />
                            </ListItemButton>
                        ))}
                    </List>
                </Box>
            </Drawer>

            <Container maxWidth="lg" sx={{ py: 4 }}>
                {header ? (
                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            mb: 3,
                            borderRadius: 3,
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        {header}
                    </Paper>
                ) : null}

                <Box component="main">{children}</Box>
            </Container>
        </Box>
    );
}
