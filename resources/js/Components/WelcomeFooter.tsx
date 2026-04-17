import { Link } from "@inertiajs/react";
import { Container, Box, Typography, IconButton, Divider } from "@mui/material";
import Grid from '@mui/material/Grid'; // Using Grid2 to solve "squiggly" issues in v6
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';

export default function WelcomeFooter() {
    return (
        <Box
            component="footer"
            sx={{
                bgcolor: '#1a120b',
                color: '#fdfbd4',
                pt: 10,
                pb: 4,
                borderTop: '2px solid #c05800',
                position: 'relative',
                zIndex: 30
            }}
        >
            {/* If 1337 was giving a squiggle, use 'lg' or a string '1337px' */}
            <Container sx={{ maxWidth: '1337px !important' }}>
                <Grid container spacing={8}>

                    {/* Brand & Mission */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: '#c05800', mb: 2, letterSpacing: 2 }}>
                            SEMIEN DEBUB
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', lineHeight: 1.8, mb: 3 }}>
                            The digital ledger of the modern age. We bridge the gap between
                            ancient commercial wisdom and future-proofed technology.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <SocialIcon Icon={FacebookIcon} />
                            <SocialIcon Icon={TwitterIcon} />
                            <SocialIcon Icon={LinkedInIcon} />
                        </Box>
                    </Grid>

                    {/* Quick Links */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Empire</FooterHeading>
                        <FooterLink href="/items">Inventory</FooterLink>
                        <FooterLink href="/sales">Commercial</FooterLink>
                        <FooterLink href="/balance">Operations</FooterLink>
                    </Grid>

                    {/* Resources */}
                    <Grid size={{ xs: 6, md: 2 }}>
                        <FooterHeading>Archive</FooterHeading>
                        <FooterLink href="/docs">Docs</FooterLink>
                        <FooterLink href="/api">API</FooterLink>
                        <FooterLink href="/support">Support</FooterLink>
                    </Grid>

                    {/* Newsletter */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <FooterHeading>Imperial Decree</FooterHeading>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                            Subscribe to receive the latest trade route updates.
                        </Typography>
                        <Box sx={{ display: 'flex', border: '1px solid #c05800', borderRadius: '4px', overflow: 'hidden' }}>
                            <input
                                type="text"
                                placeholder="Enter email..."
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '12px',
                                    color: '#fdfbd4',
                                    flex: 1,
                                    outline: 'none'
                                }}
                            />
                            <Box sx={{ bgcolor: '#c05800', px: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}>
                                JOIN
                            </Box>
                        </Box>
                    </Grid>
                </Grid>

                <Divider sx={{ my: 6, borderColor: 'rgba(192, 88, 0, 0.2)' }} />

                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#71717a', fontFamily: 'monospace' }}>
                        © 2026 SEMIEN DEBUB ENTERPRISE.
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
        <Typography variant="overline" sx={{ color: '#fdfbd4', fontWeight: 800, mb: 3, display: 'block', fontSize: '0.9rem' }}>
            {children}
        </Typography>
    );
}

function FooterLink({ children, href, small = false }: { children: React.ReactNode, href: string, small?: boolean }) {
    return (
        <Typography
            component={Link}
            href={href}
            sx={{
                display: 'block',
                color: '#a1a1aa',
                textDecoration: 'none',
                mb: small ? 0 : 1.5,
                fontSize: small ? '0.75rem' : '0.875rem',
                '&:hover': { color: '#c05800' }
            }}
        >
            {children}
        </Typography>
    );
}

function SocialIcon({ Icon }: { Icon: any }) {
    return (
        <IconButton sx={{ color: '#c05800', border: '1px solid rgba(192, 88, 0, 0.3)' }}>
            <Icon fontSize="small" />
        </IconButton>
    );
}
