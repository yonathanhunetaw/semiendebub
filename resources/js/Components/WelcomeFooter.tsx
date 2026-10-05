import React from "react";
import { Link } from "@inertiajs/react";
import { Container, Box, Typography, IconButton, Divider } from "@mui/material";
import Grid from '@mui/material/Grid';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import TelegramIcon from '@mui/icons-material/Telegram';

export default function WelcomeFooter() {
    return (
        <Box
            component="footer"
            sx={{
                bgcolor: 'rgb(var(--surface-container-low))',
                color: 'text.primary',
                pt: 10,
                pb: 4,
                borderTop: '2px solid rgb(var(--primary))',
                position: 'relative',
                zIndex: 30
            }}
        >
            <Container sx={{ maxWidth: '1337px !important' }}>
                <Grid container spacing={8}>

                    {/* Brand & mission */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: 'primary.main', mb: 0.5, letterSpacing: 2 }}>
                            MEZGEBE DIRIJIT
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', letterSpacing: 1, mb: 2 }}>
                            መዝገበ ድርጅት · Business Registry
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.8, mb: 3 }}>
                            One registry for the whole company — stock, sales, procurement,
                            delivery, finance, people and every store you run, online and off.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <SocialIcon Icon={TelegramIcon} label="Telegram" />
                            <SocialIcon Icon={FacebookIcon} label="Facebook" />
                            <SocialIcon Icon={TwitterIcon} label="X" />
                            <SocialIcon Icon={LinkedInIcon} label="LinkedIn" />
                        </Box>
                    </Grid>

                    {/* Operations */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Operations</FooterHeading>
                        <FooterLink href="#inventory">Items & Stock</FooterLink>
                        <FooterLink href="#warehouses">Warehouses</FooterLink>
                        <FooterLink href="#procurement">Procurement</FooterLink>
                        <FooterLink href="#delivery">Delivery</FooterLink>
                    </Grid>

                    {/* Commerce */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Commerce</FooterHeading>
                        <FooterLink href="#sales">Sales</FooterLink>
                        <FooterLink href="#stores">Multi-Store</FooterLink>
                        <FooterLink href="#storefront">Online Store</FooterLink>
                        <FooterLink href="#finance">Finance</FooterLink>
                    </Grid>

                    {/* Company */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Company</FooterHeading>
                        <FooterLink href="#about">About</FooterLink>
                        <FooterLink href="#workforce">Attendance</FooterLink>
                        <FooterLink href="#marketing">Marketing & PR</FooterLink>
                        <FooterLink href="#roles">Roles & Access</FooterLink>
                    </Grid>

                    {/* Get started */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Get started</FooterHeading>
                        <FooterLink href={route('register')} inertia>Sign up</FooterLink>
                        <FooterLink href={route('login')} inertia>Log in</FooterLink>
                    </Grid>
                </Grid>

                <Divider sx={{ my: 6, borderColor: 'rgb(var(--primary) / 0.2)' }} />

                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgb(var(--outline))', fontFamily: 'monospace' }}>
                        © {new Date().getFullYear()} MEZGEBE DIRIJIT · ERP FOR GROWING COMPANIES
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                        <FooterLink href="#" small>Privacy</FooterLink>
                        <FooterLink href="#" small>Terms</FooterLink>
                    </Box>
                </Box>
            </Container>
        </Box>
    );
}

/* --- HELPER COMPONENTS --- */

function FooterHeading({ children }: { children: React.ReactNode }) {
    return (
        <Typography variant="overline" sx={{ color: 'text.primary', fontWeight: 800, mb: 3, display: 'block', fontSize: '0.9rem' }}>
            {children}
        </Typography>
    );
}

interface FooterLinkProps {
    children: React.ReactNode;
    href: string;
    /** Use Inertia's router instead of a plain anchor (for real routes, not page anchors). */
    inertia?: boolean;
    small?: boolean;
}

function FooterLink({ children, href, inertia = false, small = false }: FooterLinkProps) {
    return (
        <Typography
            component={inertia ? Link : 'a'}
            href={href}
            sx={{
                display: 'block',
                color: 'text.secondary',
                textDecoration: 'none',
                mb: small ? 0 : 1.5,
                fontSize: small ? '0.75rem' : '0.875rem',
                '&:hover': { color: 'primary.main' }
            }}
        >
            {children}
        </Typography>
    );
}

function SocialIcon({ Icon, label }: { Icon: React.ElementType, label: string }) {
    return (
        <IconButton aria-label={label} sx={{ color: 'primary.main', border: '1px solid rgb(var(--primary) / 0.3)' }}>
            <Icon fontSize="small" />
        </IconButton>
    );
}
