import * as React from 'react';
import { Head, Link, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/LoginRounded';

export interface RoleWelcomeCapability {
    icon: React.ReactNode;
    title: string;
    body: string;
}

export interface RoleWelcomeProps {
    /** Browser tab title. */
    title: string;
    /** Large heading, e.g. "Seller Desk". */
    heading: string;
    /** Icon shown beside the heading. */
    icon: React.ReactNode;
    /** Short tagline for the chip under the heading. */
    tagline: string;
    /** One or two sentences on who this portal is for. */
    description: string;
    /** Ziggy route name of this subdomain's login page, e.g. "seller.login". */
    loginRoute: string;
    /** What lives behind the login — three cards reads best. */
    capabilities: RoleWelcomeCapability[];
}

/** APP_NAME from .env, exposed to the client as VITE_APP_NAME. */
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Duka';

interface SharedAuthProps {
    auth?: { user: { first_name?: string; role?: string } | null };
    [key: string]: unknown;
}

/**
 * Public landing page for a role subdomain. Users who already hold the role
 * never see it — AllowSubdomainLogin sends them to /dashboard — so a signed-in
 * user here is on the wrong portal and is told so.
 */
export default function RoleWelcome({
    title,
    heading,
    icon,
    tagline,
    description,
    loginRoute,
    capabilities,
}: RoleWelcomeProps): React.ReactElement {
    const user = usePage<SharedAuthProps>().props.auth?.user ?? null;

    return (
        <>
            <Head title={title} />

            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 2,
                    py: 6,
                    bgcolor: 'background.default',
                    backgroundImage: 'radial-gradient(rgb(var(--on-surface) / 0.06) 1px, transparent 0)',
                    backgroundSize: '22px 22px',
                }}
            >
                <Box sx={{ width: '100%', maxWidth: 880 }}>
                    <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', mb: 4 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ color: 'primary.main', display: 'flex', '& svg': { fontSize: 34 } }}>
                                {icon}
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                                {heading}
                            </Typography>
                        </Stack>

                        <Chip label={`${APP_NAME} · ${tagline}`} size="small" />

                        <Typography sx={{ color: 'text.secondary', maxWidth: 560 }}>{description}</Typography>
                    </Stack>

                    {user && (
                        <Alert severity="info" sx={{ maxWidth: 560, mx: 'auto', mb: 3 }}>
                            You're signed in{user.role ? ` as ${user.role}` : ''}, which doesn't have access to
                            this portal. Log in with an account that does.
                        </Alert>
                    )}

                    <Stack direction="row" justifyContent="center" sx={{ mb: 5 }}>
                        <Button
                            component={Link}
                            href={route(loginRoute)}
                            variant="contained"
                            size="large"
                            disableElevation
                            startIcon={<LoginIcon />}
                            sx={{ fontWeight: 700, px: 4 }}
                        >
                            Log in
                        </Button>
                    </Stack>

                    <Box
                        sx={{
                            display: 'grid',
                            gap: 1.5,
                            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                        }}
                    >
                        {capabilities.map((capability) => (
                            <Paper
                                key={capability.title}
                                variant="outlined"
                                sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.paper' }}
                            >
                                <Box sx={{ color: 'primary.main', mb: 1 }}>{capability.icon}</Box>
                                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{capability.title}</Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {capability.body}
                                </Typography>
                            </Paper>
                        ))}
                    </Box>

                    <Typography
                        variant="caption"
                        sx={{ display: 'block', textAlign: 'center', color: 'text.disabled', mt: 4 }}
                    >
                        Accounts are issued by an administrator. Forgot your password?{' '}
                        <Link href="/forgot-password">Reset it here</Link>
                    </Typography>
                </Box>
            </Box>
        </>
    );
}
